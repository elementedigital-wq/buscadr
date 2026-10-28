-- buscaDR production-oriented schema reference. Requires PostgreSQL 16+ and PostGIS 3.x.
-- Apply using a proper migration runner after DBA review; no user-facing database configured yet.
BEGIN;
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS accounts (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), email TEXT NOT NULL UNIQUE,
 display_name TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('renter','owner','operator')),
 trust_state TEXT NOT NULL DEFAULT 'unverified', city TEXT NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS categories (
 id TEXT PRIMARY KEY, name_es TEXT NOT NULL, risk_level TEXT NOT NULL CHECK(risk_level IN ('A','B','C'))
);
CREATE TABLE IF NOT EXISTS assets (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), owner_id UUID NOT NULL REFERENCES accounts(id),
 category_id TEXT NOT NULL REFERENCES categories(id), title TEXT NOT NULL,
 description TEXT NOT NULL, publication_state TEXT NOT NULL DEFAULT 'draft'
 CHECK(publication_state IN ('draft','review','active','paused','archived')),
 version INT NOT NULL DEFAULT 1, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS asset_units (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), asset_id UUID NOT NULL REFERENCES assets(id),
 public_point geography(Point,4326) NOT NULL, pickup_point_private geography(Point,4326) NOT NULL,
 serial_ciphertext BYTEA, lifecycle TEXT NOT NULL DEFAULT 'available',
 CHECK (ST_IsValid(public_point::geometry)),CHECK (ST_IsValid(pickup_point_private::geometry))
);
CREATE INDEX IF NOT EXISTS asset_units_geo_gist ON asset_units USING GIST(public_point);
CREATE TABLE IF NOT EXISTS rate_plans (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), asset_id UUID NOT NULL REFERENCES assets(id),
 unit TEXT NOT NULL CHECK(unit IN ('hour','day','week')),
 amount_cents BIGINT NOT NULL CHECK(amount_cents>=0), min_units INT NOT NULL DEFAULT 1 CHECK(min_units>0),
 currency CHAR(3) NOT NULL DEFAULT 'USD', valid_from TIMESTAMPTZ NOT NULL DEFAULT now(), version INT NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS availability_blocks (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),asset_unit_id UUID NOT NULL REFERENCES asset_units(id),
 time_range TSTZRANGE NOT NULL, cause TEXT NOT NULL, CHECK(NOT isempty(time_range))
);
CREATE INDEX IF NOT EXISTS availability_block_gist ON availability_blocks USING GIST(asset_unit_id,time_range);
CREATE TABLE IF NOT EXISTS reservations (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),renter_id UUID NOT NULL REFERENCES accounts(id),
 asset_unit_id UUID NOT NULL REFERENCES asset_units(id),
 idempotency_key TEXT NOT NULL, reserved_range TSTZRANGE NOT NULL,
 state TEXT NOT NULL DEFAULT 'held' CHECK(state IN ('held','pending_payment','confirmed','ready','checked_out','active','returned','completed','reviewed','cancelled','expired','payment_failed','incident_open')),
 hold_expires_at TIMESTAMPTZ, pricing_snapshot JSONB NOT NULL,
 policy_version TEXT NOT NULL, version INT NOT NULL DEFAULT 1,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 CONSTRAINT unique_booking_request UNIQUE(renter_id,idempotency_key),
 CONSTRAINT valid_time_range CHECK(NOT isempty(reserved_range)),
 CONSTRAINT no_overlap_per_unit EXCLUDE USING GIST(
   asset_unit_id WITH =, reserved_range WITH &&
 ) WHERE (state IN ('held','pending_payment','confirmed','ready','checked_out','active'))
);
-- Holds MUST be expired via transactional scheduled cleanup before new transactions.
-- Buffer periods must already be included in reserved_range (not merely shown in UI).
CREATE TABLE IF NOT EXISTS reservation_events (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),reservation_id UUID NOT NULL REFERENCES reservations(id),
 type TEXT NOT NULL,actor_id UUID REFERENCES accounts(id),
 detail JSONB NOT NULL DEFAULT '{}',created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS payment_intents (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),reservation_id UUID NOT NULL REFERENCES reservations(id),
 provider TEXT NOT NULL,provider_reference TEXT UNIQUE,currency CHAR(3) NOT NULL DEFAULT 'USD',
 amount_cents BIGINT NOT NULL CHECK(amount_cents>=0),
 state TEXT NOT NULL DEFAULT 'created',created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS payment_events (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),provider TEXT NOT NULL,
 provider_event_id TEXT NOT NULL,signature_verified BOOLEAN NOT NULL DEFAULT false,
 payload_digest TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(provider,provider_event_id)
);
CREATE TABLE IF NOT EXISTS ledger_entries (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),reservation_id UUID REFERENCES reservations(id),
 type TEXT NOT NULL,amount_cents BIGINT NOT NULL,currency CHAR(3) NOT NULL DEFAULT 'USD',
 external_ref TEXT,created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS reviews (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),reservation_id UUID NOT NULL UNIQUE REFERENCES reservations(id),
 reviewer_id UUID NOT NULL REFERENCES accounts(id),rating INT NOT NULL CHECK(rating BETWEEN 1 AND 5),
 review_text TEXT,created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS messages (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),reservation_id UUID NOT NULL REFERENCES reservations(id),
 sender_id UUID NOT NULL REFERENCES accounts(id),body TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS outbox_events (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),aggregate_id UUID NOT NULL,
 event_type TEXT NOT NULL,payload JSONB NOT NULL,
 correlation_id UUID NOT NULL DEFAULT gen_random_uuid(),published_at TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS outbox_unpublished ON outbox_events(created_at) WHERE published_at IS NULL;
CREATE TABLE IF NOT EXISTS audit_log (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),actor_id UUID REFERENCES accounts(id),
 event_name TEXT NOT NULL,object_type TEXT NOT NULL,object_id UUID,
 detail JSONB NOT NULL DEFAULT '{}',occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMIT;

-- Server-side proximity query (prepared params $1=longitude, $2=latitude, $3=meters):
-- SELECT u.asset_id, ST_Distance(u.public_point, ST_SetSRID(ST_MakePoint($1,$2),4326)::geography) AS distance_m
-- FROM asset_units u JOIN assets a ON a.id=u.asset_id
-- WHERE a.publication_state='active'
--   AND ST_DWithin(u.public_point,ST_SetSRID(ST_MakePoint($1,$2),4326)::geography,$3)
-- ORDER BY distance_m ASC LIMIT 50;
-- Real implementation must join availability and policy eligibility before returning bookable listings.
