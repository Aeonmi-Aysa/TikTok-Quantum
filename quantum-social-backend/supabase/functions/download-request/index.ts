// ============================================================
// QUANTUM SOCIAL — DOWNLOAD REQUEST EDGE FUNCTION
// Route: POST /functions/v1/download-request
//
// All download requests outside Quantum Social go through
// this function → stored in DB + emailed to support@aeonmi.ai
// No file is ever served automatically.
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_KEY   = Deno.env.get("RESEND_API_KEY")!;
const SUPPORT_EMAIL = "support@aeonmi.ai";

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json"
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: cors });

  let body: Record<string, string>;
  try { body = await req.json(); }
  catch { return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400, headers: cors }); }

  const { full_name, email, requested_item, message, tier } = body;

  if (!full_name || !email || !requested_item) {
    return new Response(JSON.stringify({ error: "Name, email, and requested item are required." }), { status: 400, headers: cors });
  }

  // Basic email validation
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return new Response(JSON.stringify({ error: "Invalid email address." }), { status: 400, headers: cors });
  }

  // Store in DB
  const { error: dbError } = await supabase.from("download_requests").insert({
    full_name, email, requested_item, message: message ?? "", tier: tier ?? "unknown"
  });

  if (dbError) {
    return new Response(JSON.stringify({ error: "Could not store request." }), { status: 500, headers: cors });
  }

  // Email to support@aeonmi.ai
  const emailRes = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "Quantum Social <noreply@aeonmi.ai>",
      to: [SUPPORT_EMAIL],
      reply_to: email,
      subject: `[Download Request] ${requested_item} — ${full_name}`,
      html: `
        <h2>New Download Request</h2>
        <table style="border-collapse:collapse;width:100%">
          <tr><td style="padding:8px;border:1px solid #333;font-weight:bold">Name</td><td style="padding:8px;border:1px solid #333">${full_name}</td></tr>
          <tr><td style="padding:8px;border:1px solid #333;font-weight:bold">Email</td><td style="padding:8px;border:1px solid #333">${email}</td></tr>
          <tr><td style="padding:8px;border:1px solid #333;font-weight:bold">Requested</td><td style="padding:8px;border:1px solid #333">${requested_item}</td></tr>
          <tr><td style="padding:8px;border:1px solid #333;font-weight:bold">Tier</td><td style="padding:8px;border:1px solid #333">${tier ?? "Unknown"}</td></tr>
          <tr><td style="padding:8px;border:1px solid #333;font-weight:bold">Message</td><td style="padding:8px;border:1px solid #333">${message ?? "(none)"}</td></tr>
          <tr><td style="padding:8px;border:1px solid #333;font-weight:bold">Time</td><td style="padding:8px;border:1px solid #333">${new Date().toISOString()}</td></tr>
        </table>
        <p style="margin-top:16px">Reply directly to this email to respond to the requester.</p>
      `
    })
  });

  if (!emailRes.ok) {
    console.error("Email send failed:", await emailRes.text());
    // Still return success — request is saved in DB
  }

  // Confirmation to requester
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "Quantum Social <noreply@aeonmi.ai>",
      to: [email],
      subject: "We received your request — Quantum Social",
      html: `
        <h2>Request received, ${full_name}.</h2>
        <p>We have your request for: <strong>${requested_item}</strong>.</p>
        <p>Our team reviews all requests manually. You will hear back at this email address.</p>
        <p>— Quantum Social / AEONMI</p>
      `
    })
  });

  return new Response(JSON.stringify({ ok: true, message: "Request submitted. Check your email for confirmation." }), { headers: cors });
});
