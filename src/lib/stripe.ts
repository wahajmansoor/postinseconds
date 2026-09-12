import { createServerFn } from "@tanstack/react-start";
import type Stripe from "stripe";

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
      userId?: string | undefined;
      userEmail?: string | undefined;
      planId?: string | undefined;
    }) => data,
  )
  .handler(async ({ data }) => {
    const { sessionId, userId, userEmail, planId = "lifetime" } = data;

    if (sessionId.startsWith("mock_")) {
      const sb = await getServerSupabase();
      if (sb && userId) {
        try {
          const { data: existing } = await sb
            .from("profiles")
            .select("id")
            .eq("id", userId)
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
              .eq("id", userId);
          } else {
            await sb.from("profiles").insert({
              id: userId,
              email: userEmail || undefined,
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

      const activeUserId =
        session.client_reference_id ||
        (session.metadata?.["userId"] as string) ||
        (session.metadata?.["user_id"] as string) ||
        userId ||
        "";
      const activePlanId =
        (session.metadata?.["planId"] as string) ||
        (session.metadata?.["plan_id"] as string) ||
        planId ||
        "lifetime";
      const customerId =
        typeof session.customer === "string" ? session.customer : session.customer?.id;
      const subscriptionId =
        typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
      const customerEmail =
        session.customer_details?.email || session.customer_email || userEmail || "";

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
  .validator((data: { userId: string; returnUrl: string; userEmail?: string | undefined }) => data)
  .handler(async ({ data }) => {
    const { userId, returnUrl, userEmail } = data;
    const stripe = await getStripeInstance();
    if (!stripe) {
      throw new Error("Stripe is not configured on server.");
    }

    const sb = await getServerSupabase();
    let customerId: string | null = null;
    let email = userEmail?.trim().toLowerCase() || "";

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
      userEmail?: string | undefined;
    }) => data,
  )
  .handler(async ({ data }) => {
    const { template, isPremium, userEmail } = data;
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
  .validator((data: { id: string }) => data)
  .handler(async ({ data }) => {
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
      userId: string;
      userEmail?: string | undefined;
      updates: {
        full_name?: string | undefined;
        avatar_url?: string | undefined;
      };
    }) => data,
  )
  .handler(async ({ data }) => {
    const { userId, userEmail, updates } = data;
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

export const checkUserProStatusServerFn = createServerFn({ method: "POST" })
  .validator(
    (data: {
      userId?: string | undefined;
      email?: string | undefined;
    }) => data,
  )
  .handler(async ({ data }) => {
    const { userId = "", email = "" } = data;
    const normalizedEmail = email.trim().toLowerCase();

    // 1. Whitelisted admin
    if (
      normalizedEmail &&
      (normalizedEmail === "buildinseconds@gmail.com" ||
        normalizedEmail.includes("buildinseconds"))
    ) {
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
    if (!isPro && normalizedEmail) {
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

          // Check Stripe customers
          const customers = await stripe.customers.list({ email: normalizedEmail, limit: 5 });
          for (const cust of customers.data) {
            const sessions = await stripe.checkout.sessions.list({
              customer: cust.id,
              limit: 20,
            });
            const paid = sessions.data.find(isPostInSecondsSession);
            if (paid) {
              isPro = true;
              plan = "lifetime";
              break;
            }
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



