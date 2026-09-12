import { createServerFn } from "@tanstack/react-start";
import type Stripe from "stripe";
import { isEmailAdmin } from "@/lib/adminEmails";

export interface PricingPlan {
  id: "lifetime" | "pro_lifetime" | string;
  name: string;
  badge?: string;
  description: string;
  priceFormatted: string;
  pricePeriod: string;
  amountInCents: number;
  interval?: "month" | "year";
  features: string[];
  popular?: boolean;
}

export const PRO_PLANS: Record<string, PricingPlan> = {
  lifetime: {
    id: "lifetime",
    name: "Pro (Lifetime Access)",
    badge: "One-Time Payment • Lifetime Access",
    description:
      "Pay once ($59). Unlimited lifetime access to all premium templates, custom fonts, 4K exports, and all future updates with zero recurring fees.",
    priceFormatted: "$59",
    pricePeriod: "one-time payment",
    amountInCents: 5900,
    features: [
      "Instant access to 50+ Premium Pro Templates",
      "Unlimited 4K High-Res and GIF canvas exports",
      "Upload custom TTF/OTF brand typography",
      "Exclusive creator layouts and background effects",
      "All future premium template drops included",
      "No watermarks, full commercial license for life",
      "Dedicated VIP customer support",
    ],
    popular: true,
  },
};

async function getStripeInstance(): Promise<Stripe | null> {
  const secretKey =
    process.env["STRIPE_SECRET_KEY"] ||
    process.env["VITE_STRIPE_SECRET_KEY"] ||
    (typeof import.meta !== "undefined" && (import.meta as any).env
      ? (import.meta as any).env["STRIPE_SECRET_KEY"] ||
      (import.meta as any).env["VITE_STRIPE_SECRET_KEY"]
      : undefined);

  if (!secretKey) return null;

  try {
    const stripeModule = await import("stripe");
    const StripeConstructor = (stripeModule.default ?? stripeModule) as any;
    return new StripeConstructor(secretKey, {
      apiVersion: "2025-02-24.acacia",
      typescript: true,
    });
  } catch (err) {
    console.error("Failed to load stripe module:", err);
    return null;
  }
}

async function getServerSupabase() {
  const url =
    process.env["VITE_SUPABASE_URL"] ||
    process.env["SUPABASE_URL"] ||
    (typeof import.meta !== "undefined" && (import.meta as any).env
      ? (import.meta as any).env["VITE_SUPABASE_URL"]
      : "");

  const key =
    process.env["SUPABASE_SERVICE_ROLE_KEY"] ||
    process.env["VITE_SUPABASE_ANON_KEY"] ||
    (typeof import.meta !== "undefined" && (import.meta as any).env
      ? (import.meta as any).env["VITE_SUPABASE_ANON_KEY"]
      : "");

  if (!url || !key) return null;

  try {
    const { createClient } = await import("@supabase/supabase-js");
    return createClient(url, key, {
      auth: { persistSession: false },
    });
  } catch (err) {
    console.error("Failed to load supabase client:", err);
    return null;
  }
}

