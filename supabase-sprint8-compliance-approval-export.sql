-- Commercial Hardening Sprint 8: Compliance / Approval / Export Flow
-- Apply after Sprint 7 privacy/data migration.

create extension if not exists pgcrypto;

create table if not exists public.content_compliance_checks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  brand_profile_id uuid null references public.brand_profiles(id) on delete set null,
  story_id uuid null references public.stories(id) on delete cascade,
  script_id text null,
  check_type text not null default 'ai_compliance'
    check (check_type in ('ai_compliance', 'asset_rights', 'platform_readiness', 'claims_review', 'export_readiness')),
  status text not null default 'not_checked'
    check (status in ('not_checked', 'checking', 'clear', 'warning', 'needs_acknowledgement', 'blocked', 'failed')),
  risk_score integer null check (risk_score is null or (risk_score >= 0 and risk_score <= 100)),
  risk_level text null check (risk_level is null or risk_level in ('low', 'medium', 'high', 'critical')),
  warnings jsonb not null default '[]'::jsonb,
  summary text null,
  checked_by text not null default 'system' check (checked_by in ('ai', 'user', 'system')),
  provider text null,
  model text null,
  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.content_approvals (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  brand_profile_id uuid null references public.brand_profiles(id) on delete set null,
  story_id uuid not null references public.stories(id) on delete cascade,
  script_id text null,
  approval_status text not null default 'pending'
    check (approval_status in ('pending', 'approved', 'rejected', 'revoked')),
  approved_by uuid null references auth.users(id) on delete set null,
  approved_at timestamptz null,
  acknowledgement_text text null,
  warnings_at_approval jsonb not null default '[]'::jsonb,
  approval_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.content_exports (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  brand_profile_id uuid null references public.brand_profiles(id) on delete set null,
  story_id uuid not null references public.stories(id) on delete cascade,
  script_id text null,
  export_type text not null default 'copy_package'
    check (export_type in ('markdown', 'json', 'copy_package', 'platform_package', 'draft', 'internal')),
  export_status text not null default 'ready' check (export_status in ('ready', 'exported', 'failed')),
  exported_by uuid null references auth.users(id) on delete set null,
  exported_at timestamptz null,
  export_payload jsonb not null default '{}'::jsonb,
  compliance_check_id uuid null references public.content_compliance_checks(id) on delete set null,
  approval_id uuid null references public.content_approvals(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.content_audit_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  brand_profile_id uuid null references public.brand_profiles(id) on delete set null,
  story_id uuid null references public.stories(id) on delete cascade,
  event_type text not null,
  actor_user_id uuid null references auth.users(id) on delete set null,
  actor_type text not null default 'system' check (actor_type in ('user', 'ai', 'system')),
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.touch_content_compliance_checks()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.touch_content_approvals()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_touch_content_compliance_checks on public.content_compliance_checks;
create trigger trg_touch_content_compliance_checks
before update on public.content_compliance_checks
for each row execute function public.touch_content_compliance_checks();

drop trigger if exists trg_touch_content_approvals on public.content_approvals;
create trigger trg_touch_content_approvals
before update on public.content_approvals
for each row execute function public.touch_content_approvals();

create index if not exists idx_content_compliance_workspace on public.content_compliance_checks(workspace_id);
create index if not exists idx_content_compliance_brand on public.content_compliance_checks(brand_profile_id);
create index if not exists idx_content_compliance_story on public.content_compliance_checks(story_id);
create index if not exists idx_content_compliance_status on public.content_compliance_checks(status);
create index if not exists idx_content_compliance_created on public.content_compliance_checks(created_at desc);

create index if not exists idx_content_approvals_workspace on public.content_approvals(workspace_id);
create index if not exists idx_content_approvals_brand on public.content_approvals(brand_profile_id);
create index if not exists idx_content_approvals_story on public.content_approvals(story_id);
create index if not exists idx_content_approvals_status on public.content_approvals(approval_status);
create index if not exists idx_content_approvals_created on public.content_approvals(created_at desc);

create index if not exists idx_content_exports_workspace on public.content_exports(workspace_id);
create index if not exists idx_content_exports_brand on public.content_exports(brand_profile_id);
create index if not exists idx_content_exports_story on public.content_exports(story_id);
create index if not exists idx_content_exports_status on public.content_exports(export_status);
create index if not exists idx_content_exports_created on public.content_exports(created_at desc);

create index if not exists idx_content_audit_events_workspace on public.content_audit_events(workspace_id);
create index if not exists idx_content_audit_events_brand on public.content_audit_events(brand_profile_id);
create index if not exists idx_content_audit_events_story on public.content_audit_events(story_id);
create index if not exists idx_content_audit_events_created on public.content_audit_events(created_at desc);

alter table public.content_compliance_checks enable row level security;
alter table public.content_approvals enable row level security;
alter table public.content_exports enable row level security;
alter table public.content_audit_events enable row level security;

drop policy if exists "Members read content compliance checks" on public.content_compliance_checks;
create policy "Members read content compliance checks"
on public.content_compliance_checks for select
using (public.is_workspace_member(workspace_id));

drop policy if exists "Members create content compliance checks" on public.content_compliance_checks;
create policy "Members create content compliance checks"
on public.content_compliance_checks for insert
with check (public.is_workspace_member(workspace_id));

drop policy if exists "Members update content compliance checks" on public.content_compliance_checks;
create policy "Members update content compliance checks"
on public.content_compliance_checks for update
using (public.is_workspace_member(workspace_id))
with check (public.is_workspace_member(workspace_id));

drop policy if exists "Members read content approvals" on public.content_approvals;
create policy "Members read content approvals"
on public.content_approvals for select
using (public.is_workspace_member(workspace_id));

drop policy if exists "Members create content approvals" on public.content_approvals;
create policy "Members create content approvals"
on public.content_approvals for insert
with check (public.is_workspace_member(workspace_id));

drop policy if exists "Members update content approvals" on public.content_approvals;
create policy "Members update content approvals"
on public.content_approvals for update
using (public.is_workspace_member(workspace_id))
with check (public.is_workspace_member(workspace_id));

drop policy if exists "Members read content exports" on public.content_exports;
create policy "Members read content exports"
on public.content_exports for select
using (public.is_workspace_member(workspace_id));

drop policy if exists "Members create content exports" on public.content_exports;
create policy "Members create content exports"
on public.content_exports for insert
with check (public.is_workspace_member(workspace_id));

drop policy if exists "Members read content audit events" on public.content_audit_events;
create policy "Members read content audit events"
on public.content_audit_events for select
using (public.is_workspace_member(workspace_id));

drop policy if exists "Members create content audit events" on public.content_audit_events;
create policy "Members create content audit events"
on public.content_audit_events for insert
with check (public.is_workspace_member(workspace_id));
