// ============================================================
// AEONMI — NEWSLETTER SIGNUP EDGE FUNCTION
// Route: POST /functions/v1/newsletter-signup
//
// Public endpoint (no auth required).
// Handles subscribe, confirm, and unsubscribe actions.
//
// Subscribe:  { action:"subscribe",  email, first_name?, frequency? }
// Confirm:    { action:"confirm",    token }
// Unsubscribe:{ action:"unsubscribe",token }
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL  = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY   = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_KEY    = Deno.env.get("RESEND_API_KEY")!;
const SITE_URL      = "https://aeonmi.ai";
const FROM_EMAIL    = "Aeonmi <newsletter@aeonmi.ai>";

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const cors = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json"
};

// ── Resend helper ─────────────────────────────────────────────
async function sendEmail(to: string, subject: string, html: string) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${RESEND_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ from: FROM_EMAIL, to, subject, html })
  });
  if (!res.ok) {
    const err = await res.text();
    console.error("Resend error:", err);
  }
}

// ── Email templates ───────────────────────────────────────────
function confirmationEmail(firstName: string, token: string, frequency: string) {
  const confirmUrl = `${SITE_URL}/newsletter/confirm?token=${token}`;
  const name = firstName || "there";
  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#050508;font-family:'Segoe UI',system-ui,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr><td align="center" style="padding:48px 24px;">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#0d0d14;border:1px solid #1e1e2e;border-radius:16px;overflow:hidden;max-width:560px;">
        <!-- Header -->
        <tr><td style="background:linear-gradient(135deg,#7c3aed,#06b6d4);padding:40px;text-align:center;">
          <div style="font-size:36px;margin-bottom:12px;">⚛</div>
          <h1 style="color:#fff;font-size:24px;font-weight:700;margin:0;letter-spacing:-0.3px;">Aeonmi</h1>
          <p style="color:rgba(255,255,255,0.8);font-size:14px;margin:8px 0 0;">Intelligence. Innovation. Impact.</p>
        </td></tr>
        <!-- Body -->
        <tr><td style="padding:40px;">
          <h2 style="color:#e2e2f0;font-size:20px;font-weight:600;margin:0 0 16px;">Confirm your subscription</h2>
          <p style="color:#9898b8;font-size:15px;line-height:1.7;margin:0 0 24px;">
            Hey ${name}, thanks for signing up for the Aeonmi ${frequency} newsletter.
            One click to confirm and you're in.
          </p>
          <div style="text-align:center;margin:32px 0;">
            <a href="${confirmUrl}" style="display:inline-block;background:linear-gradient(135deg,#7c3aed,#6d28d9);color:#fff;text-decoration:none;padding:14px 36px;border-radius:10px;font-size:15px;font-weight:600;letter-spacing:0.2px;">
              Confirm Subscription →
            </a>
          </div>
          <p style="color:#6b6b8a;font-size:13px;line-height:1.6;margin:0;">
            If you didn't sign up for this, just ignore this email — you won't hear from us again.<br/>
            This link expires in 24 hours.
          </p>
        </td></tr>
        <!-- Footer -->
        <tr><td style="border-top:1px solid #1e1e2e;padding:24px 40px;text-align:center;">
          <p style="color:#6b6b8a;font-size:12px;margin:0;">
            © ${new Date().getFullYear()} Aeonmi · <a href="${SITE_URL}" style="color:#7c3aed;text-decoration:none;">aeonmi.ai</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function welcomeEmail(firstName: string, frequency: string) {
  const name = firstName || "there";
  const unsubUrl = `${SITE_URL}/newsletter/unsubscribe`;
  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#050508;font-family:'Segoe UI',system-ui,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr><td align="center" style="padding:48px 24px;">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#0d0d14;border:1px solid #1e1e2e;border-radius:16px;overflow:hidden;max-width:560px;">
        <tr><td style="background:linear-gradient(135deg,#7c3aed,#06b6d4);padding:40px;text-align:center;">
          <div style="font-size:36px;margin-bottom:12px;">⚛</div>
          <h1 style="color:#fff;font-size:24px;font-weight:700;margin:0;">You're in, ${name}.</h1>
          <p style="color:rgba(255,255,255,0.8);font-size:14px;margin:8px 0 0;">Aeonmi ${frequency.charAt(0).toUpperCase() + frequency.slice(1)} Newsletter</p>
        </td></tr>
        <tr><td style="padding:40px;">
          <p style="color:#9898b8;font-size:15px;line-height:1.7;margin:0 0 20px;">
            Welcome to the Aeonmi inner circle. You'll get the latest on:
          </p>
          <ul style="color:#9898b8;font-size:14px;line-height:2;padding-left:20px;margin:0 0 28px;">
            <li>Quantum Social — platform updates & new features</li>
            <li>AI automation tactics that actually work</li>
            <li>Exclusive early access to new tools & releases</li>
            <li>Creator intelligence & algorithm insights</li>
          </ul>
          <p style="color:#6b6b8a;font-size:13px;margin:0;">
            We ship ${frequency}. No noise, no filler — just signal.<br/>
            <a href="${unsubUrl}" style="color:#7c3aed;text-decoration:none;">Unsubscribe anytime</a>
          </p>
        </td></tr>
        <tr><td style="border-top:1px solid #1e1e2e;padding:24px 40px;text-align:center;">
          <p style="color:#6b6b8a;font-size:12px;margin:0;">
            © ${new Date().getFullYear()} Aeonmi · <a href="${SITE_URL}" style="color:#7c3aed;text-decoration:none;">aeonmi.ai</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ── Main handler ──────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: cors });

  let body: Record<string, string>;
  try { body = await req.json(); }
  catch { return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400, headers: cors }); }

  const action = body.action || "subscribe";

  // ── SUBSCRIBE ───────────────────────────────────────────────
  if (action === "subscribe") {
    const email     = (body.email || "").trim().toLowerCase();
    const firstName = (body.first_name || "").trim().slice(0, 50);
    const frequency = body.frequency === "monthly" ? "monthly" : "weekly";
    const source    = (body.source || "website").slice(0, 50);

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return new Response(JSON.stringify({ error: "Valid email required" }), { status: 400, headers: cors });
    }

    // Check if already confirmed
    const { data: existing } = await supabase
      .from("email_signups")
      .select("id, confirmed, frequency")
      .eq("email", email)
      .single();

    if (existing?.confirmed) {
      // Already subscribed — silently succeed (no info leak)
      return new Response(JSON.stringify({ ok: true, status: "already_subscribed" }), { headers: cors });
    }

    // Generate new token
    const tokenRes = await supabase.rpc("gen_random_uuid").single();
    const token = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");

    if (existing) {
      // Update existing unconfirmed row
      await supabase.from("email_signups").update({
        first_name: firstName || existing.first_name,
        frequency,
        source,
        unsubscribe_token: token,
        confirmed: false
      }).eq("email", email);
    } else {
      // New row
      const { error: insertErr } = await supabase.from("email_signups").insert({
        email,
        first_name: firstName || null,
        frequency,
        source,
        unsubscribe_token: token,
        subscribed: true,
        confirmed: false
      });
      if (insertErr) {
        console.error("Insert error:", insertErr);
        return new Response(JSON.stringify({ error: "Signup failed" }), { status: 500, headers: cors });
      }
    }

    // Send confirmation email
    await sendEmail(
      email,
      "Confirm your Aeonmi newsletter subscription",
      confirmationEmail(firstName, token, frequency)
    );

    return new Response(JSON.stringify({ ok: true, status: "confirmation_sent" }), { headers: cors });
  }

  // ── CONFIRM ─────────────────────────────────────────────────
  if (action === "confirm") {
    const token = (body.token || "").trim();
    if (!token) return new Response(JSON.stringify({ error: "Token required" }), { status: 400, headers: cors });

    const { data, error } = await supabase
      .from("email_signups")
      .select("id, email, first_name, frequency, confirmed")
      .eq("unsubscribe_token", token)
      .single();

    if (error || !data) {
      return new Response(JSON.stringify({ error: "Invalid or expired token" }), { status: 404, headers: cors });
    }

    if (!data.confirmed) {
      await supabase.from("email_signups").update({
        confirmed: true,
        confirmed_at: new Date().toISOString()
      }).eq("id", data.id);

      // Send welcome email
      await sendEmail(
        data.email,
        `Welcome to Aeonmi — you're subscribed!`,
        welcomeEmail(data.first_name || "", data.frequency || "weekly")
      );
    }

    return new Response(JSON.stringify({ ok: true, status: "confirmed", email: data.email }), { headers: cors });
  }

  // ── UNSUBSCRIBE ─────────────────────────────────────────────
  if (action === "unsubscribe") {
    const token = (body.token || "").trim();
    const email = (body.email || "").trim().toLowerCase();

    if (!token && !email) {
      return new Response(JSON.stringify({ error: "Token or email required" }), { status: 400, headers: cors });
    }

    const query = supabase.from("email_signups").update({ subscribed: false, confirmed: false });
    if (token) query.eq("unsubscribe_token", token);
    else query.eq("email", email);

    await query;
    return new Response(JSON.stringify({ ok: true, status: "unsubscribed" }), { headers: cors });
  }

  return new Response(JSON.stringify({ error: "Unknown action" }), { status: 400, headers: cors });
});