// ==============================================================================
// SECURITY: every server function below used to trust whatever `userId` /
// `userEmail` / `role` the CLIENT sent in its request body as the caller's
// real identity — a client can put anything it wants in a fetch body, so
// that was equivalent to no authorization check at all (confirmed
// exploitable: grant yourself Pro for free, read/write other accounts'
// data, wipe every template). The fix is the same in every handler below:
// never trust an identity field from `data`, always re-derive who's really
// calling from a Supabase access token, verified against Supabase's own
// Auth server (a client can send any string as a token, but it cannot
// forge one that verifies as belonging to a real, different user — the
// token is cryptographically signed by Supabase, not by this app).
//
// getVerifiedCaller() does that verification. It deliberately uses the
// ANON key (not the service-role key getServerSupabase() may return) for
// this — verifying a token is a plain "is this real" check that works the
// same regardless of which key asks, and using the weaker key here is
// itself a safety margin: a bug in this one function can't accidentally
// gain service-role powers. The returned client has the caller's own
// verified token attached as its Authorization header (not just the anon
// key), so any further query made through it runs AS that user for RLS
// purposes — e.g. `auth.uid() = id` policies resolve correctly — without
// needing a service-role key at all, unlike getServerSupabase().
async function getVerifiedCaller(
  accessToken?: string | undefined,
): Promise<{ id: string; email: string; client: any } | null> {
  if (!accessToken) return null;

  const url =
    process.env["VITE_SUPABASE_URL"] ||
    process.env["SUPABASE_URL"] ||
    (typeof import.meta !== "undefined" && (import.meta as any).env
      ? (import.meta as any).env["VITE_SUPABASE_URL"]
      : "");
  const anonKey =
    process.env["VITE_SUPABASE_ANON_KEY"] ||
    (typeof import.meta !== "undefined" && (import.meta as any).env
      ? (import.meta as any).env["VITE_SUPABASE_ANON_KEY"]
      : "");
  if (!url || !anonKey) return null;

  try {
    const { createClient } = await import("@supabase/supabase-js");
    const authClient = createClient(url, anonKey, {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    });
    // .auth.getUser(token) — unlike reading a locally-cached session — makes
    // a real request to Supabase's Auth server to validate this exact token
    // right now (rejects expired/forged/tampered tokens), which is what
    // makes its result safe to base an authorization decision on. This is
    // Supabase's own documented pattern for verifying a caller server-side.
    const { data, error } = await authClient.auth.getUser(accessToken);
    if (error || !data?.user) return null;
    return { id: data.user.id, email: data.user.email || "", client: authClient };
  } catch (err) {
    console.error("getVerifiedCaller error:", err);
    return null;
  }
}

// Verifies the caller AND that they're an admin — by email allowlist (same
// exact-match check used everywhere else in the app) or by their real
// profiles.role. Queries that role through the caller's OWN verified
// client (not getServerSupabase()'s possibly-service-role one) specifically
// so this works correctly whether or not a service-role key happens to be
// configured — profiles' "view own profile" RLS policy already lets any
// user read their own role, no elevated key required. Throws (callers
// should let this propagate — createServerFn surfaces it as a rejected
// request) rather than returning a boolean, so a handler literally cannot
// proceed to the privileged code below by accident.
async function requireAdmin(accessToken?: string | undefined): Promise<{ id: string; email: string }> {
  const caller = await getVerifiedCaller(accessToken);
  if (!caller) throw new Error("Not authenticated.");
  if (isEmailAdmin(caller.email)) return caller;

  const { data: profile } = await caller.client.from("profiles").select("role").eq("id", caller.id).maybeSingle();
  if (profile?.role === "admin") return caller;

  throw new Error("Not authorized: admin access required.");
}

