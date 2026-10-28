-- buscaDR: PostgreSQL/PostGIS target schema blueprint (not applied by the local demo).
-- Requires Postgres 15+ with pgcrypto, postgis, btree_gist, pg_trgm.
-- DO NOT execute against live production data without review and controlled migrations.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS app_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text NOT NULL UNIQUE,
  display_name text NOT NULL, email_verified_at timestamptz,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','deleted')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS user_roles (
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK(role IN ('patient','practitioner','clinic_admin','staff_admin')),
  PRIMARY KEY(user_id,role)
);
CREATE TABLE IF NOT EXISTS practitioners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid UNIQUE REFERENCES app_users(id),
  slug text NOT NULL UNIQUE, public_name text NOT NULL, specialty text NOT NULL,
  bio text, credentials_status text NOT NULL DEFAULT 'draft'
    CHECK(credentials_status IN ('draft','pending','changes_required','verified','suspended')),
  verified_at timestamptz, published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS credential_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), practitioner_id uuid NOT NULL REFERENCES practitioners(id),
  status text NOT NULL CHECK(status IN ('pending','approved','rejected')),
  source_name text, reviewed_by uuid REFERENCES app_users(id), checked_at timestamptz,
  evidence_ref text -- private asset identifier, never expose in public JSON
);
CREATE TABLE IF NOT EXISTS organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), legal_name text NOT NULL,
  owner_user_id uuid NOT NULL REFERENCES app_users(id), plan_code text NOT NULL DEFAULT 'free'
);
CREATE TABLE IF NOT EXISTS organization_members (
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES app_users(id),
  role text NOT NULL CHECK(role IN ('owner','manager','receptionist','practitioner')),
  PRIMARY KEY(organization_id,user_id)
);
CREATE TABLE IF NOT EXISTS locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid REFERENCES organizations(id),
  name text NOT NULL, city text NOT NULL, address_public text,
  point geography(Point,4326) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS locations_gist_idx ON locations USING gist(point);
CREATE INDEX IF NOT EXISTS practitioner_name_trgm_idx ON practitioners USING gin(public_name gin_trgm_ops);
CREATE TABLE IF NOT EXISTS services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), practitioner_id uuid NOT NULL REFERENCES practitioners(id),
  location_id uuid REFERENCES locations(id), title text NOT NULL,
  duration_minutes integer NOT NULL CHECK (duration_minutes BETWEEN 10 AND 240),
  price_cents integer CHECK(price_cents >= 0), is_active boolean NOT NULL DEFAULT true
);
CREATE TABLE IF NOT EXISTS availability_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), practitioner_id uuid NOT NULL REFERENCES practitioners(id),
  location_id uuid REFERENCES locations(id), weekday smallint NOT NULL CHECK(weekday BETWEEN 0 AND 6),
  local_start time NOT NULL,local_end time NOT NULL,timezone text NOT NULL DEFAULT 'America/Guayaquil',
  CHECK(local_end>local_start)
);
CREATE TABLE IF NOT EXISTS appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), practitioner_id uuid NOT NULL REFERENCES practitioners(id),
  patient_id uuid NOT NULL REFERENCES app_users(id), service_id uuid NOT NULL REFERENCES services(id),
  location_id uuid REFERENCES locations(id), organization_id uuid REFERENCES organizations(id),
  start_at timestamptz NOT NULL,end_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'requested' CHECK(status IN ('held','requested','confirmed','reschedule_requested','completed','cancelled','expired','no_show')),
  idempotency_key text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK(end_at>start_at)
);
-- Database-level concurrency protection: no overlapping active time ranges per professional.
ALTER TABLE appointments ADD CONSTRAINT appointments_no_overlap
  EXCLUDE USING gist (practitioner_id WITH =, tstzrange(start_at,end_at,'[)') WITH &&)
  WHERE(status IN ('held','requested','confirmed'));
CREATE INDEX IF NOT EXISTS appointments_patient_time_idx ON appointments(patient_id,start_at DESC);
CREATE INDEX IF NOT EXISTS appointments_practitioner_time_idx ON appointments(practitioner_id,start_at DESC);
CREATE INDEX IF NOT EXISTS appointments_tenant_time_idx ON appointments(organization_id,start_at DESC);
CREATE TABLE IF NOT EXISTS conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), patient_id uuid NOT NULL REFERENCES app_users(id),
  practitioner_id uuid NOT NULL REFERENCES practitioners(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), conversation_id uuid NOT NULL REFERENCES conversations(id),
  author_user_id uuid NOT NULL REFERENCES app_users(id), body_encrypted bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), appointment_id uuid UNIQUE NOT NULL REFERENCES appointments(id),
  author_user_id uuid NOT NULL REFERENCES app_users(id), rating smallint NOT NULL CHECK(rating BETWEEN 1 AND 5),
  body text NOT NULL, moderation_status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), practitioner_id uuid REFERENCES practitioners(id),
  organization_id uuid REFERENCES organizations(id), plan_code text NOT NULL,
  provider_ref text UNIQUE, status text NOT NULL DEFAULT 'trial', renews_at timestamptz,
  CHECK ((practitioner_id IS NOT NULL)::int + (organization_id IS NOT NULL)::int = 1)
);
CREATE TABLE IF NOT EXISTS entitlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), subscription_id uuid NOT NULL REFERENCES subscriptions(id),
  feature_key text NOT NULL, monthly_limit integer, monthly_used integer NOT NULL DEFAULT 0,
  UNIQUE(subscription_id,feature_key)
);
CREATE TABLE IF NOT EXISTS notification_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), event_type text NOT NULL,
  event_key text NOT NULL UNIQUE, payload jsonb NOT NULL, attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(), delivered_at timestamptz
);
CREATE INDEX IF NOT EXISTS notification_retry_idx ON notification_outbox(next_attempt_at) WHERE delivered_at IS NULL;
CREATE TABLE IF NOT EXISTS audit_logs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, actor_user_id uuid REFERENCES app_users(id),
  action text NOT NULL, target_type text NOT NULL, target_id text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(), metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);
-- Required before production: RBAC per object, tenant isolation policy, encryption keys,
-- slot holds expiration, verification workflow, review eligibility triggers, retention, billing webhooks.