const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

// A minimal localStorage and a clock the tests can move.
class MemoryStorage {
  constructor() { this.map = new Map(); }
  get length() { return this.map.size; }
  key(i) { return [...this.map.keys()][i] ?? null; }
  getItem(k) { return this.map.has(k) ? this.map.get(k) : null; }
  setItem(k, v) { this.map.set(k, String(v)); }
  removeItem(k) { this.map.delete(k); }
  clear() { this.map.clear(); }
}

const RealDate = Date;
let fakeNow = RealDate.now();
class FakeDate extends RealDate {
  constructor(...args) { if (args.length) super(...args); else super(fakeNow); }
  static now() { return fakeNow; }
}
const setNow = iso => { fakeNow = new RealDate(iso).getTime(); };

globalThis.Date = FakeDate;
globalThis.localStorage = new MemoryStorage();
globalThis.fetch = async () => ({ ok: false, json: async () => null });

let wrapped;
test.before(async () => {
  wrapped = await import(pathToFileURL(path.join(__dirname, "../build/assets/wrapped.mjs")).href);
});
test.after(() => { globalThis.Date = RealDate; });
test.beforeEach(() => localStorage.clear());

const song = (id, era) => ({ id, title: id, display: id, era });
function playRound(mode, s, status, tries = 1) {
  const key = `yeatle:round:${mode}`;
  const playing = JSON.stringify({ songId: s.id, song: s, attempts: [], status: "playing" });
  const attempts = Array.from({ length: tries }, (_, i) => ({ kind: i === tries - 1 && status === "won" ? "right" : "wrong" }));
  const done = JSON.stringify({ songId: s.id, song: s, attempts, status, stars: status === "won" ? 3 : 0 });
  wrapped._test.onRoundSaved({ key, before: null, value: playing });
  wrapped._test.onRoundSaved({ key, before: playing, value: done });
  // the game saves the finished round again; that must not count twice
  wrapped._test.onRoundSaved({ key, before: done, value: done });
  wrapped._test.commitPending(key);
}

test("Wrapped is viewable from November 16 through January 7, every year", () => {
  assert.equal(wrapped.wrappedYear(new RealDate(2026, 10, 15, 23, 59)), null);
  assert.equal(wrapped.wrappedYear(new RealDate(2026, 10, 16, 0, 0)), 2026);
  assert.equal(wrapped.wrappedYear(new RealDate(2026, 10, 30, 12, 0)), 2026);
  assert.equal(wrapped.wrappedYear(new RealDate(2026, 11, 1, 0, 0)), 2026);
  assert.equal(wrapped.wrappedYear(new RealDate(2026, 11, 31, 23, 59)), 2026);
  assert.equal(wrapped.wrappedYear(new RealDate(2027, 0, 7, 23, 59)), 2026);
  assert.equal(wrapped.wrappedYear(new RealDate(2027, 0, 8, 0, 0)), null);
  assert.equal(wrapped.wrappedYear(new RealDate(2031, 11, 5)), 2031);
  assert.equal(wrapped.wrappedYear(new RealDate(2031, 5, 5)), null);
});

test("a finished round is recorded once, and only in the year it was played", () => {
  setNow("2026-12-20T15:00:00");
  wrapped._test.refresh();
  playRound("stems", song("a", "2093"), "won", 1);
  setNow("2027-01-03T15:00:00");
  wrapped._test.refresh();
  playRound("stems", song("b", "Lyfe"), "won", 2);

  const y2026 = wrapped._test.summarize(2026);
  const y2027 = wrapped._test.summarize(2027);
  assert.equal(y2026.modes.stems.p, 1);
  assert.equal(y2026.topEras[0].name, "2093");
  assert.equal(y2026.firstTry, 1);
  assert.equal(y2027.modes.stems.p, 1);
  assert.equal(y2027.topEras[0].name, "Lyfe");
  assert.equal(y2027.firstTry, 0);
});

