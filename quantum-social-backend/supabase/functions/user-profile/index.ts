// ============================================================
// QUANTUM SOCIAL — USER PROFILE EDGE FUNCTION
// Route: POST /functions/v1/user-profile
//
// Admin actions (require admin token):
//   list_users, set_tier, list_download_requests
//
// User actions (require Supabase user JWT):
//   get_profile, update_profile, get_tier_features
//   save_integration, delete_integration
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const JWT_SECRET   = Deno.env.get("ADMIN_JWT_SECRET")!;

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Content-Type": "application/json"
};

// ── Tier feature map ────────────────────────────────────────
const TIER_FEATURES = {
  waveform: {
    max_accounts: 1,
    ai_content_intelligence: "basic",
    algorithm_monitor: "daily",
    hook_retention_scoring: true,
    shadowban_scanner: true,
    seo_caption_hashtag: true,
    fleet_control: true,
    revenue_singularity: true,
    agent_swarms: "manual",
    trend_forecasting: true,
    cross_platform: false,
    campaign_planner: false,
    rps_crs_scoring: false,
    priority_support: false,
    omega_godcore: false,
    full_agent_swarms: false,
    quantum_annealing: false,
    mother_ai_export: false,
    on_chain_ledger: false,
    onboarding_call: false,
    founder_access: false
  },
  entangle: {
    max_accounts: 3,
    ai_content_intelligence: "full",
    algorithm_monitor: "realtime",
    hook_retention_scoring: true,
    shadowban_scanner: true,
    seo_caption_hashtag: true,
    fleet_control: true,
    revenue_singularity: true,
    agent_swarms: "manual",
    trend_forecasting: true,
    cross_platform: true,
    campaign_planner: true,
    rps_crs_scoring: true,
    priority_support: true,
    omega_godcore: true,
    full_agent_swarms: false,
    quantum_annealing: false,
    mother_ai_export: false,
    on_chain_ledger: false,
    onboarding_call: false,
    founder_access: false
  },
  omega_core: {
    max_accounts: -1,  // unlimited
    ai_content_intelligence: "full",
    algorithm_monitor: "realtime",
    hook_retention_scoring: true,
    shadowban_scanner: true,
    seo_caption_hashtag: true,
    fleet_control: true,
    revenue_singularity: true,
    agent_swarms: "full_autonomous",
    trend_forecasting: true,
    cross_platform: true,
    campaign_planner: true,
    rps_crs_scoring: true,
    priority_support: true,
    omega_godcore: true,
    full_agent_swarms: true,
    quantum_annealing: true,
    mother_ai_export: true,
    on_chain_ledger: true,
    onboarding_call: true,
    founder_access: true
  }
};

// ── Verify admin token ──────────────────────────────────────
async function verifyAdminToken(token: string): Promise<boolean> {
  try {
    const [header, body, sig] = token.split(".");
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw", encoder.encode(JWT_SECRET), { name: "HMAC", hash: "SHA-256" },
      false, ["verify"]
    );
    const sigBytes = Uint8Array.from(atob(sig), c => c.charCodeAt(0));
    const valid = await crypto.subtle.verify("HMAC", key, sigBytes, encoder.encode(`${header}.${body}`));
    if (!valid) return false;
    const payload = JSON.parse(atob(body));
    if (payload.exp < Date.now()) return false;
    const { data } = await supabase.from("owner_sessions")
      .select("is_valid").eq("session_token", payload.session_id)
      .eq("otp_verified", true).eq("is_valid", true).single();
    return !!data;
  } catch { return false; }
}

// ── Verify user JWT (Supabase) ──────────────────────────────
async function getUserFromToken(token: string): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getUser(token);
    return data.user?.id ?? null;
  } catch { return null; }
}

