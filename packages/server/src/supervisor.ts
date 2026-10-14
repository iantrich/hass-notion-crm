import { existsSync, readFileSync } from "node:fs";
import { hostname } from "node:os";

// Talking to Home Assistant through the Supervisor.
//
// s6-overlay resets the container environment before our process starts, so
// nothing Supervisor provides can be read from process.env reliably (the
// spike proved this for both SUPERVISOR_TOKEN and HOSTNAME).

const S6_ENV_DIR = "/run/s6/container_environment";
const CORE_API = "http://supervisor/core/api";

export function supervisorToken(env: NodeJS.ProcessEnv = process.env, s6EnvDir = S6_ENV_DIR): string | null {
  if (env.SUPERVISOR_TOKEN) return env.SUPERVISOR_TOKEN;
  const file = `${s6EnvDir}/SUPERVISOR_TOKEN`;
  return existsSync(file) ? readFileSync(file, "utf8").trim() || null : null;
}

// Apps from a custom repository get a slug with a repository-hash prefix
// ("33991357_thread") that changes if the repository URL does. Supervisor
// names the container's host after the slug with "_" swapped for "-".
export function appSlug(host = hostname()): string {
  return host.replace(/-/g, "_");
}

// Where a notification tap should land: the app's panel.
export function panelPath(slug = appSlug()): string {
  return `/app/${slug}`;
}

export class SupervisorClient {
  constructor(
    private readonly token: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private async request(path: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${this.token}`);
    headers.set("Content-Type", "application/json");
    const response = await this.fetchImpl(`${CORE_API}${path}`, { ...init, headers });
    if (!response.ok) {
      // Core's errors are terse ("400: Bad Request"), so keep the body.
      const detail = (await response.text()).slice(0, 200);
      throw new Error(`Home Assistant ${path} returned ${response.status}: ${detail}`);
    }
    return response;
  }

  // HA's configured time zone, which notification times and "today" use.
  async timeZone(): Promise<string> {
    const config = (await (await this.request("/config")).json()) as { time_zone?: unknown };
    if (typeof config.time_zone !== "string" || !config.time_zone) {
      throw new Error("Home Assistant config has no time_zone");
    }
    return config.time_zone;
  }

  // The real notify.mobile_app_* services, to show on the setup screen.
  async mobileAppServices(): Promise<string[]> {
    const domains = (await (await this.request("/services")).json()) as {
      domain: string;
      services: Record<string, unknown>;
    }[];
    const notify = domains.find((d) => d.domain === "notify");
    return Object.keys(notify?.services ?? {}).filter((name) => name.startsWith("mobile_app_"));
  }

  async notify(target: string, message: { title: string; message: string; data?: Record<string, unknown> }) {
    await this.request(`/services/notify/${encodeURIComponent(target)}`, {
      method: "POST",
      body: JSON.stringify(message),
    });
  }
}
