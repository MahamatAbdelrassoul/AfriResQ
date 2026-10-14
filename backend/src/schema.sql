-- PostGIS answers map questions, such as the nearest hospital to a point.
create extension if not exists postgis;

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
  state text not null check (state in ('sent', 'accepted', 'on_the_way', 'arrived', 'closed', 'cancelled')),
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
