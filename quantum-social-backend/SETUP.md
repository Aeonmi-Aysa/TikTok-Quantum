# Quantum Social Backend — Setup Guide
Complete setup from zero to live. Do these steps once.

---

## STEP 1 — Create Supabase project
1. Go to https://supabase.com → New project
2. Name: `quantum-social`
3. Database password: generate a strong one, save it somewhere safe
4. Region: pick closest to your users
5. Copy your **Project URL** and **anon key** from Settings → API

---

## STEP 2 — Run the database schema
1. Supabase Dashboard → SQL Editor → New query
2. Paste the entire contents of `supabase/migrations/001_initial_schema.sql`
3. Click Run. All tables, triggers, and RLS policies are created.

---

## STEP 3 — Generate your password hash (ONE TIME ONLY)
Run this in your terminal (Node.js must be installed):

```bash
node -e "const bcrypt = require('bcryptjs'); bcrypt.hash('DarkMeta1975', 12, (e,h) => console.log(h));"
```
Or online: https://bcrypt-generator.com (rounds: 12)

Copy the output hash (starts with `$2b$12$...`). You will use it in Step 5.
**Never save the plain password anywhere except your head.**

---

## STEP 4 — Set up Resend (free email sender)
1. Go to https://resend.com → Sign up (free tier: 3,000 emails/month)
2. Add your domain `aeonmi.ai` and verify DNS
3. API Keys → Create API Key → copy it

---

## STEP 5 — Set Edge Function secrets
Supabase Dashboard → Settings → Edge Functions → Add the following secrets:

| Secret Name | Value |
|-------------|-------|
| `OWNER_PASSWORD_HASH` | The bcrypt hash from Step 3 |
| `OWNER_EMAIL` | Your email (where OTP is sent) |
| `ADMIN_JWT_SECRET` | Any random 64-character string (generate at https://1password.com/password-generator/) |
| `RESEND_API_KEY` | Your Resend API key from Step 4 |
| `STRIPE_SECRET_KEY` | sk_live_... from Stripe Dashboard |
| `STRIPE_WEBHOOK_SECRET` | whsec_... from Stripe webhook setup (Step 7) |
| `SUPABASE_URL` | Your project URL (auto-set, but add manually if needed) |
| `SUPABASE_SERVICE_ROLE_KEY` | From Supabase → Settings → API → service_role key |

---

## STEP 6 — Deploy Edge Functions
Install Supabase CLI: https://supabase.com/docs/guides/cli

```bash
supabase login
supabase link --project-ref qdnijmpcedgrpalnlojp
supabase functions deploy admin-auth
supabase functions deploy kill-switch
supabase functions deploy stripe-webhook
supabase functions deploy stripe-checkout
supabase functions deploy download-request
supabase functions deploy user-profile
supabase functions deploy newsletter-signup
```

---

## STEP 7 — Set up Stripe
1. Go to https://stripe.com → Dashboard
2. Create 5 products with prices:

| Product | Price | Interval | Add metadata: tier= |
|---------|-------|----------|---------------------|
| WAVEFORM | $39 | monthly | waveform |
| ENTANGLE | $99 | monthly | entangle |
| ENTANGLE Annual | $79 | monthly (billed as $948/yr) | entangle |
| OMEGA CORE | $249 | monthly | omega_core |
| OMEGA CORE Annual | $199 | monthly (billed as $2388/yr) | omega_core |

3. Copy each Price ID (price_...) and update the `PRICE_TO_TIER` map in `stripe-webhook/index.ts`
4. Stripe Dashboard → Webhooks → Add endpoint:
   - URL: `https://qdnijmpcedgrpalnlojp.supabase.co/functions/v1/stripe-webhook`
   - Events: `checkout.session.completed`, `customer.subscription.created`,
     `customer.subscription.updated`, `customer.subscription.deleted`,
     `invoice.payment_succeeded`, `invoice.payment_failed`
5. Copy the webhook signing secret → set as `STRIPE_WEBHOOK_SECRET`

---

## STEP 8 — Set up Google OAuth
1. https://console.cloud.google.com → New project → APIs & Services → Credentials
2. Create OAuth 2.0 Client → Web application
3. Authorized redirect URI: `https://qdnijmpcedgrpalnlojp.supabase.co/auth/v1/callback`
4. Copy Client ID + Secret → Supabase Dashboard → Auth → Providers → Google

---

## STEP 9 — Set up GitHub OAuth
1. https://github.com/settings/developers → New OAuth App
2. Homepage URL: `https://aeonmi.ai`
3. Callback URL: `https://qdnijmpcedgrpalnlojp.supabase.co/auth/v1/callback`
4. Copy Client ID + Secret → Supabase Dashboard → Auth → Providers → GitHub

---

## STEP 10 — Enable phone OTP (Twilio)
1. https://twilio.com → Sign up (free trial)
2. Get Account SID, Auth Token, Phone Number
3. Supabase Dashboard → Auth → Providers → Phone → Enable
4. Enter Twilio credentials

---

## STEP 11 — Update frontend config
All frontend files are pre-configured with real values:
```
SUPABASE_URL  = "https://qdnijmpcedgrpalnlojp.supabase.co"
SUPABASE_ANON = eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9... (anon key — safe to expose)
```
✓ login.html, signup.html, dashboard.html, darketa.html, quantum-social.html — all patched.
The only value you still need to add is real Stripe Price IDs in stripe-checkout/index.ts and quantum-social.html.

---

## STEP 12 — Deploy to Netlify
1. Copy the contents of `frontend/` into your website folder
2. Copy `darketa.html` to your website folder as `darketa.html`
3. Push to GitHub → Netlify auto-deploys
4. Admin panel is live at: `https://aeonmi.ai/darketa`

---

## SECURITY NOTES
- The password `DarkMeta1975` is ONLY in your head and Supabase secrets. It is not in any file.
- The admin URL `aeonmi.ai/darketa` has no links pointing to it from the main site.
- Admin sessions expire after 8 hours automatically.
- OTP codes expire after 10 minutes.
- All owner sessions are logged in the `owner_sessions` table.
- `robots.txt` should block `/darketa` — add: `Disallow: /darketa`
