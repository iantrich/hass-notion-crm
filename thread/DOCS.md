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

### `sync_interval_minutes`

How often to sync with Notion, from 5 to 240 minutes. The default is 15.

## Security

- Thread is only reachable through Home Assistant ingress. It exposes no ports,
  and it refuses connections that don't come from the Supervisor's proxy.
- Only the users in `allowed_user_ids` can use it.
- The Notion token stays on the server and never reaches a browser.
- The cached Notion data and photos are left out of Home Assistant backups,
  because they rebuild from Notion on the next sync.