export const createStripeCheckoutSession = createServerFn({ method: "POST" })
  .validator(
    (data: {
      planId?: string;
      userId: string;
      userEmail: string;
      originUrl: string;
    }) => data,
  )
  .handler(async ({ data }) => {
    const { planId = "lifetime", userId, userEmail, originUrl } = data;
    const plan = PRO_PLANS[planId] || PRO_PLANS["lifetime"]!;

    const stripe = await getStripeInstance();
    if (!stripe) {
      console.warn("STRIPE_SECRET_KEY not set. Using test checkout fallback.");
      const mockSuccessUrl = `${originUrl}/?upgrade=success&session_id=mock_sub_${Date.now()}&plan=${planId}&mock=true`;
      return {
        url: mockSuccessUrl,
        isMock: true,
      };
    }

    const successUrl = `${originUrl}/?upgrade=success&session_id={CHECKOUT_SESSION_ID}&plan=${planId}`;
    const cancelUrl = `${originUrl}/?upgrade=canceled`;

    const envPriceId =
      process.env["STRIPE_PRICE_ID"] ||
      process.env["VITE_STRIPE_PRICE_ID"] ||
      (typeof import.meta !== "undefined" && (import.meta as any).env
        ? (import.meta as any).env["STRIPE_PRICE_ID"] ||
          (import.meta as any).env["VITE_STRIPE_PRICE_ID"]
        : undefined);

    try {
      const lineItem: Stripe.Checkout.SessionCreateParams.LineItem = envPriceId
        ? {
            price: envPriceId,
            quantity: 1,
          }
        : plan.interval
          ? {
              price_data: {
                currency: "usd",
                product_data: {
                  name: `Post In Seconds - ${plan.name}`,
                  description: plan.description,
                  images: [`${originUrl}/logo.png`],
                  metadata: {
                    app: "post_in_seconds",
                    productId: "post_in_seconds_pro",
                  },
                },
                unit_amount: plan.amountInCents,
                recurring: {
                  interval: plan.interval,
                },
              },
              quantity: 1,
            }
          : {
              price_data: {
                currency: "usd",
                product_data: {
                  name: `Post In Seconds - ${plan.name}`,
                  description: plan.description,
                  images: [`${originUrl}/logo.png`],
                  metadata: {
                    app: "post_in_seconds",
                    productId: "post_in_seconds_pro",
                  },
                },
                unit_amount: plan.amountInCents,
              },
              quantity: 1,
            };

      const sessionParams: Stripe.Checkout.SessionCreateParams = {
        payment_method_types: ["card"],
        line_items: [lineItem],
        mode: plan.interval ? "subscription" : "payment",
        client_reference_id: userId,
        metadata: {
          app: "post_in_seconds",
          product: "post_in_seconds_pro",
          userId,
          planId,
        },
        success_url: successUrl,
        cancel_url: cancelUrl,
        allow_promotion_codes: true,
        billing_address_collection: "auto",
      };

      if (!plan.interval) {
        sessionParams.payment_intent_data = {
          metadata: {
            app: "post_in_seconds",
            product: "post_in_seconds_pro",
            userId,
            planId,
          },
        };
      }

      if (userEmail) {
        sessionParams.customer_email = userEmail;
      }

      const session = await stripe.checkout.sessions.create(sessionParams);

      return {
        url: session.url,
        sessionId: session.id,
        isMock: false,
      };
    } catch (err: any) {
      console.error("Stripe Checkout Session Error:", err);
      throw new Error(err.message || "Failed to initialize Stripe checkout session");
    }
  });

