function createActiveSongFeed({ heartbeatMs = 25000 } = {}) {
  const clients = new Set();
  const payload = value => `data: ${JSON.stringify(value)}\n\n`;
  function stop(res) { clients.delete(res); if (!res.destroyed && !res.writableEnded) res.end(); }
  function subscribe(req, res, value) {
    res.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-store",
      "Connection": "keep-alive", "X-Accel-Buffering": "no"
    });
    res.flushHeaders?.();
    res.write(`retry: 3000\n\n${payload(value)}`);
    clients.add(res);
    const heartbeat = setInterval(() => {
      if (res.destroyed || res.writableEnded || !res.write(": heartbeat\n\n")) stop(res);
    }, heartbeatMs);
    heartbeat.unref?.();
    res.once("close", () => { clearInterval(heartbeat); clients.delete(res); });
    res.on("error", () => stop(res));
  }
  function publish(value) {
    const data = payload(value);
    for (const res of clients) if (res.destroyed || res.writableEnded || !res.write(data)) stop(res);
  }
  return { subscribe, publish, get size() { return clients.size; } };
}
module.exports = { createActiveSongFeed };
