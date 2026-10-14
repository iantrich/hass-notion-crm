# Thread

Thread is a personal CRM that reads and writes your Notion databases. It runs
inside Home Assistant and is only reachable through Home Assistant's own login.

## First-time setup

1. Start the app and open **Thread** from the sidebar. The page shows your
   Home Assistant user ID.
2. On the app's **Configuration** tab, add that ID to `allowed_user_ids`, fill in
   the Notion settings below, and save.
3. Restart the app. The page should show the time of the last sync and how many
   people it found.

## Options

### `notion_token`

The secret of the Notion integration (starts with `ntn_`), from
https://www.notion.so/profile/integrations. The integration needs access to the
page that contains the CRM databases, or every relation between them reads as
empty.

### `me_person_id`

The ID of your own page in the People database, so you never appear as your own
connection.

### `data_source_people`, `data_source_households`, `data_source_groups`, `data_source_relationships`, `data_source_interactions`

The data source ID of each database.

### `allowed_user_ids`

The Home Assistant user IDs allowed to use Thread. Everyone else is refused,
admins included.

### `notify_targets`

The phones to send Thread's notifications to, such as `mobile_app_ians_iphone`.
A leading `notify.` is accepted and ignored. The setup page lists the ones
Home Assistant knows about.

### Notifications

Thread sends three notifications a day, in Home Assistant's time zone:

| Time | What |
|---|---|
| 10:00 | Whose birthday it is today (including people hidden from lists) |
| 15:00 | Close friends who just passed six weeks since you last logged an interaction with them |
| 21:00 | A reminder to log the day's interactions, skipped if you already have |

Before each one it syncs with Notion, so changes made there count. Each goes
out at most once a day. If Home Assistant or the app is down at that time, a
restart within the hour still sends it; after that it waits for tomorrow.
Tapping a notification opens the screen it's about: the person, when there's
one, otherwise the birthday list or Reach Out. The evening reminder opens Home.

**Settings** (the gear on Home) shows when each was last checked and has a
**Send test notification** button.

### Home screen shortcut

iOS only lets an app put its own icon on the home screen, so Thread's goes
through the Shortcuts app and the Companion app. **Settings → Home screen
shortcut** has the link and the icon:

1. Copy the link (`homeassistant://navigate/app/<id>`) and save the icon.
2. In Shortcuts, make a shortcut with the **Open URLs** action and paste the
   link.
3. Name it Thread and use **Add to Home Screen** with the icon.

Add `/reach-out`, `/search` or `/add` to the end of the link to open that
screen. The link includes Thread's app ID, which changes if the repository is
re-added under a different URL; Settings always shows the current one.

### `sync_interval_minutes`

How often to sync with Notion, from 5 to 240 minutes. The default is 15.

## Security

- Thread is only reachable through Home Assistant ingress. It exposes no ports,
  and it refuses connections that don't come from the Supervisor's proxy.
- Only the users in `allowed_user_ids` can use it.
- The Notion token stays on the server and never reaches a browser.
- The cached Notion data and photos are left out of Home Assistant backups,
  because they rebuild from Notion on the next sync.