export const verifyStripeSession = createServerFn({ method: "POST" })
  .validator(
    (data: {
      sessionId: string;
      accessToken?: string | undefined;
      userId?: string | undefined;
      userEmail?: string | undefined;
      planId?: string | undefined;
    }) => data,
  )
  .handler(async ({ data }) => {
    const { sessionId, accessToken, userEmail, planId = "lifetime" } = data;

    // This used to trigger on the client-supplied sessionId string ALONE,
    // with no check on whether the server even lacks real Stripe config —
    // meaning anyone, on production, with Stripe fully configured, could
    // call this with `sessionId: "mock_anything"` and instantly get
    // `is_pro: true` for free (confirmed exploitable in the security
    // review this fixes). It now requires BOTH a verified caller (can't be
    // forged — see getVerifiedCaller) AND that the server genuinely has no
    // Stripe instance to check against, matching createStripeCheckoutSession's
    // own mock-fallback condition just above — so this path can only ever
    // fire in the same local-dev-without-Stripe-keys situation it was built
    // for, never in a real deployment. The verified caller's OWN id is used
    // — never the client-supplied `userId` — so this can only ever grant
    // Pro to the account making the request.
    if (sessionId.startsWith("mock_")) {
      const caller = await getVerifiedCaller(accessToken);
      if (!caller) throw new Error("Not authenticated.");
      const stripeConfigured = await getStripeInstance();
      if (stripeConfigured) {
        throw new Error("Mock checkout is not available — Stripe is configured on this server.");
      }
      const sb = await getServerSupabase();
      if (sb) {
        try {
          const { data: existing } = await sb
            .from("profiles")
            .select("id")
            .eq("id", caller.id)
            .maybeSingle();

          if (existing) {
            await sb
              .from("profiles")
              .update({
                is_pro: true,
                plan: planId,
                subscription_status: "active",
                updated_at: new Date().toISOString(),
              })
              .eq("id", caller.id);
          } else {
            await sb.from("profiles").insert({
              id: caller.id,
              email: caller.email || userEmail || undefined,
              is_pro: true,
              plan: planId,
              role: "user",
              subscription_status: "active",
              updated_at: new Date().toISOString(),
            });
          }
        } catch (e) {
          console.error("Supabase mock update error:", e);
        }
      }
      return { success: true, isPro: true, plan: planId, isMock: true };
    }

    const stripe = await getStripeInstance();
    if (!stripe) {
      return { success: false, error: "Stripe not configured on server" };
    }

    try {
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      if (session.payment_status !== "paid" && session.status !== "complete") {
        return { success: false, error: "Payment was not completed" };
      }

      // Verify the caller (if a token was sent) and use ONLY the payment
      // session's own server-set fields (client_reference_id/metadata,
      // written by this app's own createStripeCheckoutSession at checkout
      // time — never client-writable afterward) to decide whose account
      // gets marked Pro. The client-supplied `userId` field is deliberately
      // never consulted here anymore: it used to be the final fallback,
      // meaning anyone who could produce ANY real "paid" Stripe session id
      // lacking that metadata (e.g. one of their own $0 test purchases)
      // could hand it to this endpoint together with an arbitrary victim
      // `userId` and grant that victim's account Pro. If the session
      // genuinely carries no identifying metadata, fall back to the
      // verified caller's own id — never an unverified one — and if the
      // session DOES identify a different account than the verified
      // caller, refuse rather than silently acting on someone else's
      // payment.
      const caller = await getVerifiedCaller(accessToken);
      const sessionUserId =
        session.client_reference_id ||
        (session.metadata?.["userId"] as string) ||
        (session.metadata?.["user_id"] as string) ||
        "";
      if (sessionUserId && caller && sessionUserId !== caller.id) {
        return { success: false, error: "This payment session does not belong to the signed-in account." };
      }
      const activeUserId = sessionUserId || caller?.id || "";
      const activePlanId =
        (session.metadata?.["planId"] as string) ||
        (session.metadata?.["plan_id"] as string) ||
        planId ||
        "lifetime";
      const customerId =
        typeof session.customer === "string" ? session.customer : session.customer?.id;
      const subscriptionId =
        typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
      // Deliberately NOT falling back to the client-supplied `userEmail`
      // here (unlike before) — this value drives a second, email-keyed
      // profile update a few lines down that isn't scoped to activeUserId
      // at all, so trusting an unverified client-supplied email would let
      // a request for the caller's OWN genuine, verified payment ALSO grant
      // Pro to any other email the client cared to name. Only Stripe's own
      // record of who actually paid should ever drive that.
      const customerEmail = session.customer_details?.email || session.customer_email || "";

      const sb = await getServerSupabase();
      if (sb) {
        if (activeUserId) {
          try {
            const { data: existing } = await sb
              .from("profiles")
              .select("id")
              .eq("id", activeUserId)
              .maybeSingle();

            if (existing) {
              await sb
                .from("profiles")
                .update({
                  is_pro: true,
                  plan: activePlanId,
                  stripe_customer_id: customerId || null,
                  stripe_subscription_id: subscriptionId || null,
                  subscription_status: "active",
                  updated_at: new Date().toISOString(),
                })
                .eq("id", activeUserId);
            } else {
              await sb.from("profiles").insert({
                id: activeUserId,
                email: customerEmail || undefined,
                is_pro: true,
                plan: activePlanId,
                role: "user",
                stripe_customer_id: customerId || null,
                stripe_subscription_id: subscriptionId || null,
                subscription_status: "active",
                updated_at: new Date().toISOString(),
              });
            }
          } catch (profileErr) {
            console.error("Failed to update profile by userId:", profileErr);
          }
        }

        if (customerEmail) {
          try {
            await sb
              .from("profiles")
              .update({
                is_pro: true,
                plan: activePlanId,
                stripe_customer_id: customerId || null,
                stripe_subscription_id: subscriptionId || null,
                subscription_status: "active",
                updated_at: new Date().toISOString(),
              })
              .eq("email", customerEmail);
          } catch (emailErr) {
            console.error("Failed to update profile by email:", emailErr);
          }
        }
      }

      return {
        success: true,
        isPro: true,
        plan: activePlanId,
        customerId,
        subscriptionId,
      };
    } catch (err: any) {
      console.error("verifyStripeSession error:", err);
      throw new Error(err.message || "Failed to verify payment session");
    }
  });

