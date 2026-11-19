function createActiveSongFeed({ heartbeatMs = 25000, maxClients = 1000 } = {}) {
  const clients = new Map();
  const payload = value => `data: ${JSON.stringify(value)}\n\n`;
  function stop(res) {
    const heartbeat = clients.get(res);
    if (heartbeat) clearInterval(heartbeat);
    clients.delete(res);
    if (!res.destroyed && !res.writableEnded) res.end();
  }
  function subscribe(req, res, value) {
    if (clients.size >= maxClients) {
      res.writeHead(503, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" });
      res.end("Too many live listeners.");
      return;
    }
    res.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-store",
      "Connection": "keep-alive", "X-Accel-Buffering": "no"
    });
    res.flushHeaders?.();
    res.write(`retry: 3000\n\n${payload(value)}`);
    const heartbeat = setInterval(() => {
      if (res.destroyed || res.writableEnded || !res.write(": heartbeat\n\n")) stop(res);
    }, heartbeatMs);
    heartbeat.unref?.();
    clients.set(res, heartbeat);
    res.once("close", () => stop(res));
    res.on("error", () => stop(res));
  }
  function publish(value) {
    const data = payload(value);
    for (const res of [...clients.keys()]) if (res.destroyed || res.writableEnded || !res.write(data)) stop(res);
  }
  return { subscribe, publish, get size() { return clients.size; } };
}
module.exports = { createActiveSongFeed };
