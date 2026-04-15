// ============================================================
// QUANTUM SOCIAL — STRIPE CHECKOUT EDGE FUNCTION
// Route: POST /functions/v1/stripe-checkout
//
// Creates a Stripe Checkout Session for a given price.
// Requires a valid Supabase user JWT.
//
// Body: { price_id: string, billing_cycle?: "monthly"|"annual" }
// Returns: { url: string }  ← redirect user to this URL
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14?target=deno";

const SUPABASE_URL   = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY    = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const STRIPE_SECRET  = Deno.env.get("STRIPE_SECRET_KEY")!;
const SITE_URL       = "https://aeonmi.ai";

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
const stripe   = new Stripe(STRIPE_SECRET, { apiVersion: "2024-04-10", httpClient: Stripe.createFetchHttpClient() });

// ── Price → Tier map ─────────────────────────────────────────
const PRICE_CONFIG: Record<string, { tier: string; label: string }> = {
  "price_1TM2GNIJONruX42XJnUV3xYp": { tier: "waveform",   label: "WAVEFORM Monthly"   },
  "price_1TM2rwIJONruX42XVZBXMRm6": { tier: "entangle",   label: "ENTANGLE Monthly"   },
  "price_1TM2vqIJONruX42X0GyYRJ7f": { tier: "entangle",   label: "ENTANGLE Annual"    },
  "price_1TM32KIJONruX42XCejJAs7A": { tier: "omega_core", label: "OMEGA CORE Monthly" },
  "price_1TM3HcIJONruX42Xf42VxO12": { tier: "omega_core", label: "OMEGA CORE Annual"  },
};

const cors = {
  "Access-Control-Allow-Origin":  "https://aeonmi.ai",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Content-Type": "application/json"
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: cors });
  }

  // ── Verify Supabase user JWT ─────────────────────────────
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace("Bearer ", "").trim();
  if (!token) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: cors });

  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: cors });

  // ── Parse body ───────────────────────────────────────────
  let body: Record<string, string>;
  try { body = await req.json(); }
  catch { return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400, headers: cors }); }

  const { price_id } = body;
  if (!price_id) return new Response(JSON.stringify({ error: "price_id required" }), { status: 400, headers: cors });

  // Validate price is one we know about
  if (!PRICE_CONFIG[price_id]) {
    return new Response(JSON.stringify({ error: "Invalid price" }), { status: 400, headers: cors });
  }

  // ── Get or create Stripe customer ────────────────────────
  const { data: profile } = await supabase
    .from("profiles")
    .select("stripe_customer_id, email, full_name, is_active, tier")
    .eq("id", user.id)
    .single();

  // Block revoked accounts
  if (profile && !profile.is_active && profile.tier) {
    return new Response(JSON.stringify({ error: "Account is not active." }), { status: 403, headers: cors });
  }

  let customerId = profile?.stripe_customer_id;

  if (!customerId) {
    // Create Stripe customer linked to Supabase user
    const customer = await stripe.customers.create({
      email: profile?.email ?? user.email ?? "",
      name:  profile?.full_name ?? "",
      metadata: { supabase_user_id: user.id }
    });
    customerId = customer.id;

    // Save to profile
    await supabase.from("profiles").update({ stripe_customer_id: customerId }).eq("id", user.id);
  }

  // ── Check for existing active subscription ───────────────
  if (profile?.tier) {
    // User already has a tier → redirect to customer portal to manage
    try {
      const portalSession = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: `${SITE_URL}/dashboard.html`
      });
      return new Response(JSON.stringify({ url: portalSession.url, portal: true }), { headers: cors });
    } catch {
      // Portal not configured yet → fall through to checkout
    }
  }

  // ── Create Checkout Session ──────────────────────────────
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: price_id, quantity: 1 }],
    success_url: `${SITE_URL}/dashboard.html?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url:  `${SITE_URL}/quantum-social.html?checkout=cancelled`,
    client_reference_id: user.id,
    subscription_data: {
      metadata: {
        supabase_user_id: user.id,
        tier: PRICE_CONFIG[price_id].tier
      }
    },
    allow_promotion_codes: true,
    billing_address_collection: "required",
    metadata: {
      supabase_user_id: user.id,
      price_label: PRICE_CONFIG[price_id].label
    }
  });

  return new Response(JSON.stringify({ url: session.url }), { headers: cors });
});