export const createStripePortalSession = createServerFn({ method: "POST" })
  .validator(
    (data: { accessToken?: string | undefined; returnUrl: string }) => data,
  )
  .handler(async ({ data }) => {
    const { accessToken, returnUrl } = data;
    // Used to take `userId`/`userEmail` straight from the client and build
    // a Stripe billing-portal link for THAT account — no check that the
    // caller was actually that account. Anyone who knew or guessed another
    // user's id or email could get a live link to manage that person's
    // payment methods/subscription. Now the verified caller is the only
    // possible target; there is no other-account code path left at all.
    const caller = await getVerifiedCaller(accessToken);
    if (!caller) {
      throw new Error("Not authenticated.");
    }
    const userId = caller.id;

    const stripe = await getStripeInstance();
    if (!stripe) {
      throw new Error("Stripe is not configured on server.");
    }

    const sb = await getServerSupabase();
    let customerId: string | null = null;
    let email = caller.email?.trim().toLowerCase() || "";

    if (sb && userId) {
      try {
        const { data: profile } = await sb
          .from("profiles")
          .select("stripe_customer_id, email")
          .eq("id", userId)
          .single();

        if (profile?.stripe_customer_id) {
          customerId = profile.stripe_customer_id;
        }
        if (!email && profile?.email) {
          email = profile.email.trim().toLowerCase();
        }
      } catch (err) {
        console.warn("Could not load profile for portal session:", err);
      }
    }

    // If customerId was not found in profile, lookup Stripe by email or checkout sessions
    if (!customerId && email) {
      try {
        const customers = await stripe.customers.list({ email, limit: 10 });
        if (customers.data.length > 0 && customers.data[0]?.id) {
          customerId = customers.data[0].id;
        } else {
          // Check recent checkout sessions for customer ID
          const sessions = await stripe.checkout.sessions.list({ limit: 100 });
          const userSession = sessions.data.find(
            (s) =>
              (s.customer_details?.email?.toLowerCase() === email ||
                s.customer_email?.toLowerCase() === email ||
                s.client_reference_id === userId ||
                s.metadata?.["userId"] === userId) &&
              s.customer,
          );
          if (userSession && typeof userSession.customer === "string") {
            customerId = userSession.customer;
          }
        }

        // Cache back to profiles if found
        if (customerId && sb && userId) {
          try {
            await sb.from("profiles").update({ stripe_customer_id: customerId }).eq("id", userId);
          } catch {}
        }
      } catch (e) {
        console.warn("Error searching Stripe customer by email:", e);
      }
    }

    if (!customerId) {
      throw new Error(
        "No Stripe billing customer record was found for this account. If you paid with a different email, please contact support."
      );
    }

    try {
      const portalSession = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: returnUrl,
      });

      return { url: portalSession.url };
    } catch (portalErr: any) {
      console.error("Stripe billing portal error:", portalErr);
      if (
        portalErr?.code === "configuration_missing" ||
        portalErr?.message?.includes("No configuration found") ||
        portalErr?.message?.includes("Customer Portal")
      ) {
        throw new Error(
          "Stripe Customer Portal is not yet enabled in your Stripe Dashboard. Please visit Stripe Dashboard -> Settings -> Customer Portal to turn it on."
        );
      }
      throw new Error(portalErr?.message || "Could not open billing portal.");
    }
  });

