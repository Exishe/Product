-- ADR-040: Telegram alerts are exceptions by default. Every-order alerts are
-- a switch the owner turns on in the Telegram settings.
alter table public.notification_channels
  alter column events set default '{order.overdue,station.offline,order.comped,day.summary}';
