# Thread

## Options

### `allowed_user_ids`

The Home Assistant user IDs allowed to use Thread. Open Thread from the sidebar
once: the page shows your user ID. Paste it here and restart the app. Requests
from any other user are refused, even admins.

### `notify_targets`

Notify services to send Thread's notifications to. For example:
`mobile_app_ians_iphone` (a leading `notify.` is accepted and ignored). Find yours under
**Developer tools → Actions** by searching for `notify.mobile_app`.

## Security

- Thread is only reachable through Home Assistant ingress. It exposes no ports,
  and it refuses connections that don't come from the Supervisor's ingress proxy.
- Only the users in `allowed_user_ids` can use it.
