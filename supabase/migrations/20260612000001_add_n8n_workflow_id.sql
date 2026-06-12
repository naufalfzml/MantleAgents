alter table public.user_profiles
add column if not exists n8n_workflow_id text;
