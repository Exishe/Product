# Showcase café «Pativ Demo»

A café where every shipped feature works, for showing Pativ live. It is separate from `demo-cafe` (the CI test fixture: never touch it) and from `blanca` (Blanca's own demo, see below).

Seeded by `scripts/seed-showcase.mjs` through the app's own `api` functions, signed in as the café's owner (no secret key, RLS applies). Logins are written to the file named by `SHOWCASE_CREDENTIALS_OUT` (default: the OS temp dir); they are never committed.

```
node --env-file=.env.local scripts/seed-showcase.mjs            # both parts
node --env-file=.env.local scripts/seed-showcase.mjs showcase   # only «Pativ Demo»
node --env-file=.env.local scripts/seed-showcase.mjs blanca     # only Blanca's additions
```

Needs: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`; `SHOWCASE_DEMO_EMAIL` / `SHOWCASE_DEMO_PASSWORD` (a password is generated and saved if unset; this makes the one sign-up); `BLANCA_DEMO_EMAIL` / `BLANCA_DEMO_PASSWORD` for the Blanca part.

## What «Pativ Demo» shows

| Feature | Where to see it |
| --- | --- |
| 6 sections, 27 dishes in hy/ru/en, calm brand | guest menu, `/admin/menu`, `/admin/look` |
| Allergens and diet tags on every dish, Chef's pick (khorovats, salmon, baklava) | guest filter chips and dish sheet |
| Dish types for all dishes | `/admin/menu`, drives "goes well with" |
| Ingredients with grams and calories ("about N kcal" on a dish) | dish sheet; `/admin/menu` ingredients panel |
| Replaceable key ingredients: latte (milk → oat milk +300 AMD), pancakes (strawberry → mixed berries), bagel (smoked salmon → smoked trout, -400 AMD) | guest sees the substitute when the ingredient is out; kitchen "Ingredient out" |
| A key ingredient with no substitute: matcha latte (matcha out → dish hidden) | same |
| Owner pairings: khorovats, burger, salmon, baklava, omelette, pancakes | strip after adding a dish |
| Happy-hour promo (on), game rewards (on, level 3, 10%) | banner on the guest menu; `/admin` promos and rewards |
| Breakfast shown only 07:00-23:00 | narrow it live in `/admin/menu` (section window) to show a section hiding outside hours |
| 6 tables in two areas (hall, terrace), waiter and kitchen logins | `/waiter`, `/kitchen/<station>` |
| Reports, alerts, Telegram | `/admin/reports`; Telegram is linked by the owner with their own account (a link code lives 30 minutes, so none is made here) |

The café has no orders on purpose: the owner orders live. No dish has a photo (no licensed photos of our own yet); photos can be added in the editor.

## Calories and Chef's pick

These need migration `20261123320000_calories_tags`. If the project does not have it yet, the script skips the Chef's pick tag and the egg weight and says so; run it again once CI has applied the migration, then the numbers appear after Publish (the script publishes).

## Reset

The script is idempotent: running it again looks up what exists and sets it back (names, prices, ingredients, substitutes, pairings, promo, rewards). It does not delete anything, so a dish you added by hand stays. To start from scratch, remove the café with the support tools and run the script again. Nothing is left "out" at the end; the script marks the matcha out once to check the outage round trip and restores it.

## Blanca additions

`blanca` part, additive only (nothing deleted or overwritten; it never calls `save_item`, which would reset tags): dish types for every dish it can read from section names (list of untyped ones printed), ingredients with grams for eight real dishes, four of them with a key ingredient (cappuccino: milk → oat milk +300; salmon steak: salmon → trout -500; mille-feuille: forest berries → raspberry; burrata: no substitute), owner pairings for five dishes, a promo created but OFF, game rewards configured but OFF, menu published.
