# Spike results

Run on Ian's Home Assistant OS install with the iOS Companion app, using spike
versions 0.0.1–0.0.6 (2026-10-14).

| Question | Result |
|---|---|
| Loads through ingress in the Companion app sidebar, with relative URLs | **Yes** |
| `X-Remote-User-Id` arrives and gates `/notify` | **Yes**. The page shows the ID, and sends are refused until it's in `allowed_user_ids` |
| Contact links from the ingress iframe on iOS | **Only `target="_blank"` works** for `tel:`, `sms:` and `mailto:`. Plain links and `target="_top"` do nothing in the Companion app. `https://maps.apple.com/` works either way. Every variant works in desktop browsers. |
| Notification tap URL that opens the panel | **`/app/<full slug>`**, e.g. `/app/33991357_thread`. `/hassio/ingress/<slug>` gives a 404, and `/config/app/<slug>/info` opens the app's settings page. |
| Non-allowlisted user refused | Not tested yet (needs a second HA user) |

## Findings that change the design

1. **s6-overlay wipes the container environment** before the app's `CMD` runs.
   - `SUPERVISOR_TOKEN` is missing from `process.env`. Read it from
     `/run/s6/container_environment/SUPERVISOR_TOKEN`. That was the cause of
     the first `401`.
   - `HOSTNAME` is missing too. Read the kernel hostname (`os.hostname()`)
     instead.
   - Rule for the real server: never rely on `process.env` for anything
     Supervisor provides.
2. **The app slug is prefixed with a repository hash** (`33991357_thread`).
   The prefix comes from the repository URL, so it can change if the
   repository is re-added under a different URL (for example, without a
   `#branch` suffix). Work it out at runtime from the hostname (Supervisor
   uses the slug with `_` → `-`), and never hard-code it.
3. **`notify_targets` gets pasted with the `notify.` prefix.** That's how HA
   displays the service. Core answers an unknown service with a bare
   `400: Bad Request`, so strip a leading `notify.`.
4. **Core API errors are terse.** Surface the response body, and list the
   real `mobile_app_*` services on the setup screen. Both helped here.