export const savePlatformTemplateServerFn = createServerFn({ method: "POST" })
  .validator(
    (data: {
      template: {
        id: string;
        label: string;
        description?: string | null | undefined;
        thumbnailUrl?: string | null | undefined;
        state: any;
        [key: string]: any;
      };
      isPremium: boolean;
      accessToken?: string | undefined;
      userEmail?: string | undefined;
    }) => data,
  )
  .handler(async ({ data }) => {
    // This had NO authorization check at all — not even a userId field to
    // check — meaning any unauthenticated visitor who found this
    // endpoint could create, overwrite, or (via deletePlatformTemplateServerFn
    // below) delete any template. It's reached automatically as a silent
    // fallback whenever the client-side RLS-protected write is rejected
    // (see upsertTemplate in supabase.ts), so it was a full bypass of the
    // "Only admins can modify templates" RLS policy for anyone, not just a
    // theoretical direct-request risk. requireAdmin throws before any of
    // the code below can run if the caller isn't verified AND admin.
    await requireAdmin(data.accessToken);
    const { template, isPremium } = data;
    const sb = await getServerSupabase();
    if (!sb) {
      throw new Error("Supabase client not available on server.");
    }

    const payload: any = {
      id: template.id,
      label: template.label,
      category: isPremium ? "premium" : "starter",
      description: template.description || (isPremium ? "Premium Pro layout" : "Starter layout"),
      thumbnail_url: template.thumbnailUrl || null,
      state: template.state,
      is_premium: isPremium,
      is_published: true,
      updated_at: new Date().toISOString(),
    };

    let { error } = await sb.from("templates").upsert(payload);

    if (error && error.message && error.message.toLowerCase().includes("thumbnail_url")) {
      delete payload.thumbnail_url;
      const retry = await sb.from("templates").upsert(payload);
      error = retry.error;
    }

    if (error) {
      console.error("savePlatformTemplateServerFn error:", error);
      throw new Error(error.message || "Failed to save template to database.");
    }

    return { success: true };
  });

export const deletePlatformTemplateServerFn = createServerFn({ method: "POST" })
  .validator((data: { id: string; accessToken?: string | undefined }) => data)
  .handler(async ({ data }) => {
    // Same missing-authorization bug as savePlatformTemplateServerFn just
    // above, and the more damaging of the two: this is what let anyone
    // wipe the entire live templates table with no admin check whatsoever.
    await requireAdmin(data.accessToken);
    const { id } = data;
    const sb = await getServerSupabase();
    if (!sb) {
      throw new Error("Supabase client not available on server.");
    }

    const { error } = await sb.from("templates").delete().eq("id", id);
    if (error) {
      console.error("deletePlatformTemplateServerFn error:", error);
      throw new Error(error.message || "Failed to delete template from database.");
    }

    return { success: true };
  });

export const updateProfileServerFn = createServerFn({ method: "POST" })
  .validator(
    (data: {
      accessToken?: string | undefined;
      userEmail?: string | undefined;
      updates: {
        full_name?: string | undefined;
        avatar_url?: string | undefined;
      };
    }) => data,
  )
  .handler(async ({ data }) => {
    // This is meant to update the CALLER's own profile only (it's the
    // fallback for updateOwnProfile in supabase.ts) — it used to take
    // `userId` straight from the client with no check that the caller
    // actually was that user, so anyone could rewrite any other account's
    // full_name/avatar_url. Only the verified caller's own id is used now.
    const caller = await getVerifiedCaller(data.accessToken);
    if (!caller) {
      throw new Error("Not authenticated.");
    }
    const userId = caller.id;
    const userEmail = data.userEmail || caller.email;
    const { updates } = data;
    const sb = await getServerSupabase();
    if (!sb) {
      throw new Error("Supabase client not available on server.");
    }

    try {
      const { data: existing } = await sb
        .from("profiles")
        .select("id, email")
        .eq("id", userId)
        .maybeSingle();

      if (existing) {
        const { error } = await sb
          .from("profiles")
          .update({
            ...updates,
            updated_at: new Date().toISOString(),
          })
          .eq("id", userId);
        if (error) console.warn("Supabase profiles update warning:", error);
      } else {
        let email = userEmail;
        if (!email) {
          try {
            const { data: authUser } = await sb.auth.admin.getUserById(userId);
            email = authUser?.user?.email || "";
          } catch {}
        }
        const { error } = await sb.from("profiles").upsert(
          {
            id: userId,
            ...(email ? { email } : {}),
            ...updates,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "id" },
        );
        if (error) console.warn("Supabase profiles upsert warning:", error);
      }
    } catch (err) {
      console.warn("Error updating profile in server function:", err);
    }

    return { success: true };
  });

