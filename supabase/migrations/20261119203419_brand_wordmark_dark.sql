-- ADR-065: a second wordmark for dark backgrounds, and one more script font.
--
-- restaurants.brand gains "wordmark_dark": the café's name as a picture drawn
-- in light ink, for a dark header band or a dark theme. "wordmark" stays the
-- artwork for light backgrounds, so brands saved before this keep working.
-- The guest page picks by the luminance of what is behind the picture and
-- falls back to the other one when only one is uploaded.
--   { ..., "wordmark"?: path (for light backgrounds),
--          "wordmark_dark"?: path (for dark backgrounds) }
-- Both paths must sit in the café's own folder.
--
-- api.set_brand and api.public_menu do not list the keys (they pass the
-- object through private.brand_shape_ok and the table constraint), so they
-- are unchanged, as are all grants: `create or replace` keeps the revokes of
-- 20261119100000_brand_profile.

-- The curated font list, now with Mrs Saint Delafield (SIL OFL 1.1; Latin
-- only, so Cyrillic and Armenian fall back per glyph like Armenian always
-- does). Keep in step with BRAND_FONTS in src/features/guest-theme/brand.ts
-- (brand.test.ts compares the two).
create or replace function private.brand_fonts() returns text[]
language sql immutable set search_path = '' as $$
  select array[
    -- headings
    'Cormorant', 'Cormorant Garamond', 'Playfair Display', 'Lora', 'EB Garamond', 'PT Serif',
    'Prata', 'Forum', 'Yeseva One', 'Literata', 'Oswald', 'Unbounded',
    -- body
    'Jost', 'Montserrat', 'Inter', 'Manrope', 'Rubik', 'PT Sans', 'Raleway', 'Nunito',
    'Commissioner', 'Golos Text',
    -- script accents
    'Great Vibes', 'Marck Script', 'Bad Script', 'Caveat', 'Lobster', 'Mrs Saint Delafield'
  ]
$$;

-- As in 20261119100000_brand_profile, plus the wordmark_dark key.
create or replace function private.brand_shape_ok(p jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select p is null or (
    jsonb_typeof(p) = 'object'
    and not exists (select 1 from jsonb_object_keys(p) k
                    where k not in ('colors', 'heading_font', 'body_font', 'script_font', 'plate',
                                    'wordmark', 'wordmark_dark'))
    and (not p ? 'colors' or (
      jsonb_typeof(p -> 'colors') = 'object'
      and not exists (select 1 from jsonb_each(p -> 'colors') c
                      where c.key not in ('header', 'accent', 'highlight', 'line', 'page')
                         or jsonb_typeof(c.value) <> 'string'
                         or c.value #>> '{}' !~ '^#[0-9a-f]{6}$')))
    and (not p ? 'heading_font' or (p ->> 'heading_font') = any (private.brand_fonts()))
    and (not p ? 'body_font' or (p ->> 'body_font') = any (private.brand_fonts()))
    and (not p ? 'script_font' or (p ->> 'script_font') = any (private.brand_fonts()))
    and (not p ? 'plate' or (p ->> 'plate') in ('porcelain', 'dark', 'none'))
    and (not p ? 'wordmark' or jsonb_typeof(p -> 'wordmark') = 'string')
    and (not p ? 'wordmark_dark' or jsonb_typeof(p -> 'wordmark_dark') = 'string')
  )
$$;

-- The dark wordmark lives in the café's own folder too. A second constraint,
-- so the first one and the rows it already vouches for are left alone.
alter table public.restaurants
  add constraint restaurants_brand_wordmark_dark_scoped check (
    brand is null or not brand ? 'wordmark_dark'
    or ((brand ->> 'wordmark_dark') like id::text || '/%'
        and (brand ->> 'wordmark_dark') !~ '(^|/)\.\.(/|$)')
  );
