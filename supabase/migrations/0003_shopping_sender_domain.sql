-- Household-specific shopping-mall sender domains, layered on top of the
-- built-in DEFAULT_SENDER_DOMAINS list in lib/mail-adapters/sender-domains.ts.
-- Used to filter mailboxes per FR-01-05 (Gmail) / FR-01-06 (Naver) and
-- managed from /settings/shopping-domains.

create table shopping_sender_domain (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references household(id) on delete cascade,
  domain text not null,
  created_at timestamptz not null default now(),
  unique (household_id, domain)
);

alter table shopping_sender_domain enable row level security;
create policy shopping_sender_domain_all on shopping_sender_domain for all
  using (household_id in (select auth_household_ids()))
  with check (household_id in (select auth_household_ids()));