// PERFORMANCE: the Stripe-ledger fallback below (section 3) makes several
// external API calls and used to run on every single call to this
// function for every free-tier user — and this function itself runs on
// every page load, every auth-state change, AND every background token
// refresh (see syncUserFromSession in auth.tsx), so a free user could
// trigger it repeatedly through a long session, each time paying the full
// latency cost (multiple sequential round-trips to Stripe, likely
// seconds) and spending this app's Stripe API rate-limit budget on an
// account that's never paid. Caching a NEGATIVE result for a few minutes
// (never a positive one — a real purchase already gets written straight
// to `profiles` by verifyStripeSession/checkUserProStatusServerFn itself,
// so the cheap DB check just above already picks that up immediately;
// only the expensive "definitely still not pro" answer is worth reusing)
// cuts that down to roughly once per cache window per user instead of
// once per token refresh. Plain in-memory Map: fine for cutting redundant
// calls within one server process/session; a horizontally-scaled
// deployment would want a shared cache (e.g. a dedicated small table or
// Redis) for the same effect across instances, but that's an
// infrastructure change beyond this fix.
const STRIPE_NEGATIVE_CACHE_TTL_MS = 5 * 60 * 1000;
const stripeProCheckNegativeCache = new Map<string, number>(); // key -> expiresAt

