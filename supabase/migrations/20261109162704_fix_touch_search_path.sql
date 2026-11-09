-- Supabase advisor 0011: pin the trigger function's search_path.
alter function private.touch_updated_at() set search_path = '';
