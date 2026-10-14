import http from "node:http";
import { existsSync, readFileSync } from "node:fs";

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

// Apps from a custom repository get a slug prefixed with a repository hash
// (e.g. "a1b2c3d4_thread"). Supervisor names the container's host after it,
// with "_" swapped for "-", so the full slug can be recovered from HOSTNAME.
const APP_SLUG = (process.env.HOSTNAME ?? "thread").replace(/-/g, "_");

// s6-overlay resets the environment for the container's CMD, so the token the
// Supervisor injects may only be readable from s6's saved copy.
const S6_TOKEN_FILE = "/run/s6/container_environment/SUPERVISOR_TOKEN";

function supervisorToken() {
  if (process.env.SUPERVISOR_TOKEN) return { token: process.env.SUPERVISOR_TOKEN, source: "env" };
  if (existsSync(S6_TOKEN_FILE)) {
    return { token: readFileSync(S6_TOKEN_FILE, "utf8").trim(), source: "s6 file" };
  }
  return { token: undefined, source: "missing" };
}

async function notify(target, url) {
  // Accept "notify.mobile_app_x" as well as "mobile_app_x": the prefixed form
  // is how HA displays the service, so it's the natural thing to paste.
  const service = target.replace(/^notify\./, "");
  const { token } = supervisorToken();
  if (!token) return "no SUPERVISOR_TOKEN";
  const response = await fetch(
    `http://supervisor/core/api/services/notify/${encodeURIComponent(service)}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: "Thread spike",
        message: `Tap to test url=${url}`,
        data: { url, group: "thread-spike" },
      }),
    },
  );
  if (response.ok) return `${response.status}`;
  const detail = (await response.text()).slice(0, 200);
  return `${response.status} ${detail}`;
}

// The notify services HA actually has, so notify_targets can be copied rather
// than guessed: Core answers a misnamed service with a bare 400.
async function mobileAppServices() {
  const { token } = supervisorToken();
  if (!token) return ["(no token)"];
  try {
    const response = await fetch("http://supervisor/core/api/services", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) return [`(services lookup failed: ${response.status})`];
    const domains = await response.json();
    const notify = domains.find((d) => d.domain === "notify");
    const names = Object.keys(notify?.services ?? {}).filter((n) => n.startsWith("mobile_app_"));
    return names.length ? names : ["(none found)"];
  } catch (error) {
    return [`(services lookup failed: ${error.message})`];
  }
}

const SPIKE_JS = `
document.addEventListener("click", (event) => {
  const el = event.target.closest("[data-mode]");
  if (!el) return;
  event.preventDefault();
  const url = el.dataset.url;
  switch (el.dataset.mode) {
    case "open": window.open(url, "_blank"); break;
    case "top": window.top.location.href = url; break;
    case "self": window.location.href = url; break;
    case "copy":
      navigator.clipboard.writeText(url.replace(/^tel:|^sms:/, ""))
        .then(() => { el.textContent = "Copied"; },
              (err) => { el.textContent = "Copy failed: " + err; });
      break;
  }
});
`;

const page = (userId, ingressPath, allowed, services) => `<!doctype html>
<html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Thread spike</title>
<script src="spike.js" defer></script>
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
<p>App slug: <code>${escapeHtml(APP_SLUG)}</code></p>
<p>Supervisor token: <b>${escapeHtml(supervisorToken().source)}</b></p>
<p>Mobile app notify services (use one of these in notify_targets):</p>
<ul>${services.map((n) => `<li><code>${escapeHtml(n)}</code></li>`).join("")}</ul>
<h2>Contact links (target=_top)</h2>
<a href="tel:+15555550123" target="_top">tel: (fake number)</a>
<a href="sms:+15555550123" target="_top">sms: (fake number)</a>
<a href="mailto:test@example.com" target="_top">mailto:</a>
<a href="https://maps.apple.com/?ll=41.2565,-95.9345&q=Omaha" target="_top">Apple Maps</a>
<h2>Contact links (no target)</h2>
<a href="tel:+15555550123">tel: (fake number)</a>
<a href="sms:+15555550123">sms: (fake number)</a>
<h2>Contact links (target=_blank)</h2>
<a href="tel:+15555550123" target="_blank">tel: _blank</a>
<a href="sms:+15555550123" target="_blank">sms: _blank</a>
<a href="mailto:test@example.com" target="_blank">mailto: _blank</a>
<h2>Contact links (JavaScript)</h2>
<button data-mode="open" data-url="tel:+15555550123">tel: window.open</button>
<button data-mode="top" data-url="tel:+15555550123">tel: window.top.location</button>
<button data-mode="self" data-url="tel:+15555550123">tel: window.location</button>
<button data-mode="open" data-url="sms:+15555550123">sms: window.open</button>
<button data-mode="top" data-url="sms:+15555550123">sms: window.top.location</button>
<button data-mode="top" data-url="mailto:test@example.com">mailto: window.top.location</button>
<button data-mode="copy" data-url="tel:+15555550123">Copy number (fallback)</button>
<h2>Notification tap URL</h2>
${[`/app/${APP_SLUG}`, `/hassio/ingress/${APP_SLUG}`, `/config/app/${APP_SLUG}/info`]
  .map((url) => `<form method="post" action="notify"><input type="hidden" name="url" value="${escapeHtml(url)}">
  <button>Send with ${escapeHtml(url)}</button></form>`)
  .join("\n")}
</body></html>`;

http
  .createServer(async (req, res) => {
    if (!peerAllowed(req)) return send(res, 403, "text/plain", "Forbidden");

    const userId = req.headers["x-remote-user-id"];
    const ingressPath = req.headers["x-ingress-path"];
    const { allowed_user_ids, notify_targets } = options();
    const allowed = typeof userId === "string" && allowed_user_ids.includes(userId);

    if (req.method === "GET" && (req.url === "/" || req.url === "")) {
      return send(res, 200, "text/html; charset=utf-8", page(userId, ingressPath, allowed, await mobileAppServices()));
    }

    if (req.method === "GET" && req.url === "/spike.js") {
      return send(res, 200, "text/javascript; charset=utf-8", SPIKE_JS);
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
  .listen(PORT, () =>
    console.log(`spike listening on ${PORT}; supervisor token: ${supervisorToken().source}`),
  );