// ── Check system kill switches ──────────────────────────────
async function isKilled(targets: string[]): Promise<boolean> {
  const { data } = await supabase.from("kill_switches")
    .select("target, is_killed").in("target", ["global", ...targets]);
  return (data ?? []).some(sw => sw.is_killed);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: cors });

  let body: Record<string, any>;
  try { body = await req.json(); }
  catch { return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400, headers: cors }); }

  const { action } = body;
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace("Bearer ", "").trim();

  // ════════════════════════════════════════════════════════
  // ADMIN ACTIONS
  // ════════════════════════════════════════════════════════

  if (["list_users", "set_tier", "list_download_requests"].includes(action)) {
    const isAdmin = await verifyAdminToken(token);
    if (!isAdmin) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: cors });

    // ── List all users ──────────────────────────────────
    if (action === "list_users") {
      const { data: users, error } = await supabase
        .from("profiles")
        .select("id, email, full_name, tier, status, is_active, billing_cycle, tier_expires_at, created_at, stripe_customer_id")
        .order("created_at", { ascending: false });
      if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: cors });
      return new Response(JSON.stringify({ users }), { headers: cors });
    }

    // ── Set tier (admin override) ───────────────────────
    if (action === "set_tier") {
      const { user_id, tier } = body;
      if (!user_id) return new Response(JSON.stringify({ error: "Missing user_id" }), { status: 400, headers: cors });

      const { data: profile } = await supabase.from("profiles").select("tier").eq("id", user_id).single();

      await supabase.from("profiles").update({
        tier: tier || null,
        is_active: !!tier,
        status: tier ? "active" : "active"
      }).eq("id", user_id);

      await supabase.from("revocation_log").insert({
        target_user_id: user_id,
        action: "tier_change",
        previous_tier: profile?.tier,
        new_tier: tier || null,
        performed_by: "owner",
        reason: "Admin manual tier assignment"
      });

      return new Response(JSON.stringify({ ok: true }), { headers: cors });
    }

    // ── List download requests ──────────────────────────
    if (action === "list_download_requests") {
      const { data: requests, error } = await supabase
        .from("download_requests")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: cors });
      return new Response(JSON.stringify({ requests }), { headers: cors });
    }
  }

  // ════════════════════════════════════════════════════════
  // USER ACTIONS  (requires Supabase user JWT)
  // ════════════════════════════════════════════════════════

  const userId = await getUserFromToken(token);
  if (!userId) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: cors });

  // Check global kill switch first
  if (await isKilled(["api"])) {
    return new Response(JSON.stringify({ error: "System is temporarily unavailable." }), { status: 503, headers: cors });
  }

  // ── Get profile + features ─────────────────────────────
  if (action === "get_profile") {
    const { data: profile, error } = await supabase
      .from("profiles")
      .select("id, email, full_name, tier, status, is_active, billing_cycle, tier_expires_at")
      .eq("id", userId).single();

    if (error) return new Response(JSON.stringify({ error: "Profile not found" }), { status: 404, headers: cors });
    if (!profile.is_active) return new Response(JSON.stringify({ error: "Account suspended or revoked." }), { status: 403, headers: cors });

    const features = profile.tier ? (TIER_FEATURES[profile.tier as keyof typeof TIER_FEATURES] ?? null) : null;

    // Check tier-specific kill switch
    if (profile.tier) {
      const tierKey = `tier_${profile.tier}` as any;
      if (await isKilled([tierKey])) {
        return new Response(JSON.stringify({ error: "Your tier is temporarily unavailable." }), { status: 503, headers: cors });
      }
    }

    return new Response(JSON.stringify({ profile, features }), { headers: cors });
  }

  // ── Get tier features only ─────────────────────────────
  if (action === "get_tier_features") {
    const { tier } = body;
    const features = tier ? (TIER_FEATURES[tier as keyof typeof TIER_FEATURES] ?? null) : null;
    return new Response(JSON.stringify({ features }), { headers: cors });
  }

  // ── Update profile ─────────────────────────────────────
  if (action === "update_profile") {
    const { full_name, phone } = body;
    const updates: Record<string, string> = {};
    if (full_name) updates.full_name = full_name;
    if (phone) updates.phone = phone;

    const { error } = await supabase.from("profiles").update(updates).eq("id", userId);
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: cors });
    return new Response(JSON.stringify({ ok: true }), { headers: cors });
  }

  // ── Save integration (n8n, Blender, custom) ────────────
  if (action === "save_integration") {
    const { integration_type, label, endpoint_url, api_key } = body;
    if (!integration_type || !endpoint_url) {
      return new Response(JSON.stringify({ error: "integration_type and endpoint_url required" }), { status: 400, headers: cors });
    }

    // Verify user has a tier
    const { data: profile } = await supabase.from("profiles").select("tier, is_active").eq("id", userId).single();
    if (!profile?.is_active) return new Response(JSON.stringify({ error: "Account not active" }), { status: 403, headers: cors });

    // Encrypt API key (simple XOR with env secret — in production use Vault or KMS)
    // For now store as-is; recommend enabling Supabase Vault for production
    const { error } = await supabase.from("user_integrations").upsert({
      user_id: userId,
      integration_type,
      label: label ?? integration_type,
      endpoint_url,
      api_key_encrypted: api_key ?? null,  // TODO: encrypt before storing
      is_verified: false,
      updated_at: new Date().toISOString()
    }, { onConflict: "user_id,integration_type" });

    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: cors });
    return new Response(JSON.stringify({ ok: true, message: "Integration saved. Use test endpoint to verify." }), { headers: cors });
  }

  // ── Delete integration ─────────────────────────────────
  if (action === "delete_integration") {
    const { integration_id } = body;
    if (!integration_id) return new Response(JSON.stringify({ error: "Missing integration_id" }), { status: 400, headers: cors });

    const { error } = await supabase.from("user_integrations")
      .delete().eq("id", integration_id).eq("user_id", userId);
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: cors });
    return new Response(JSON.stringify({ ok: true }), { headers: cors });
  }

  return new Response(JSON.stringify({ error: "Unknown action" }), { status: 400, headers: cors });
});
