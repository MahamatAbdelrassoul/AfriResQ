-- PostGIS answers map questions, such as the nearest hospital to a point.
-- Supabase keeps extensions in their own schema, and its database role already searches it.
create schema if not exists extensions;
create extension if not exists postgis with schema extensions;

-- One row is one person. The browser no longer has to be the only copy.
create table if not exists people (
  id uuid primary key default gen_random_uuid(),
  phone text not null,
  phone_digits text not null unique,
  person_type text not null check (person_type in ('citizen', 'student')),
  name text not null,
  email text not null default '',
  university text not null default '',
  student_no text not null default '',
  hall text not null default '',
  language text not null default 'English',
  kin_name text not null default '',
  kin_relation text not null default '',
  kin_phone text not null default '',
  home_text text not null default '',
  home_lat double precision,
  home_lng double precision,
  blood text not null default '',
  allergies text not null default '',
  conditions text not null default '',
  medications text not null default '',
  share_medical boolean not null default true,
  profile_done boolean not null default false,
  safety_mode text not null default 'always',
  safety_kin boolean not null default true,
  safety_pings integer not null default 3,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists people_email_unique
  on people (lower(email))
  where email <> '';

-- One row is one case. It belongs to the person who sent it.
create sequence if not exists case_number_seq start with 2001;

create table if not exists cases (
  id uuid primary key default gen_random_uuid(),
  public_id text not null unique default ('AR-' || nextval('case_number_seq')),
  phone_digits text not null references people (phone_digits),
  kind text not null check (kind in ('medical', 'other')),
  what text not null,
  awake text not null default '',
  who_needs_help text not null default 'me',
  where_mode text not null default 'gps',
  where_text text not null default '',
  where_lat double precision,
  where_lng double precision,
  building text not null default '',
  room text not null default '',
  landmark text not null default '',
  place_id text not null default '',
  desk text not null default '',
  path text not null check (path in ('ambulance', 'route', 'desk')),
  other_type text not null default '',
  detail text not null default '',
  state text not null check (state in ('sent', 'accepted', 'on_the_way', 'arrived', 'closed', 'cancelled', 'declined')),
  rating integer check (rating is null or (rating between 1 and 5)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz
);

-- One row is one place. A partner receives demands. A listed place is call and route only.
create table if not exists places (
  id text primary key,
  kind text not null check (kind in ('hospital', 'police', 'fire', 'disaster')),
  name text not null,
  short_name text not null,
  receives boolean not null default false,
  university text not null default '',
  phone text not null default '',
  lat double precision not null,
  lng double precision not null,
  distance_km double precision not null,
  drive_min integer not null,
  ambulance_min integer,
  created_at timestamptz not null default now()
);

insert into places (id, kind, name, short_name, receives, university, phone, lat, lng, distance_km, drive_min, ambulance_min)
values
  ('mak', 'hospital', 'Makerere University Hospital', 'Makerere', true, 'Makerere University', '+256 000 000 001', 0.3304, 32.5701, 1.2, 4, 6),
  ('mul', 'hospital', 'Mulago National Referral Hospital', 'Mulago', false, '', '+256 000 000 002', 0.3378, 32.5756, 3.4, 11, null),
  ('nsa', 'hospital', 'Nsambya Hospital', 'Nsambya', false, '', '+256 000 000 003', 0.2983, 32.5862, 5.1, 16, null),
  ('mps', 'police', 'Makerere Police Station', 'Police', true, 'Makerere University', '+256 000 000 010', 0.3294, 32.5672, 0.8, 3, null)
on conflict (id) do nothing;

-- One code opens one desk. The code itself is never stored, only a hash.
create table if not exists desk_codes (
  place_id text primary key references places (id),
  code_hash text not null,
  updated_at timestamptz not null default now()
);

create table if not exists desk_sessions (
  token text primary key,
  place_id text not null references places (id),
  expires_at timestamptz not null
);

-- One code for the team that runs AfriResQ. It is not a desk sign-in.
create table if not exists admin_gate (
  id boolean primary key default true check (id),
  code_hash text not null,
  updated_at timestamptz not null default now()
);

create table if not exists admin_sessions (
  token text primary key,
  expires_at timestamptz not null
);

-- A partner asks to receive cases. Nothing is assigned until the team confirms.
create table if not exists partner_applications (
  id uuid primary key default gen_random_uuid(),
  organisation text not null,
  primary_category text not null,
  extra_categories text[] not null default '{}',
  phone text not null,
  email text not null,
  address text not null,
  districts text not null default '',
  services text not null default '',
  hours text not null default '',
  emergency_ready boolean not null default false,
  licence text not null default '',
  representative_name text not null,
  representative_phone text not null,
  representative_email text not null default '',
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined')),
  availability text not null default 'offline' check (availability in ('available', 'busy', 'unavailable', 'offline')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Map points, kept in step with lat and lng. Nearest-place searches use these.
alter table places add column if not exists location geography(Point, 4326)
  generated always as (st_setsrid(st_makepoint(lng, lat), 4326)::geography) stored;
create index if not exists places_location_idx on places using gist (location);

alter table cases add column if not exists where_location geography(Point, 4326)
  generated always as (
    case when where_lat is not null and where_lng is not null
      then st_setsrid(st_makepoint(where_lng, where_lat), 4326)::geography
    end
  ) stored;
create index if not exists cases_where_location_idx on cases using gist (where_location);

-- A one-time code for a phone (SMS) or a student inbox. Only the hash is stored.
create table if not exists auth_codes (
  id uuid primary key default gen_random_uuid(),
  channel text not null check (channel in ('sms', 'email')),
  destination text not null,
  code_hash text not null,
  purpose text not null check (purpose in ('signup', 'signin')),
  expires_at timestamptz not null,
  attempts integer not null default 0,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists auth_codes_destination_idx
  on auth_codes (destination, created_at desc);

-- Proof that a phone or student email was confirmed. The browser holds the token; the database holds its hash.
create table if not exists auth_sessions (
  token_hash text primary key,
  channel text not null check (channel in ('sms', 'email')),
  destination text not null,
  purpose text not null check (purpose in ('signup', 'signin')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

-- The team can stop a number from sending new cases, for example after false alarms.
alter table people add column if not exists blocked boolean not null default false;
alter table people add column if not exists blocked_reason text not null default '';

-- A password set at sign-up, so a member can sign in again without a code. Only the hash is stored.
alter table people add column if not exists password_hash text not null default '';
alter table people add column if not exists failed_logins integer not null default 0;
alter table people add column if not exists locked_until timestamptz;

-- A confirmed partner signs in with its official email and the code sent when the team confirmed it.
-- Only the hash is stored. Declining or reopening the request clears it.
alter table partner_applications add column if not exists access_code_hash text not null default '';
alter table partner_applications add column if not exists code_sent_at timestamptz;
alter table partner_applications add column if not exists failed_logins integer not null default 0;
alter table partner_applications add column if not exists locked_until timestamptz;

-- A desk or partner may decline a request it cannot take. The person sees why and can choose another place.
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'cases_state_check' and pg_get_constraintdef(oid) not like '%declined%'
  ) then
    alter table cases drop constraint cases_state_check;
    alter table cases add constraint cases_state_check
      check (state in ('sent', 'accepted', 'on_the_way', 'arrived', 'closed', 'cancelled', 'declined'));
  end if;
end $$;
alter table cases add column if not exists decline_reason text not null default '';

-- Where the partner is based, given on the join form. Confirming the partner puts its place there.
alter table partner_applications add column if not exists base_lat double precision;
alter table partner_applications add column if not exists base_lng double precision;

-- A confirmed partner works as the desk of one place: it sees and moves that place's cases.
alter table partner_applications add column if not exists place_id text references places (id);
create unique index if not exists partner_applications_place_unique
  on partner_applications (place_id)
  where place_id is not null;

create table if not exists partner_sessions (
  token_hash text primary key,
  partner_id uuid not null references partner_applications (id) on delete cascade,
  expires_at timestamptz not null
);

-- Every change made from the team page, newest first. It is never edited.
create table if not exists admin_log (
  id bigint generated always as identity primary key,
  action text not null,
  target text not null default '',
  detail text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists admin_log_created_idx on admin_log (created_at desc);

-- Supabase puts every public table on its web API for anyone with the publishable key.
-- Row level security with no policies closes that door. The AfriResQ API owns these
-- tables, so it is not affected. Add a policy only when the website must read a table directly.
alter table people enable row level security;
alter table cases enable row level security;
alter table places enable row level security;
alter table desk_codes enable row level security;
alter table desk_sessions enable row level security;
alter table admin_gate enable row level security;
alter table admin_sessions enable row level security;
alter table partner_applications enable row level security;
alter table auth_codes enable row level security;
alter table auth_sessions enable row level security;
alter table admin_log enable row level security;
alter table partner_sessions enable row level security;
