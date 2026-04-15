-- ============================================================
-- QUANTUM SOCIAL — SUPABASE SCHEMA v1.0
-- Run this in Supabase SQL Editor (once, in order)
-- ============================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- ENUMS
-- ============================================================
CREATE TYPE subscription_tier AS ENUM ('waveform', 'entangle', 'omega_core');
CREATE TYPE account_status    AS ENUM ('active', 'suspended', 'revoked', 'pending_verification');
CREATE TYPE billing_cycle     AS ENUM ('monthly', 'annual');
CREATE TYPE integration_type  AS ENUM ('n8n', 'blender', 'custom');
CREATE TYPE social_platform   AS ENUM ('tiktok', 'instagram', 'youtube', 'other');
CREATE TYPE revoke_action     AS ENUM ('revoke_full', 'revoke_partial', 'suspend', 'restore', 'tier_change');
CREATE TYPE kill_target       AS ENUM ('global', 'mother', 'tier_waveform', 'tier_entangle', 'tier_omega', 'api', 'downloads');

-- ============================================================
-- PROFILES  (extends auth.users — never store passwords here)
-- ============================================================
CREATE TABLE profiles (
  id                    UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email                 TEXT NOT NULL,
  full_name             TEXT,
  phone                 TEXT,
  tier                  subscription_tier,
  status                account_status NOT NULL DEFAULT 'pending_verification',
  stripe_customer_id    TEXT UNIQUE,
  stripe_subscription_id TEXT,
  billing_cycle         billing_cycle DEFAULT 'monthly',
  tier_expires_at       TIMESTAMPTZ,
  is_active             BOOLEAN NOT NULL DEFAULT FALSE,
  revoked_at            TIMESTAMPTZ,
  revoked_reason        TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- SUBSCRIPTIONS  (full history — Stripe drives this)
-- ============================================================
CREATE TABLE subscriptions (
  id                        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id                   UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  tier                      subscription_tier NOT NULL,
  stripe_subscription_id    TEXT UNIQUE NOT NULL,
  stripe_price_id           TEXT NOT NULL,
  billing_cycle             billing_cycle NOT NULL DEFAULT 'monthly',
  status                    TEXT NOT NULL DEFAULT 'active',
  current_period_start      TIMESTAMPTZ,
  current_period_end        TIMESTAMPTZ,
  cancel_at_period_end      BOOLEAN DEFAULT FALSE,
  canceled_at               TIMESTAMPTZ,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- CONNECTED SOCIAL ACCOUNTS  (TikTok, IG, YouTube)
-- Tier-limited: waveform=1, entangle=3, omega=unlimited
-- ============================================================
CREATE TABLE social_accounts (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  platform        social_platform NOT NULL DEFAULT 'tiktok',
  handle          TEXT NOT NULL,
  platform_id     TEXT,
  token_encrypted TEXT,   -- encrypted at app level, never plain
  is_active       BOOLEAN DEFAULT TRUE,
  connected_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, platform, platform_id)
);

-- ============================================================
-- USER INTEGRATIONS  (n8n, Blender, custom — user-supplied)
-- We store endpoint + key hash only. Never plain API keys.
-- ============================================================
CREATE TABLE user_integrations (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id           UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  integration_type  integration_type NOT NULL,
  label             TEXT,
  endpoint_url      TEXT,             -- user's self-hosted URL
  api_key_encrypted TEXT,             -- encrypted at edge function level
  is_verified       BOOLEAN DEFAULT FALSE,
  last_tested_at    TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- KILL SWITCHES  (owner-only, instant effect)
-- ============================================================
CREATE TABLE kill_switches (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  target          kill_target NOT NULL UNIQUE,
  is_killed       BOOLEAN NOT NULL DEFAULT FALSE,
  killed_at       TIMESTAMPTZ,
  killed_reason   TEXT,
  restored_at     TIMESTAMPTZ,
  triggered_by    TEXT NOT NULL DEFAULT 'owner'
);

-- Seed all kill switch targets as OFF by default
INSERT INTO kill_switches (target) VALUES
  ('global'), ('mother'), ('tier_waveform'),
  ('tier_entangle'), ('tier_omega'), ('api'), ('downloads');

-- ============================================================
-- REVOCATION LOG  (immutable audit trail)
-- ============================================================
CREATE TABLE revocation_log (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  target_user_id  UUID REFERENCES profiles(id),
  target_email    TEXT,
  action          revoke_action NOT NULL,
  previous_tier   subscription_tier,
  new_tier        subscription_tier,
  performed_by    TEXT NOT NULL DEFAULT 'owner',
  reason          TEXT,
  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- OWNER ADMIN SESSIONS  (separate from Supabase auth)
-- Password is NEVER stored here — only in Supabase secrets.
-- ============================================================
CREATE TABLE owner_sessions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_token   TEXT UNIQUE NOT NULL,  -- bcrypt hash of random token
  otp_hash        TEXT,                  -- email OTP hash (bcrypt)
  otp_expires_at  TIMESTAMPTZ,
  otp_verified    BOOLEAN DEFAULT FALSE,
  ip_address      TEXT,
  user_agent      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at      TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '8 hours'),
  is_valid        BOOLEAN NOT NULL DEFAULT TRUE
);

-- ============================================================
-- DOWNLOAD REQUESTS  (no direct links — all gated)
-- ============================================================
CREATE TABLE download_requests (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  full_name       TEXT NOT NULL,
  email           TEXT NOT NULL,
  requested_item  TEXT NOT NULL,
  message         TEXT,
  tier            TEXT,    -- self-reported or pulled from profile
  status          TEXT NOT NULL DEFAULT 'pending',  -- pending/approved/denied
  reviewed_at     TIMESTAMPTZ,
  reviewed_by     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- STRIPE WEBHOOK EVENTS  (idempotency log)
-- ============================================================
CREATE TABLE stripe_events (
  id              TEXT PRIMARY KEY,  -- Stripe event ID
  type            TEXT NOT NULL,
  processed       BOOLEAN DEFAULT FALSE,
  processed_at    TIMESTAMPTZ,
  payload         JSONB,
  error           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE profiles          ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_accounts   ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE kill_switches     ENABLE ROW LEVEL SECURITY;
ALTER TABLE revocation_log    ENABLE ROW LEVEL SECURITY;
ALTER TABLE owner_sessions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE download_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE stripe_events     ENABLE ROW LEVEL SECURITY;

-- Profiles: users can read/update only their own row
CREATE POLICY "profiles_own" ON profiles
  FOR ALL USING (auth.uid() = id);

-- Subscriptions: users see only their own
CREATE POLICY "subscriptions_own" ON subscriptions
  FOR SELECT USING (auth.uid() = user_id);

-- Social accounts: users manage only their own
CREATE POLICY "social_own" ON social_accounts
  FOR ALL USING (auth.uid() = user_id);

-- Integrations: users manage only their own
CREATE POLICY "integrations_own" ON user_integrations
  FOR ALL USING (auth.uid() = user_id);

-- Kill switches: NO public access — only accessible via service_role (Edge Functions)
CREATE POLICY "kill_no_public" ON kill_switches
  FOR ALL USING (FALSE);

-- Revocation log: NO public access
CREATE POLICY "revoke_no_public" ON revocation_log
  FOR ALL USING (FALSE);

-- Owner sessions: NO public access
CREATE POLICY "owner_sessions_no_public" ON owner_sessions
  FOR ALL USING (FALSE);

-- Download requests: anyone can INSERT (submit form), no read
CREATE POLICY "download_insert" ON download_requests
  FOR INSERT WITH CHECK (TRUE);

-- Stripe events: NO public access
CREATE POLICY "stripe_no_public" ON stripe_events
  FOR ALL USING (FALSE);

-- ============================================================
-- ACCOUNT SLOT ENFORCEMENT (tier limits)
-- Enforced at Edge Function level + DB trigger as backup
-- ============================================================
CREATE OR REPLACE FUNCTION check_social_account_limit()
RETURNS TRIGGER AS $$
DECLARE
  user_tier subscription_tier;
  account_count INTEGER;
  max_allowed INTEGER;
BEGIN
  SELECT tier INTO user_tier FROM profiles WHERE id = NEW.user_id;

  SELECT COUNT(*) INTO account_count
    FROM social_accounts
    WHERE user_id = NEW.user_id AND is_active = TRUE;

  max_allowed := CASE user_tier
    WHEN 'waveform'    THEN 1
    WHEN 'entangle'    THEN 3
    WHEN 'omega_core'  THEN 2147483647  -- effectively unlimited
    ELSE 0
  END;

  IF account_count >= max_allowed THEN
    RAISE EXCEPTION 'Account limit reached for your tier (% allowed).', max_allowed;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER enforce_social_account_limit
  BEFORE INSERT ON social_accounts
  FOR EACH ROW EXECUTE FUNCTION check_social_account_limit();

-- ============================================================
-- AUTO-UPDATE updated_at
-- ============================================================
CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER subscriptions_updated_at
  BEFORE UPDATE ON subscriptions FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER integrations_updated_at
  BEFORE UPDATE ON user_integrations FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX idx_profiles_stripe       ON profiles(stripe_customer_id);
CREATE INDEX idx_profiles_tier         ON profiles(tier);
CREATE INDEX idx_profiles_status       ON profiles(status);
CREATE INDEX idx_subscriptions_user    ON subscriptions(user_id);
CREATE INDEX idx_subscriptions_stripe  ON subscriptions(stripe_subscription_id);
CREATE INDEX idx_social_user           ON social_accounts(user_id);
CREATE INDEX idx_revoke_user           ON revocation_log(target_user_id);
CREATE INDEX idx_stripe_events_type    ON stripe_events(type);
