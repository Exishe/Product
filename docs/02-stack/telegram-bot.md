# Telegram manager bot: how to add an action

Design and access model: ADR-069 in `docs/01-architecture/decisions.md`. Buttons only, no AI, free (Bot API only).

## How a press travels

Telegram -> `/api/telegram` (secret header) -> `api.telegram_update` -> `private.bot_handle` (all rules) -> a **screen** (JSON) -> `src/features/telegram-bot/render.ts` draws it -> returned as the webhook answer (`editMessageText` for a press, `sendMessage` for typed text). The app never holds the bot token or a secret key.

`callback_data` is `<verb>` or `<verb>:<arg>` (`src/features/telegram-bot/callbacks.ts`). The argument is opaque and always re-validated in the database against the linked account.

## Add an action (copy `sold_out` or `pause`)

1. **Registry row** in a new migration: `update private.bot_actions set ready = true where id = '<id>'` (the ten ids exist; unbuilt ones have `ready = false`). Set `steps` (`category`, `item`, `promo`, `number`, `choice`, `text_name_hy|ru|en`, `photo`, in order) and, for a `choice` step, `choices`. For a new id: insert the row, and add it to `registry` in `registry.ts` (a test compares both lists).
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

## Step kinds, pickers and read-only actions

- **`category` step** asks for a section (8 per page like items, `p:<uuid>`, re-checked against the café) and stores `category_id`. Put it before `item` to always ask for the section first; alone it is the whole picker (`category` on/off uses it). An `item` step with no section chosen asks for one by itself when the menu has more than 24 dishes.
- **`pick_inactive`** (column on `private.bot_actions`): the pickers also list inactive sections and hidden items, marked `off`; picking one is checked against the café, not `is_active`. Used by `hide` (so "show" works) and `category`. Other actions list active things only.
- **`kind = 'read'`** is a read-only action: no steps, no pending row, no confirm, nothing in the history. The engine calls `private.bot_read_<id>(p_ch, p_loc, p_data)` (same signature as `bot_prepare_`, SECURITY DEFINER, revoked from clients) and returns `{type: 'read', action, facts}`, or the usual `failed` screen if the facts hold `{"error": ...}`. In `registry.ts` give the action `read(facts, locale)` (text) instead of confirm / done / describe; the screen gets a "Back to menu" button. A read action must still check the caller: it is reached only through `bot_handle`, so unlinked chats get silence. `report` is the example (it reuses `private.day_summary_payload`).

## Typed text, photo, promo and optional steps (migration 20261123200000)

- **`text_<field>` step** asks for typed text and stores it as `data.<field>` (`text_name_hy` stores `name_hy`). The engine cleans it: whitespace and newlines become one space, control and invisible characters (zero-width, bidi overrides) are dropped. 1 to 80 characters, not starting with `/`; anything else answers `bad_text` and asks again (never cut). To add another field, extend the check on `bot_actions.steps` and the `ask_<field>` texts.
- **`optional_steps`** (column on `private.bot_actions`, a subset of `steps`): the screen gets a Skip button (`s`); the answer is stored as JSON null. `add_item` skips Russian name, English name and photo.
- **`promo` step** lists the location's promos (up to 3), marked on or off, and stores `promo_id` (`p:<uuid>`, checked against the café and the location). The `promo` action flips `promos.is_on` through `private.apply_promo_on` (the core of `api.set_promo_on`, which keeps its role check); guests read promos live, so nothing is published. A promo outside its dates says "guests will not see it yet".
- **`add_item`**: names (Armenian required), section, price, optional photo, preview, then `private.bot_apply_add_item` inserts the item (active, no allergens or tags, the section's prep area, translations through `private.set_translations`, source owner) and publishes as the linked account. Undo needs the item to be still active at the same price; it deletes the item, or hides it when an order line already points at it, and publishes.
- **`photo` step** is switched off: it is skipped as if Skip were pressed until the Vault secret `bot_photo_enabled` is `on`. Do not switch it on yet: nothing downloads the photo (see ADR-069, "Photo for new items"). With it on, the webhook accepts `message.photo` from a linked private chat, takes the largest rendition up to 2 MB (the `menu-images` bucket limit) and the step stores Telegram's `file_id`; confirming queues it in `private.bot_photo_jobs` for a worker that does not exist yet. A photo nobody asked for is ignored.

## Operations

Register the webhook again after deploying this migration, so Telegram sends button presses: `select private.telegram_set_webhook('https://<app>/api/telegram');`. Optional Vault secret `support_contact` (text) is shown by the Help button.
