import http from "node:http";
import { readFileSync } from "node:fs";

const INGRESS_PROXY = "172.30.32.2";
const PORT = 8099;
const DEV = process.env.THREAD_DEV === "1";

function options() {
  try {
    return JSON.parse(readFileSync("/data/options.json", "utf8"));
  } catch {
    return { allowed_user_ids: [], notify_targets: [] };
  }
}

function peerAllowed(req) {
  if (DEV) return true;
  // Node reports IPv4 peers as IPv4-mapped IPv6 on dual-stack sockets.
  const peer = (req.socket.remoteAddress ?? "").replace(/^::ffff:/, "");
  return peer === INGRESS_PROXY;
}

const escapeHtml = (value) =>
  String(value).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function send(res, status, type, body) {
  res.writeHead(status, {
    "Content-Type": type,
    "Content-Security-Policy": "default-src 'self'; style-src 'self' 'unsafe-inline'",
    "Cache-Control": "no-store",
  });
  res.end(body);
}

async function notify(target, url) {
  const response = await fetch(
    `http://supervisor/core/api/services/notify/${encodeURIComponent(target)}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.SUPERVISOR_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: "Thread spike",
        message: `Tap to test url=${url}`,
        data: { url, group: "thread-spike" },
      }),
    },
  );
  return response.status;
}

const page = (userId, ingressPath, allowed) => `<!doctype html>
<html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Thread spike</title>
<style>
  body { font: 16px system-ui; margin: 16px; background: #111; color: #eee; }
  a, button { display: block; margin: 10px 0; padding: 12px; background: #333;
              color: #fff; border-radius: 8px; text-decoration: none; border: 0;
              font: inherit; width: 100%; text-align: left; }
  code { word-break: break-all; }
</style></head><body>
<h1>Thread spike</h1>
<p>Your HA user ID: <code>${escapeHtml(userId ?? "(none)")}</code></p>
<p>Ingress path: <code>${escapeHtml(ingressPath ?? "(none)")}</code></p>
<p>Allowed: <b>${allowed ? "yes" : "no"}</b></p>
<h2>Contact links (target=_top)</h2>
<a href="tel:+15555550123" target="_top">tel: (fake number)</a>
<a href="sms:+15555550123" target="_top">sms: (fake number)</a>
<a href="mailto:test@example.com" target="_top">mailto:</a>
<a href="https://maps.apple.com/?ll=41.2565,-95.9345&q=Omaha" target="_top">Apple Maps</a>
<h2>Contact links (no target)</h2>
<a href="tel:+15555550123">tel: (fake number)</a>
<a href="sms:+15555550123">sms: (fake number)</a>
<h2>Notification tap URL</h2>
<form method="post" action="notify"><input type="hidden" name="url" value="/hassio/ingress/thread">
  <button>Send with /hassio/ingress/thread</button></form>
<form method="post" action="notify"><input type="hidden" name="url" value="/app/thread">
  <button>Send with /app/thread</button></form>
<form method="post" action="notify"><input type="hidden" name="url" value="/config/app/thread/info">
  <button>Send with /config/app/thread/info (control)</button></form>
</body></html>`;

http
  .createServer(async (req, res) => {
    if (!peerAllowed(req)) return send(res, 403, "text/plain", "Forbidden");

    const userId = req.headers["x-remote-user-id"];
    const ingressPath = req.headers["x-ingress-path"];
    const { allowed_user_ids, notify_targets } = options();
    const allowed = typeof userId === "string" && allowed_user_ids.includes(userId);

    if (req.method === "GET" && (req.url === "/" || req.url === "")) {
      return send(res, 200, "text/html; charset=utf-8", page(userId, ingressPath, allowed));
    }

    if (req.method === "POST" && req.url === "/notify") {
      if (!allowed) return send(res, 403, "text/plain", "User not in allowed_user_ids");
      let body = "";
      for await (const chunk of req) body += chunk;
      const url = new URLSearchParams(body).get("url") ?? "/";
      const results = await Promise.all(
        notify_targets.map(async (t) => `${t}: ${await notify(t, url)}`),
      );
      return send(res, 200, "text/plain", results.join("\n") || "No notify_targets configured");
    }

    send(res, 404, "text/plain", "Not found");
  })
  .listen(PORT, () => console.log(`spike listening on ${PORT}`));