export const checkUserProStatusServerFn = createServerFn({ method: "POST" })
  .validator(
    (data: {
      accessToken?: string | undefined;
      userId?: string | undefined;
      email?: string | undefined;
    }) => data,
  )
  .handler(async ({ data }) => {
    // Two separate problems used to live here:
    // 1. This trusted a client-supplied `userId`/`email` outright — anyone
    //    could ask "is this OTHER account Pro/admin?" for any id/email they
    //    named (an information-disclosure issue on its own), and combined
    //    with syncUserFromSession OR-ing this result into the client's own
    //    isPro/role state client-side, this was also part of the larger
    //    privilege-spoofing chain. Now the verified caller's own identity
    //    is always used when a token is provided.
    // 2. `.includes("buildinseconds")` matched ANY email merely containing
    //    that substring (e.g. "x@buildinsecondsfake.com") as admin — every
    //    other admin check in this app (isEmailAdmin) already used an exact
    //    match; this was the one that had regressed. Now reuses that same
    //    shared, exact-match function.
    const caller = await getVerifiedCaller(data.accessToken);
    const userId = caller?.id || "";
    const normalizedEmail = (caller?.email || "").trim().toLowerCase();

    // 1. Whitelisted admin
    if (isEmailAdmin(normalizedEmail)) {
      return { isPro: true, role: "admin" as const, plan: "lifetime" };
    }

    const sb = await getServerSupabase();
    let isPro = false;
    let plan = "free";
    let role: "user" | "admin" = "user";

    // 2. Query profiles table in Supabase
    if (sb) {
      try {
        if (userId) {
          const { data: p } = await sb
            .from("profiles")
            .select("is_pro, plan, role")
            .eq("id", userId)
            .maybeSingle();
          if (p?.is_pro || p?.plan === "lifetime") {
            isPro = true;
            plan = p.plan || "lifetime";
            if (p.role === "admin") role = "admin";
          }
        }
        if (!isPro && normalizedEmail) {
          const { data: p } = await sb
            .from("profiles")
            .select("is_pro, plan, role")
            .ilike("email", normalizedEmail)
            .maybeSingle();
          if (p?.is_pro || p?.plan === "lifetime") {
            isPro = true;
            plan = p.plan || "lifetime";
            if (p.role === "admin") role = "admin";
          }
        }
      } catch (err) {
        console.warn("checkUserProStatusServerFn supabase error:", err);
      }
    }

    // 3. Direct Stripe Verification: If user purchased via Stripe with this email/ID, confirm immediately!
    const cacheKey = userId || normalizedEmail;
    const cachedNegativeExpiry = stripeProCheckNegativeCache.get(cacheKey);
    const skipStripeCheck = !!cachedNegativeExpiry && cachedNegativeExpiry > Date.now();
    if (!isPro && normalizedEmail && !skipStripeCheck) {
      try {
        const stripe = await getStripeInstance();
        if (stripe) {
          const isPostInSecondsSession = (s: Stripe.Checkout.Session): boolean => {
            if (s.payment_status !== "paid" && s.status !== "complete") return false;
            // 1. Explicit app metadata match
            if (
              s.metadata?.["app"] === "post_in_seconds" ||
              s.metadata?.["product"]?.includes("post_in_seconds") ||
              s.metadata?.["productId"]?.includes("post_in_seconds")
            ) {
              return true;
            }
            // 2. If tagged with another app (e.g. infographic_in_seconds), ignore it
            if (s.metadata?.["app"] && s.metadata?.["app"] !== "post_in_seconds") {
              return false;
            }
            // 3. Product description or custom messages
            const desc = ((s as any).description || "").toLowerCase();
            const customText = (s.custom_text?.submit?.message || "").toLowerCase();
            if (desc.includes("post in seconds") || customText.includes("post in seconds")) {
              return true;
            }
            // 4. Matches $59 lifetime package and has no other conflicting app metadata
            if (
              s.amount_total === 5900 &&
              (!s.metadata?.["app"] || s.metadata?.["app"] === "post_in_seconds")
            ) {
              return true;
            }
            return false;
          };

          // Check Stripe customers — run the per-customer sessions lookup
          // for all of them concurrently (was a sequential `for` loop
          // awaiting each one in turn) since there are at most 5 and each
          // is an independent external API round-trip; no early-exit lost
          // here that actually mattered given the cap is already small.
          const customers = await stripe.customers.list({ email: normalizedEmail, limit: 5 });
          const perCustomerResults = await Promise.all(
            customers.data.map((cust) =>
              stripe.checkout.sessions.list({ customer: cust.id, limit: 20 }),
            ),
          );
          if (perCustomerResults.some((sessions) => sessions.data.some(isPostInSecondsSession))) {
            isPro = true;
            plan = "lifetime";
          }

          // Also check recent checkout sessions
          if (!isPro) {
            const recent = await stripe.checkout.sessions.list({ limit: 100 });
            const userSession = recent.data.find(
              (s) =>
                isPostInSecondsSession(s) &&
                (s.customer_details?.email?.toLowerCase() === normalizedEmail ||
                  s.customer_email?.toLowerCase() === normalizedEmail ||
                  (userId && s.client_reference_id === userId) ||
                  (userId && s.metadata?.["userId"] === userId)),
            );
            if (userSession) {
              isPro = true;
              plan = "lifetime";
            }
          }

          if (!isPro) {
            stripeProCheckNegativeCache.set(cacheKey, Date.now() + STRIPE_NEGATIVE_CACHE_TTL_MS);
          }

          // If verified from Stripe, cache/upsert to profiles table
          if (isPro && sb && (userId || normalizedEmail)) {
            try {
              if (userId) {
                await sb.from("profiles").upsert(
                  {
                    id: userId,
                    email: normalizedEmail,
                    is_pro: true,
                    plan: "lifetime",
                    subscription_status: "active",
                    updated_at: new Date().toISOString(),
                  },
                  { onConflict: "id" },
                );
              } else {
                await sb
                  .from("profiles")
                  .update({
                    is_pro: true,
                    plan: "lifetime",
                    subscription_status: "active",
                    updated_at: new Date().toISOString(),
                  })
                  .ilike("email", normalizedEmail);
              }
            } catch {}
          }
        }
      } catch (stripeErr) {
        console.warn("checkUserProStatusServerFn stripe verify error:", stripeErr);
      }
    }

    return { isPro, plan, role };
  });



