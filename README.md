# hass-notion-crm

Thread, a personal CRM backed by Notion, packaged as a Home Assistant app
(formerly called an add-on). It is reachable only through Home Assistant
ingress, so your HA login protects it, and the Notion token never leaves the
app's backend.

> **Status:** early spike. The app currently serves a test page used to verify
> ingress, user identity, contact links, and notification taps on a real
> Home Assistant install. See `docs/spike-results.md` once it exists.

## Install

1. In Home Assistant, go to **Settings → Apps → App store**, open the **⋮**
   menu, and choose **Repositories**.
2. Add `https://github.com/iantrich/hass-notion-crm`.
3. Install **Thread**, then start it.

Configuration is documented in [`thread/DOCS.md`](thread/DOCS.md).

Requires Home Assistant OS or a Supervised install.

## Development

The app is a TypeScript monorepo (Node 22):

| Package | Contents |
|---|---|
| `packages/core` | Domain logic ported from the iOS app: models, Notion decoding and mapping, ordering, search, contact status and actions, and the daily notifications. Pure functions, no I/O. |

```bash
npm install
npm run typecheck && npm run lint && npm test
```

Dates that are calendar days (birthdays, interaction dates) are plain
`YYYY-MM-DD` strings. A time zone only enters when turning an instant into a
day, and it's always passed explicitly, so results don't depend on the machine
running them.
