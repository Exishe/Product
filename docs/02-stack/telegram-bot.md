# Telegram manager bot: how to add an action

Design and access model: ADR-069 in `docs/01-architecture/decisions.md`. Buttons only, no AI, free (Bot API only).

## How a press travels

Telegram -> `/api/telegram` (secret header) -> `api.telegram_update` -> `private.bot_handle` (all rules) -> a **screen** (JSON) -> `src/features/telegram-bot/render.ts` draws it -> returned as the webhook answer (`editMessageText` for a press, `sendMessage` for typed text). The app never holds the bot token or a secret key.

`callback_data` is `<verb>` or `<verb>:<arg>` (`src/features/telegram-bot/callbacks.ts`). The argument is opaque and always re-validated in the database against the linked account.

## Add an action (copy `sold_out` or `pause`)

1. **Registry row** in a new migration: `update private.bot_actions set ready = true where id = '<id>'` (the ten ids exist; unbuilt ones have `ready = false`). Set `steps` (`item`, `number`, `choice`, in order) and, for a `choice` step, `choices`. For a new id: insert the row, and add it to `registry` in `registry.ts` (a test compares both lists).
2. **Three functions** in the same migration, all `security definer set search_path = ''`, signature `(p_ch public.notification_channels, p_loc uuid, p_data jsonb)`:
   - `private.bot_prepare_<id>` returns the **facts** for the preview, or `{"error": "<code>"}` (shown as a friendly failure). It changes nothing.
   - `private.bot_apply_<id>` does the change and returns `{entity, entity_id, label, old, new}`. It must re-check that every id in `p_data` belongs to `p_ch.restaurant_id` (the engine validated them, check again anyway). Call the shared rule function; if the admin function checks `auth.uid()`, move its body to a `private.` core that takes an actor (see `private.apply_ordering_pause`) and call that from both.
   - `private.bot_undo_<id>(p_ch, p_loc, p_change private.bot_changes) returns boolean` returns false when the current value is no longer `p_change.new_value`; otherwise restores `old_value` and returns true.
   - Optional `private.bot_ctx_<id>` returns context for the choice/number question (for example the current price).
3. `revoke execute on function … from public, anon, authenticated` for each new function (nothing here is client-callable).
4. **Texts** in `texts.ts`, all three languages (a test fails if a key is missing or placeholders differ): `confirm_<id>…`, `done_<id>…`, `desc_<id>…`.
5. **Registry entry** in `registry.ts`: `confirm(facts)`, `done(change)`, `describe(change)` (copy `sold_out`).
6. **SQL test** in `supabase/tests/sql/telegram_bot.sql`: nothing changes before `k:<token>`, a foreign café's id is refused, undo restores and refuses after a change.

Rules: never put a user-visible word in SQL; never trust `p_data` ids; the bot changes live data through the same rule the admin uses; a change that guests only see after Publish (price, hide, add) must say so in its `done` text. The bot publishes through `private.publish_menu_core(location, actor_kind, actor)`, the same rule as the admin's Publish (`api.publish_menu` only adds the role check); kitchen-closed is `private.apply_kitchen_closed`. Both are called with the linked owner as actor.

## Operations

Register the webhook again after deploying this migration, so Telegram sends button presses: `select private.telegram_set_webhook('https://<app>/api/telegram');`. Optional Vault secret `support_contact` (text) is shown by the Help button.
