-- Armenian wording of the weekly digest, from the hy review of 25 Nov (ADR-084 follow-up):
-- article before a vowel, one word for busiest hour / photo / menu / staff, standard weekday
-- abbreviations. Texts only; no logic changes. The header and footer (private.render_notification)
-- keep their wording until a native speaker has read them.

create or replace function private.digest_dow(p_dow integer, p_l public.app_locale) returns text
language sql immutable set search_path = '' as $$
  select (case p_l
    when 'hy' then array['երկ', 'երք', 'չրք', 'հնգ', 'ուրբ', 'շբթ', 'կիր']
    when 'ru' then array['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс']
    else array['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] end)[p_dow]
$$;

create or replace function private.digest_finding_text(f jsonb, p_l public.app_locale) returns text
language plpgsql immutable set search_path = '' as $$
declare
  n text := case when f ? 'item' then private.digest_name(f -> 'item', p_l) end;
  cur text;
  prev text;
  label text;
  sign text := case when (f ->> 'percent')::integer > 0 then '+' else '' end;
begin
  case f ->> 'key'
  when 'unordered' then
    return n || case p_l when 'ru' then ': ' when 'hy' then '՝ ' else ': ' end
      || private.digest_count((f ->> 'views')::integer, p_l, 'view') || ', '
      || private.digest_count((f ->> 'orders')::integer, p_l, 'order') || case p_l when 'hy' then '։' else '.' end;
  when 'workhorse' then
    return case p_l
      when 'hy' then 'Շատ են պատվիրում ' || n || '՝ ' || private.digest_count((f ->> 'units')::integer, p_l, 'unit') || ', բայց գինը բաժնի միջինից ցածր է։'
      when 'ru' then n || ' часто заказывают (' || private.digest_count((f ->> 'units')::integer, p_l, 'unit') || '), но цена ниже средней по разделу.'
      else n || ' sells well (' || private.digest_count((f ->> 'units')::integer, p_l, 'unit') || '), but its price is below the section average.' end;
  when 'puzzle' then
    return case p_l
      when 'hy' then n || '՝ գինը բաժնի միջինից բարձր է, բայց պատվիրել են ընդամենը ' || private.digest_count((f ->> 'units')::integer, p_l, 'unit') || '։'
      when 'ru' then n || ': цена выше средней по разделу, но заказали всего ' || private.digest_count((f ->> 'units')::integer, p_l, 'unit') || '.'
      else n || ': priced above the section average, but only ' || private.digest_count((f ->> 'units')::integer, p_l, 'unit') || ' ordered.' end;
  when 'dog' then
    return case p_l
      when 'hy' then n || '՝ քիչ են պատվիրում (' || private.digest_count((f ->> 'units')::integer, p_l, 'unit') || '), գինն էլ բաժնի միջինից ցածր է։'
      when 'ru' then n || ': заказывают редко (' || private.digest_count((f ->> 'units')::integer, p_l, 'unit') || '), цена ниже средней по разделу.'
      else n || ': rarely ordered (' || private.digest_count((f ->> 'units')::integer, p_l, 'unit') || ') and priced below the section average.' end;
  when 'busiest' then
    return case p_l
      when 'hy' then 'Ամենամարդաշատ ժամը՝ ' || private.digest_dow((f ->> 'dow')::integer, p_l) || ' ' || private.digest_hour((f ->> 'hour')::integer)
                     || ', ' || private.digest_count((f ->> 'orders')::integer, p_l, 'order') || '։'
      when 'ru' then 'Самый загруженный час: ' || private.digest_dow((f ->> 'dow')::integer, p_l) || ' ' || private.digest_hour((f ->> 'hour')::integer)
                     || ', ' || private.digest_count((f ->> 'orders')::integer, p_l, 'order') || '.'
      else 'Busiest hour: ' || private.digest_dow((f ->> 'dow')::integer, p_l) || ' ' || private.digest_hour((f ->> 'hour')::integer)
           || ', ' || private.digest_count((f ->> 'orders')::integer, p_l, 'order') || '.' end;
  when 'dead' then
    return case p_l
      when 'hy' then 'Ամենահանգիստ ժամը՝ ' || private.digest_hour((f ->> 'hour')::integer) || ', շաբաթվա ընթացքում ընդամենը '
                     || private.digest_count((f ->> 'orders')::integer, p_l, 'order') || ' (ժամում միջինը՝ ' || private.digest_decimal((f ->> 'avg')::numeric, p_l) || ')։'
      when 'ru' then 'Самый тихий час: ' || private.digest_hour((f ->> 'hour')::integer) || ', за неделю всего '
                     || private.digest_count((f ->> 'orders')::integer, p_l, 'order') || ' (в среднем на час: ' || private.digest_decimal((f ->> 'avg')::numeric, p_l) || ').'
      else 'Quietest hour: ' || private.digest_hour((f ->> 'hour')::integer) || ', only '
           || private.digest_count((f ->> 'orders')::integer, p_l, 'order') || ' all week (average per hour: ' || private.digest_decimal((f ->> 'avg')::numeric, p_l) || ').' end;
  when 'slow' then
    return case p_l
      when 'hy' then private.digest_count((f ->> 'slow_orders')::integer, p_l, 'order') || ' սպասել է ' || (f ->> 'minutes') || ' րոպեից ավելի, '
                     || 'մատուցողին կրկին կանչել են ' || (f ->> 'calls') || ' անգամ։ Ամենից հաճախ՝ ' || private.digest_hour((f ->> 'hour')::integer) || '-ի շուրջ։'
      when 'ru' then 'Долгие ожидания: заказов ' || (f ->> 'slow_orders') || ' (дольше ' || (f ->> 'minutes') || ' мин), повторных вызовов '
                     || (f ->> 'calls') || '. Чаще всего около ' || private.digest_hour((f ->> 'hour')::integer) || '.'
      else 'Long waits: orders ' || (f ->> 'slow_orders') || ' (over ' || (f ->> 'minutes') || ' min), repeated calls '
           || (f ->> 'calls') || '. Mostly around ' || private.digest_hour((f ->> 'hour')::integer) || '.' end;
  when 'suggest_high' then
    return case p_l
      when 'hy' then 'Առաջարկներն աշխատում են՝ ցուցադրվել է ' || (f ->> 'shown') || ', ընդունվել է ' || (f ->> 'accepted') || ' (' || (f ->> 'percent') || '%)։'
      when 'ru' then 'Подсказки работают: показано ' || (f ->> 'shown') || ', принято ' || (f ->> 'accepted') || ' (' || (f ->> 'percent') || '%).'
      else 'Suggestions work: shown ' || (f ->> 'shown') || ', accepted ' || (f ->> 'accepted') || ' (' || (f ->> 'percent') || '%).' end;
  when 'suggest_low' then
    return case p_l
      when 'hy' then 'Առաջարկները քիչ են ընդունվում՝ ցուցադրվել է ' || (f ->> 'shown') || ', ընդունվել է ' || (f ->> 'accepted') || ' (' || (f ->> 'percent') || '%)։'
      when 'ru' then 'Подсказки почти не принимают: показано ' || (f ->> 'shown') || ', принято ' || (f ->> 'accepted') || ' (' || (f ->> 'percent') || '%).'
      else 'Suggestions are rarely accepted: shown ' || (f ->> 'shown') || ', accepted ' || (f ->> 'accepted') || ' (' || (f ->> 'percent') || '%).' end;
  when 'wow_up', 'wow_down' then
    if f ->> 'metric' = 'revenue' then
      cur := private.format_amd((f ->> 'current')::integer, p_l);
      prev := private.format_amd((f ->> 'previous')::integer, p_l);
      label := case p_l when 'hy' then 'Վաճառք' when 'ru' then 'Выручка' else 'Revenue' end;
    else
      cur := (f ->> 'current');
      prev := (f ->> 'previous');
      label := case p_l when 'hy' then 'Պատվերներ' when 'ru' then 'Заказы' else 'Orders' end;
    end if;
    return case p_l
      when 'hy' then label || '՝ ' || cur || ', նախորդ շաբաթվա համեմատ ' || sign || (f ->> 'percent') || '% (' || prev || ')։'
      when 'ru' then label || ': ' || cur || ', ' || sign || (f ->> 'percent') || '% к прошлой неделе (' || prev || ').'
      else label || ': ' || cur || ', ' || sign || (f ->> 'percent') || '% vs last week (' || prev || ').' end;
  else
    return null;
  end case;
end $$;

create or replace function private.digest_action_text(a jsonb, p_l public.app_locale) returns text
language sql immutable set search_path = '' as $$
  select case a ->> 'key'
    when 'check_photo_price' then case p_l when 'hy' then 'Ստուգեք լուսանկարը կամ գինը։' when 'ru' then 'Проверьте фото или цену.' else 'Check its photo or price.' end
    when 'small_price_rise' then case p_l when 'hy' then 'Մտածեք գինը մի փոքր բարձրացնելու մասին։' when 'ru' then 'Подумайте о небольшом повышении цены.' else 'Consider a small price rise.' end
    when 'promote' then case p_l when 'hy' then 'Տեղափոխեք ճաշացանկի վերև կամ առաջ քաշեք։' when 'ru' then 'Поднимите выше в меню или продвиньте.' else 'Move it up in the menu or promote it.' end
    when 'rework' then case p_l when 'hy' then 'Մտածեք հանելու կամ փոխելու մասին։' when 'ru' then 'Подумайте, не убрать ли блюдо или переделать его.' else 'Consider removing or reworking it.' end
    when 'extra_waiter' then case p_l when 'hy' then 'Այդ ժամին պլանավորեք լրացուցիչ մատուցող։' when 'ru' then 'Запланируйте на это время ещё одного официанта.' else 'Plan an extra waiter for that hour.' end
    when 'promo_then' then case p_l when 'hy' then 'Մտածեք այդ ժամի համար ակցիա անելու մասին («Ակցիաներ» բաժինը)։' when 'ru' then 'Подумайте об акции на это время (раздел «Акции»).' else 'Consider a promotion for that hour (Promotions).' end
    when 'check_pace' then case p_l when 'hy' then 'Ստուգեք խոհանոցի տեմպը ' || private.digest_hour((a ->> 'hour')::integer) || '-ի շուրջ։' when 'ru' then 'Проверьте темп кухни около ' || private.digest_hour((a ->> 'hour')::integer) || '.' else 'Check kitchen pace around ' || private.digest_hour((a ->> 'hour')::integer) || '.' end
    when 'more_suggestions' then case p_l when 'hy' then 'Ավելացրեք առաջարկներ ավելի շատ ուտեստների համար։' when 'ru' then 'Добавьте подсказки к другим блюдам.' else 'Add suggestions to more dishes.' end
    when 'review_suggestions' then case p_l when 'hy' then 'Վերանայեք, թե որ ուտեստներն են առաջարկվում միասին։' when 'ru' then 'Пересмотрите, какие блюда предлагаются вместе.' else 'Review which dishes are suggested together.' end
    when 'keep_stock' then case p_l when 'hy' then 'Համոզվեք, որ պաշարն ու աշխատակիցները բավարար են։' when 'ru' then 'Убедитесь, что хватает продуктов и персонала.' else 'Make sure stock and staff keep up.' end
    when 'check_reports' then case p_l when 'hy' then 'Նայեք հաշվետվություններում՝ որ օրերին է նվազել։' when 'ru' then 'Посмотрите в отчётах, в какие дни просело.' else 'See in Reports which days dropped.' end
  end
$$;
