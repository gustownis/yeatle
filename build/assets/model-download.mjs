// A known-size model can be filled directly instead of retaining every chunk
// and then copying the entire download into another buffer.
export async function readModelResponse(response, onProgress = () => {}) {
  const length = Number(response.headers.get("content-length"));
  const encoding = response.headers.get("content-encoding");
  const expected = (!encoding || encoding === "identity") && Number.isSafeInteger(length) && length > 0 && length <= 256 * 1024 * 1024 ? length : 0;
  const buffer = expected ? new Uint8Array(expected) : null;
  const chunks = [];
  const reader = response.body.getReader();
  let received = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (buffer) {
        if (received + value.byteLength > expected) throw new Error("The model download is larger than its declared size.");
        buffer.set(value, received);
      } else chunks.push(value);
      received += value.byteLength;
      onProgress(value.byteLength, expected);
    }
    if (buffer && received !== expected) throw new Error("The model download is incomplete. Try again.");
    if (buffer) return buffer;
    const combined = new Uint8Array(received);
    let offset = 0;
    for (const chunk of chunks) { combined.set(chunk, offset); offset += chunk.byteLength; }
    return combined;
  } catch (error) {
    try { await reader.cancel(); } catch (_) { /* the stream may already have failed */ }
    throw error;
  } finally { reader.releaseLock(); }
}
