// ============================================================
// QUANTUM SOCIAL — STRIPE WEBHOOK EDGE FUNCTION
// Route: POST /functions/v1/stripe-webhook
//
// Set in Stripe Dashboard → Webhooks → Endpoint URL:
//   https://qdnijmpcedgrpalnlojp.supabase.co/functions/v1/stripe-webhook
//
// Events to enable in Stripe Dashboard:
//   customer.subscription.created
//   customer.subscription.updated
//   customer.subscription.deleted
//   invoice.payment_succeeded
//   invoice.payment_failed
//   checkout.session.completed
//
// Secrets to set in Supabase Edge Function secrets:
//   STRIPE_SECRET_KEY        = sk_live_...
//   STRIPE_WEBHOOK_SECRET    = whsec_...
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14?target=deno";

const SUPABASE_URL   = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY    = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const STRIPE_KEY     = Deno.env.get("STRIPE_SECRET_KEY")!;
const WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET")!;

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
const stripe   = new Stripe(STRIPE_KEY, { apiVersion: "2024-04-10", httpClient: Stripe.createFetchHttpClient() });

// ── Live Stripe Price ID → Tier map ──────────────────────────
const PRICE_TO_TIER: Record<string, string> = {
  "price_1TM2GNIJONruX42XJnUV3xYp": "waveform",    // WAVEFORM Monthly
  "price_1TM2rwIJONruX42XVZBXMRm6": "entangle",    // ENTANGLE Monthly
  "price_1TM2vqIJONruX42X0GyYRJ7f": "entangle",    // ENTANGLE Annual
  "price_1TM32KIJONruX42XCejJAs7A": "omega_core",  // OMEGA CORE Monthly
  "price_1TM3HcIJONruX42Xf42VxO12": "omega_core",  // OMEGA CORE Annual
};

async function getTierFromPriceId(priceId: string): Promise<string | null> {
  // Check hardcoded map first
  if (PRICE_TO_TIER[priceId]) return PRICE_TO_TIER[priceId];
  // Fallback: fetch from Stripe and check metadata
  try {
    const price = await stripe.prices.retrieve(priceId);
    const product = await stripe.products.retrieve(price.product as string);
    return (product.metadata?.tier ?? null);
  } catch { return null; }
}

function tierToBillingCycle(priceId: string): string {
  return priceId.includes("annual") ? "annual" : "monthly";
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) return new Response("Missing signature", { status: 400 });

  const body = await req.text();
  let event: Stripe.Event;

  try {
    event = await stripe.webhooks.constructEventAsync(body, signature, WEBHOOK_SECRET);
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    return new Response("Invalid signature", { status: 400 });
  }

  // Idempotency check
  const { data: existing } = await supabase
    .from("stripe_events")
    .select("id, processed")
    .eq("id", event.id)
    .single();

  if (existing?.processed) {
    return new Response(JSON.stringify({ ok: true, skipped: true }), { status: 200 });
  }

  // Log event
  await supabase.from("stripe_events").upsert({
    id: event.id,
    type: event.type,
    payload: event.data,
    processed: false
  });

  try {
    switch (event.type) {

      // ── Checkout completed (initial purchase) ─────────────
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const customerId = session.customer as string;
        const subscriptionId = session.subscription as string;
        const userEmail = session.customer_email ?? session.customer_details?.email;

        if (!subscriptionId || !userEmail) break;

        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        const priceId = subscription.items.data[0]?.price.id ?? "";
        const tier = await getTierFromPriceId(priceId);
        if (!tier) break;

        // Find user by email
        const { data: { users } } = await supabase.auth.admin.listUsers();
        const user = users.find(u => u.email === userEmail);
        if (!user) break;

        // Update profile
        await supabase.from("profiles").update({
          tier,
          status: "active",
          is_active: true,
          stripe_customer_id: customerId,
          stripe_subscription_id: subscriptionId,
          billing_cycle: tierToBillingCycle(priceId),
          tier_expires_at: new Date(subscription.current_period_end * 1000).toISOString()
        }).eq("id", user.id);

        // Upsert subscription record
        await supabase.from("subscriptions").upsert({
          user_id: user.id,
          tier,
          stripe_subscription_id: subscriptionId,
          stripe_price_id: priceId,
          billing_cycle: tierToBillingCycle(priceId),
          status: subscription.status,
          current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
          current_period_end: new Date(subscription.current_period_end * 1000).toISOString()
        }, { onConflict: "stripe_subscription_id" });

        break;
      }

      // ── Subscription updated (upgrade/downgrade) ──────────
      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        const priceId = sub.items.data[0]?.price.id ?? "";
        const tier = await getTierFromPriceId(priceId);

        await supabase.from("subscriptions").update({
          tier: tier ?? undefined,
          status: sub.status,
          stripe_price_id: priceId,
          current_period_start: new Date(sub.current_period_start * 1000).toISOString(),
          current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
          cancel_at_period_end: sub.cancel_at_period_end
        }).eq("stripe_subscription_id", sub.id);

        if (tier) {
          await supabase.from("profiles").update({
            tier,
            billing_cycle: tierToBillingCycle(priceId),
            tier_expires_at: new Date(sub.current_period_end * 1000).toISOString()
          }).eq("stripe_subscription_id", sub.id);
        }
        break;
      }

      // ── Subscription deleted/canceled ─────────────────────
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;

        await supabase.from("subscriptions").update({
          status: "canceled",
          canceled_at: new Date().toISOString()
        }).eq("stripe_subscription_id", sub.id);

        await supabase.from("profiles").update({
          tier: null,
          status: "active",  // account stays, just no tier
          is_active: false,
          stripe_subscription_id: null,
          tier_expires_at: null
        }).eq("stripe_subscription_id", sub.id);

        break;
      }

      // ── Payment succeeded ─────────────────────────────────
      case "invoice.payment_succeeded": {
        const invoice = event.data.object as Stripe.Invoice;
        const subId = invoice.subscription as string;
        if (!subId) break;

        const sub = await stripe.subscriptions.retrieve(subId);
        await supabase.from("subscriptions").update({
          status: "active",
          current_period_start: new Date(sub.current_period_start * 1000).toISOString(),
          current_period_end: new Date(sub.current_period_end * 1000).toISOString()
        }).eq("stripe_subscription_id", subId);

        await supabase.from("profiles").update({
          is_active: true,
          status: "active",
          tier_expires_at: new Date(sub.current_period_end * 1000).toISOString()
        }).eq("stripe_subscription_id", subId);

        break;
      }

      // ── Payment failed ────────────────────────────────────
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const subId = invoice.subscription as string;
        if (!subId) break;

        await supabase.from("subscriptions")
          .update({ status: "past_due" })
          .eq("stripe_subscription_id", subId);

        await supabase.from("profiles")
          .update({ is_active: false, status: "suspended" })
          .eq("stripe_subscription_id", subId);

        break;
      }
    }

    // Mark processed
    await supabase.from("stripe_events").update({
      processed: true,
      processed_at: new Date().toISOString()
    }).eq("id", event.id);

    return new Response(JSON.stringify({ received: true }), { status: 200 });

  } catch (err) {
    console.error("Webhook processing error:", err);
    await supabase.from("stripe_events").update({
      error: String(err)
    }).eq("id", event.id);
    return new Response(JSON.stringify({ error: "Processing failed" }), { status: 500 });
  }
});