test("saved totals count towards the launch year only, then each year counts its own growth", () => {
  setNow("2026-11-20T12:00:00");
  localStorage.setItem("yeatle:stats", JSON.stringify({ songsAttempted: 50, correctlyGuessed: 40, totalStars: 100 }));
  wrapped._test.refresh();
  assert.equal(wrapped._test.summarize(2026).rounds, 50);

  setNow("2027-02-01T12:00:00");
  localStorage.setItem("yeatle:stats", JSON.stringify({ songsAttempted: 60, correctlyGuessed: 45, totalStars: 110 }));
  wrapped._test.refresh();
  assert.equal(wrapped._test.summarize(2027).rounds, 10);
  assert.equal(wrapped._test.summarize(2027).solved, 5);
  assert.equal(wrapped._test.summarize(2026).rounds, 50, "last year stays frozen");
});

test("Daily results are counted by their own date, including ones from before Wrapped", () => {
  setNow("2026-12-10T12:00:00");
  for (const [date, status, n] of [["2026-12-01", "won", 1], ["2026-12-02", "won", 3], ["2026-12-03", "lost", 6], ["2026-12-05", "won", 2], ["2027-01-02", "won", 1]]) {
    localStorage.setItem(`yeatle:daily:${date}`, JSON.stringify({ id: date, status, attempts: Array(n).fill({ kind: "wrong" }) }));
  }
  const s = wrapped._test.summarize(2026);
  assert.equal(s.daily.played, 4);
  assert.equal(s.daily.won, 3);
  assert.equal(s.daily.streak, 3);
  assert.equal(s.daily.firstTry, 1);
});

test("next year compares with an archived summary of last year", () => {
  setNow("2026-12-15T21:00:00");
  wrapped._test.refresh();
  playRound("snippet", song("nemesis", "Alive"), "lost", 6);
  playRound("snippet", song("x", "Alive"), "won", 2);
  setNow("2027-12-10T21:00:00");
  wrapped._test.refresh();
  wrapped._test.archiveFinishedYears();
  playRound("snippet", song("nemesis", "Alive"), "won", 3);
  playRound("snippet", song("y", "2093"), "won", 1);

  const archive = JSON.parse(localStorage.getItem("yeatle:wrapped:archive:2026"));
  assert.equal(archive.final, true);
  assert.deepEqual(archive.lost, ["nemesis"]);
  const s = wrapped._test.summarize(2027);
  assert.equal(s.prev.year, 2026);
  assert.deepEqual(s.redemptions, ["nemesis"]);
  assert.equal(s.yearsPlayed, 2);
  assert.equal(s.discoveries, 2, "y and nemesis were solved for the first time in 2027");
});

test("the copied text stays short enough not to flood a chat", () => {
  setNow("2026-12-15T21:00:00");
  wrapped._test.refresh();
  for (let i = 0; i < 30; i++) playRound("stems", song(`s${i}`, i % 2 ? "2093" : "Afterlyfe"), i % 3 ? "won" : "lost", 1);
  const text = wrapped.shareText(wrapped._test.summarize(2026));
  const lines = text.split("\n");
  assert.ok(lines.length <= 6, text);
  assert.ok(text.length <= 220, text);
  assert.equal(lines[0], "Yeatle Wrapped 2026");
  assert.doesNotMatch(text, /\p{Extended_Pictographic}/u, "no emoji in Wrapped");
});

test("Karaoke runs recorded through the event count for the year", () => {
  setNow("2026-12-15T21:00:00");
  wrapped._test.recordKaraoke({ song: song("k1", "2093"), score: 81234, accuracy: 0.9 });
  wrapped._test.recordKaraoke({ song: song("k1", "2093"), score: 90000, accuracy: 0.95 });
  const s = wrapped._test.summarize(2026);
  assert.equal(s.karaoke.runs, 2);
  assert.equal(s.karaoke.best.best, 90000);
  assert.equal(s.karaoke.best.acc, 95);
});
