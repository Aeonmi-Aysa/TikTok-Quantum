// ============================================================
// QUANTUM SOCIAL — KILL SWITCH EDGE FUNCTION
// Route: POST /functions/v1/kill-switch
//
// Requires valid admin token in Authorization header.
// Actions:
//   activate   — kill a target
//   restore    — restore a target
//   status     — get all kill switch states
//   revoke_user — instantly revoke a specific user
//   restore_user — restore a specific user
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as bcrypt from "https://deno.land/x/bcrypt@v0.4.1/mod.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const JWT_SECRET   = Deno.env.get("ADMIN_JWT_SECRET")!;
const OWNER_EMAIL  = Deno.env.get("OWNER_EMAIL")!;
const RESEND_KEY   = Deno.env.get("RESEND_API_KEY")!;

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const cors = {
  "Access-Control-Allow-Origin": "https://aeonmi.ai",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Content-Type": "application/json"
};

// ── Admin token verification ──────────────────────────────

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
    const { data } = await supabase
      .from("owner_sessions")
      .select("is_valid")
      .eq("session_token", payload.session_id)
      .eq("otp_verified", true)
      .eq("is_valid", true)
      .single();
    return !!data;
  } catch { return false; }
}

async function notifyOwner(subject: string, html: string) {
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "Quantum Social <noreply@aeonmi.ai>",
      to: [OWNER_EMAIL],
      subject,
      html
    })
  });
}

// ── Main Handler ──────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: cors });

  // Validate admin token
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace("Bearer ", "").trim();
  const isAdmin = await verifyAdminToken(token);
  if (!isAdmin) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: cors });

  let body: Record<string, string>;
  try { body = await req.json(); }
  catch { return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400, headers: cors }); }

  const { action, target, user_id, reason } = body;

  // ── GET STATUS of all kill switches ──────────────────────
  if (action === "status") {
    const { data, error } = await supabase.from("kill_switches").select("*");
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: cors });
    return new Response(JSON.stringify({ switches: data }), { headers: cors });
  }

  // ── ACTIVATE a kill switch ────────────────────────────────
  if (action === "activate") {
    if (!target) return new Response(JSON.stringify({ error: "Missing target" }), { status: 400, headers: cors });

    const { error } = await supabase.from("kill_switches")
      .update({ is_killed: true, killed_at: new Date().toISOString(), killed_reason: reason ?? "Owner activated" })
      .eq("target", target);

    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: cors });

    // If global kill — also suspend all active users immediately
    if (target === "global" || target === "api") {
      await supabase.from("profiles")
        .update({ is_active: false })
        .eq("status", "active");
    }

    // If tier-specific kill — deactivate that tier
    if (["tier_waveform", "tier_entangle", "tier_omega"].includes(target)) {
      const tierName = target.replace("tier_", "").replace("_", "_");
      await supabase.from("profiles")
        .update({ is_active: false })
        .eq("tier", tierName);
    }

    await notifyOwner(
      `[QS ALERT] Kill switch activated: ${target}`,
      `<h2>Kill switch ACTIVATED</h2><p>Target: <strong>${target}</strong></p><p>Reason: ${reason ?? "None"}</p><p>Time: ${new Date().toISOString()}</p>`
    );

    return new Response(JSON.stringify({ ok: true, message: `Kill switch activated: ${target}` }), { headers: cors });
  }

  // ── RESTORE a kill switch ─────────────────────────────────
  if (action === "restore") {
    if (!target) return new Response(JSON.stringify({ error: "Missing target" }), { status: 400, headers: cors });

    const { error } = await supabase.from("kill_switches")
      .update({ is_killed: false, restored_at: new Date().toISOString() })
      .eq("target", target);

    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: cors });

    // Restore users if global was lifted
    if (target === "global" || target === "api") {
      await supabase.from("profiles")
        .update({ is_active: true })
        .eq("status", "active");
    }

    return new Response(JSON.stringify({ ok: true, message: `Kill switch restored: ${target}` }), { headers: cors });
  }

  // ── REVOKE USER (instant, any reason) ────────────────────
  if (action === "revoke_user") {
    if (!user_id) return new Response(JSON.stringify({ error: "Missing user_id" }), { status: 400, headers: cors });

    const { data: profile } = await supabase.from("profiles").select("*").eq("id", user_id).single();
    if (!profile) return new Response(JSON.stringify({ error: "User not found" }), { status: 404, headers: cors });

    await supabase.from("profiles").update({
      status: "revoked",
      is_active: false,
      revoked_at: new Date().toISOString(),
      revoked_reason: reason ?? "Revoked by owner"
    }).eq("id", user_id);

    // Log it
    await supabase.from("revocation_log").insert({
      target_user_id: user_id,
      target_email: profile.email,
      action: "revoke_full",
      previous_tier: profile.tier,
      performed_by: "owner",
      reason: reason ?? "No reason provided",
      metadata: { timestamp: new Date().toISOString() }
    });

    // Invalidate all their Supabase sessions via admin API
    await supabase.auth.admin.signOut(user_id, "global");

    return new Response(JSON.stringify({ ok: true, message: `User ${profile.email} revoked` }), { headers: cors });
  }

  // ── RESTORE USER ──────────────────────────────────────────
  if (action === "restore_user") {
    if (!user_id) return new Response(JSON.stringify({ error: "Missing user_id" }), { status: 400, headers: cors });

    const { data: profile } = await supabase.from("profiles").select("*").eq("id", user_id).single();
    if (!profile) return new Response(JSON.stringify({ error: "User not found" }), { status: 404, headers: cors });

    await supabase.from("profiles").update({
      status: "active",
      is_active: true,
      revoked_at: null,
      revoked_reason: null
    }).eq("id", user_id);

    await supabase.from("revocation_log").insert({
      target_user_id: user_id,
      target_email: profile.email,
      action: "restore",
      previous_tier: "revoked" as any,
      new_tier: profile.tier,
      performed_by: "owner",
      reason: reason ?? "Restored by owner"
    });

    return new Response(JSON.stringify({ ok: true, message: `User ${profile.email} restored` }), { headers: cors });
  }

  // ── MOTHER RECALL — kill Mother AI connections ────────────
  if (action === "mother_recall") {
    // Activate the mother kill switch
    await supabase.from("kill_switches")
      .update({ is_killed: true, killed_at: new Date().toISOString(), killed_reason: "Mother recall initiated by owner" })
      .eq("target", "mother");

    // Revoke all integrations tagged as mother/AI
    // (In practice, this signals all connected endpoints to disconnect)
    await supabase.from("user_integrations")
      .update({ is_verified: false })
      .eq("integration_type", "custom");

    await notifyOwner(
      "[QS CRITICAL] Mother AI recall activated",
      `<h2>Mother Recall ACTIVATED</h2><p>All Mother AI connections have been severed.</p><p>Time: ${new Date().toISOString()}</p><p>Reason: ${reason ?? "Owner initiated"}</p>`
    );

    return new Response(JSON.stringify({ ok: true, message: "Mother AI recalled. All connections severed." }), { headers: cors });
  }

  return new Response(JSON.stringify({ error: "Unknown action" }), { status: 400, headers: cors });
});
