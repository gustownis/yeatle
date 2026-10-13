const DB_NAME = "yeatle-generated-stems-v1";
const MAX_BYTES = 192 * 1024 * 1024;
const MAX_ENTRY_BYTES = 100 * 1024 * 1024;
const CHUNK_SAMPLES = 512 * 1024;
const STEMS = ["drums", "bass", "other"];
let database;

export function canCacheStems(context) {
  // Some privacy settings perturb audio reads in place. Caching through those
  // APIs would modify live samples and persist different values on each read.
  try {
    const input = new Float32Array(1024).fill(0.25);
    const probe = context.createBuffer(1, input.length, context.sampleRate || 44100);
    probe.copyToChannel(input, 0);
    const first = probe.getChannelData(0).slice();
    const second = probe.getChannelData(0);
    return first.every((value, index) => value === input[index] && second[index] === input[index]);
  } catch (_) { return false; }
}

function open() {
  if (!globalThis.indexedDB) return Promise.resolve(null);
  return database || (database = new Promise(resolve => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore("entries", { keyPath: "key" });
      const chunks = request.result.createObjectStore("chunks", { keyPath: "id" });
      chunks.createIndex("owner", "owner");
    };
    request.onsuccess = () => { const db = request.result; db.onversionchange = () => { db.close(); database = null; }; resolve(db); };
    request.onerror = request.onblocked = () => { database = null; resolve(null); };
  }));
}

function transaction(db, stores, mode, execute) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(stores, mode); let result;
    tx.oncomplete = () => resolve(result);
    tx.onerror = tx.onabort = () => reject(tx.error || new Error("Stem cache transaction failed"));
    execute(tx, value => { result = value; });
  });
}

function erase(tx, key) {
  tx.objectStore("entries").delete(key);
  const request = tx.objectStore("chunks").index("owner").openKeyCursor(IDBKeyRange.only(key));
  request.onsuccess = () => { const cursor = request.result; if (cursor) { tx.objectStore("chunks").delete(cursor.primaryKey); cursor.continue(); } };
}

export async function hashAudio(bytes) {
  if (!globalThis.crypto?.subtle) return null;
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, "0")).join("");
}

export function stemCacheKey(audioHash, modelRevision, sampleRate) {
  if (!audioHash || !modelRevision) return null;
  // Include the decoder/browser identity; all stored samples remain float32.
  return `signal-v1:${sampleRate}:${modelRevision}:${globalThis.navigator?.userAgent || ""}:${audioHash}`;
}

async function discard(db, key) {
  try { await transaction(db, ["entries", "chunks"], "readwrite", tx => erase(tx, key)); } catch (_) {}
  return false;
}

export async function loadStems(key, buffers, total, isCancelled = () => false) {
  if (!key) return false;
  try {
    const db = await open(); if (!db) return false;
    const meta = await transaction(db, ["entries"], "readonly", (tx, done) => {
      const request = tx.objectStore("entries").get(key); request.onsuccess = () => done(request.result);
    });
    if (!meta?.complete) return false;
    if (meta.total !== total || meta.bytes !== total * STEMS.length * 4 || meta.chunks !== Math.ceil(total / CHUNK_SAMPLES)) return discard(db, key);
    for (let index = 0; index < meta.chunks; index++) {
      if (isCancelled()) return false;
      const chunk = await transaction(db, ["chunks"], "readonly", (tx, done) => {
        const request = tx.objectStore("chunks").get(`${key}:${index}`); request.onsuccess = () => done(request.result);
      });
      const from = index * CHUNK_SAMPLES, length = Math.min(CHUNK_SAMPLES, total - from);
      if (isCancelled()) return false;
      if (!chunk || STEMS.some(stem => !(chunk.stems[stem] instanceof Float32Array) || chunk.stems[stem].length !== length || !chunk.stems[stem].every(Number.isFinite))) return discard(db, key);
      for (const stem of STEMS) buffers[stem].copyToChannel(chunk.stems[stem], 0, from);
    }
    await transaction(db, ["entries"], "readwrite", tx => {
      const store = tx.objectStore("entries"), request = store.get(key);
      request.onsuccess = () => { if (request.result?.complete) store.put({ ...request.result, lastUsed: Date.now() }); };
    });
    return true;
  } catch (_) { return false; }
}

export async function saveStems(key, buffers, total, isCancelled = () => false) {
  const bytes = total * STEMS.length * 4;
  if (!key || !total || bytes > MAX_ENTRY_BYTES) return false;
  let db;
  try {
    db = await open(); if (!db) return false;
    const now = Date.now();
    const reservation = await transaction(db, ["entries", "chunks"], "readwrite", (tx, done) => {
      const request = tx.objectStore("entries").getAll();
      request.onsuccess = () => {
        const entries = request.result;
        const existing = entries.find(entry => entry.key === key);
        if (existing?.complete) { done("exists"); return; }
        if (existing && now - existing.lastUsed < 3600000) { done(false); return; }
        let used = entries.filter(entry => entry.key !== key).reduce((sum, entry) => sum + entry.bytes, 0);
        for (const entry of entries.filter(entry => entry.key !== key && (entry.complete || now - entry.lastUsed > 3600000)).sort((a, b) => a.lastUsed - b.lastUsed)) {
          if (used + bytes <= MAX_BYTES) break;
          erase(tx, entry.key); used -= entry.bytes;
        }
        if (used + bytes > MAX_BYTES) { done(false); return; }
        if (existing) erase(tx, key);
        tx.objectStore("entries").put({ key, total, bytes, chunks: Math.ceil(total / CHUNK_SAMPLES), complete: false, lastUsed: now });
        done(true);
      };
    });
    if (reservation === "exists") return true;
    if (!reservation) return false;
    // Each transaction copies at most 6 MiB, avoiding a second whole-song copy.
    for (let index = 0; index < Math.ceil(total / CHUNK_SAMPLES); index++) {
      if (isCancelled()) throw new Error("Stem cache save cancelled");
      const from = index * CHUNK_SAMPLES, to = Math.min(total, from + CHUNK_SAMPLES);
      const stems = Object.fromEntries(STEMS.map(stem => [stem, buffers[stem].getChannelData(0).slice(from, to)]));
      await transaction(db, ["chunks"], "readwrite", tx => { tx.objectStore("chunks").put({ id: `${key}:${index}`, owner: key, stems }); });
    }
    await transaction(db, ["entries"], "readwrite", tx => { tx.objectStore("entries").put({ key, total, bytes, chunks: Math.ceil(total / CHUNK_SAMPLES), complete: true, lastUsed: now }); });
    return true;
  } catch (_) {
    if (db) try { await transaction(db, ["entries", "chunks"], "readwrite", tx => erase(tx, key)); } catch (_) {}
    return false;
  }
}
