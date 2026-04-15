// ============================================================
// QUANTUM SOCIAL — ADMIN AUTH EDGE FUNCTION
// Route: POST /functions/v1/admin-auth
//
// Flow:
//   Step 1: POST { action: "login", password: "..." }
//           → validates against OWNER_PASSWORD_HASH secret
//           → sends OTP to OWNER_EMAIL secret
//           → returns { step: "otp_required", session_id }
//
//   Step 2: POST { action: "verify_otp", session_id, otp: "..." }
//           → validates OTP
//           → returns { token } (8-hour admin JWT)
//
//   Step 3: POST { action: "validate", token: "..." }
//           → validates active session (use on every admin page load)
//
// PASSWORD is NEVER in this file.
// Set it in Supabase Dashboard → Settings → Edge Functions → Secrets:
//   OWNER_PASSWORD_HASH  = bcrypt hash of your password
//   OWNER_EMAIL          = your email for OTP delivery
//   ADMIN_JWT_SECRET     = random 64-char string (generate once)
//   RESEND_API_KEY       = your Resend.com API key (free tier fine)
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as bcrypt from "https://deno.land/x/bcrypt@v0.4.1/mod.ts";

const SUPABASE_URL   = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY    = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OWNER_HASH     = Deno.env.get("OWNER_PASSWORD_HASH")!;
const OWNER_EMAIL    = Deno.env.get("OWNER_EMAIL")!;
const JWT_SECRET     = Deno.env.get("ADMIN_JWT_SECRET")!;
const RESEND_KEY     = Deno.env.get("RESEND_API_KEY")!;

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

// ── Helpers ─────────────────────────────────────────────────

function randomOTP(len = 6): string {
  const digits = "0123456789";
  const arr = new Uint8Array(len);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b => digits[b % 10]).join("");
}

async function signAdminToken(sessionId: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", encoder.encode(JWT_SECRET), { name: "HMAC", hash: "SHA-256" },
    false, ["sign"]
  );
  const payload = { sub: "owner", session_id: sessionId, iat: Date.now(), exp: Date.now() + 8 * 3600 * 1000 };
  const header  = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body    = btoa(JSON.stringify(payload));
  const sig     = await crypto.subtle.sign("HMAC", key, encoder.encode(`${header}.${body}`));
  const sigB64  = btoa(String.fromCharCode(...new Uint8Array(sig)));
  return `${header}.${body}.${sigB64}`;
}

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
    // Check session still active in DB
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

async function sendOTP(otp: string, ip: string): Promise<void> {
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "Quantum Social <noreply@aeonmi.ai>",
      to: [OWNER_EMAIL],
      subject: `Admin Access Code: ${otp}`,
      html: `
        <h2>Quantum Social Admin Login</h2>
        <p>Your one-time access code:</p>
        <h1 style="letter-spacing:8px;font-size:48px;">${otp}</h1>
        <p>Expires in 10 minutes. IP: ${ip}</p>
        <p>If you did not request this, your admin URL may be compromised.</p>
      `
    })
  });
}

// ── Main Handler ─────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  const cors = {
    "Access-Control-Allow-Origin": "https://aeonmi.ai",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json"
  };

  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: cors });

  let body: Record<string, string>;
  try { body = await req.json(); }
  catch { return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400, headers: cors }); }

  const ip = req.headers.get("x-forwarded-for") ?? "unknown";
  const ua = req.headers.get("user-agent") ?? "unknown";

  // ── STEP 1: Password validation ──────────────────────────
  if (body.action === "login") {
    const { password } = body;
    if (!password) return new Response(JSON.stringify({ error: "Missing password" }), { status: 400, headers: cors });

    // Rate limiting: max 5 failed attempts per IP per 15min would be enforced
    // at Supabase edge level / Cloudflare — simple check here
    const valid = await bcrypt.compare(password, OWNER_HASH);
    if (!valid) {
      // Generic error — never reveal whether URL or password is wrong
      await new Promise(r => setTimeout(r, 1500)); // timing-safe delay
      return new Response(JSON.stringify({ error: "Authentication failed" }), { status: 401, headers: cors });
    }

    // Generate OTP + session
    const otp = randomOTP(6);
    const otpHash = await bcrypt.hash(otp);
    const sessionId = crypto.randomUUID();

    const { error } = await supabase.from("owner_sessions").insert({
      session_token: sessionId,
      otp_hash: otpHash,
      otp_expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      ip_address: ip,
      user_agent: ua,
      otp_verified: false
    });

    if (error) return new Response(JSON.stringify({ error: "Session error" }), { status: 500, headers: cors });

    await sendOTP(otp, ip);
    return new Response(JSON.stringify({ step: "otp_required", session_id: sessionId }), { headers: cors });
  }

  // ── STEP 2: OTP verification ─────────────────────────────
  if (body.action === "verify_otp") {
    const { session_id, otp } = body;
    if (!session_id || !otp) return new Response(JSON.stringify({ error: "Missing fields" }), { status: 400, headers: cors });

    const { data: session } = await supabase
      .from("owner_sessions")
      .select("*")
      .eq("session_token", session_id)
      .eq("is_valid", true)
      .eq("otp_verified", false)
      .single();

    if (!session) return new Response(JSON.stringify({ error: "Invalid session" }), { status: 401, headers: cors });
    if (new Date(session.otp_expires_at) < new Date()) {
      return new Response(JSON.stringify({ error: "OTP expired" }), { status: 401, headers: cors });
    }

    const otpValid = await bcrypt.compare(otp, session.otp_hash);
    if (!otpValid) {
      await new Promise(r => setTimeout(r, 1000));
      return new Response(JSON.stringify({ error: "Invalid code" }), { status: 401, headers: cors });
    }

    // Mark verified
    await supabase.from("owner_sessions")
      .update({ otp_verified: true })
      .eq("session_token", session_id);

    const token = await signAdminToken(session_id);
    return new Response(JSON.stringify({ token }), { headers: cors });
  }

  // ── STEP 3: Token validation ─────────────────────────────
  if (body.action === "validate") {
    const { token } = body;
    if (!token) return new Response(JSON.stringify({ valid: false }), { headers: cors });
    const valid = await verifyAdminToken(token);
    return new Response(JSON.stringify({ valid }), { headers: cors });
  }

  // ── STEP 4: Logout ───────────────────────────────────────
  if (body.action === "logout") {
    const { token } = body;
    if (token) {
      try {
        const [, b] = token.split(".");
        const payload = JSON.parse(atob(b));
        await supabase.from("owner_sessions")
          .update({ is_valid: false })
          .eq("session_token", payload.session_id);
      } catch { /* ignore */ }
    }
    return new Response(JSON.stringify({ ok: true }), { headers: cors });
  }

  return new Response(JSON.stringify({ error: "Unknown action" }), { status: 400, headers: cors });
});
