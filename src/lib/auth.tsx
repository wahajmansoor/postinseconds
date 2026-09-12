import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { SocialLogin } from "@capgo/capacitor-social-login";
import { supabase } from "@/lib/supabase";

// The OAuth Client ID registered as "Web application" in the same Google
// Cloud project as the Android OAuth client (package name + signing SHA-1)
// — Android's Credential Manager requires the *Web* client ID here (not the
// Android one) as the ID token's audience; Supabase then verifies that same
// token via supabase.auth.signInWithIdToken. Same value already configured
// in Supabase's Authentication > Providers > Google settings, reused here.
const GOOGLE_WEB_CLIENT_ID = import.meta.env["VITE_GOOGLE_WEB_CLIENT_ID"] as string;

export const DEFAULT_ADMIN_EMAILS = [
  "buildinseconds@gmail.com",
];

export function isEmailAdmin(email?: string | null): boolean {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  if (DEFAULT_ADMIN_EMAILS.some((adm) => adm.toLowerCase() === normalized)) return true;
  
  const envAdmins = (typeof import.meta !== "undefined" && (import.meta as any).env?.["VITE_ADMIN_EMAILS"]) || "";
  if (envAdmins) {
    const list = envAdmins.split(",").map((e: string) => e.trim().toLowerCase());
    if (list.includes(normalized)) return true;
  }
  return false;
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  avatar: string;
  role: "user" | "admin";
  isPro: boolean;
  plan?: string;
  subscriptionStatus?: string;
}

interface AuthContextType {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isPro: boolean;
  isLoading: boolean;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  isLoginModalOpen: boolean;
  openLoginModal: () => void;
  closeLoginModal: () => void;
  isUpgradeModalOpen: boolean;
  openUpgradeModal: () => void;
  closeUpgradeModal: () => void;
  refreshUser: () => Promise<void>;
  updateLocalUser: (partial: Partial<Pick<AuthUser, "name" | "avatar" | "isPro" | "plan">>) => void;
  // Web-only: attach to a container element to have Google's own real
  // "Sign in with Google" button rendered into it (see the big comment on
  // the GIS effect below for why it has to be Google's actual button, not
  // a custom one). isGoogleButtonReady flips true once that render
  // succeeds — until then (or if it never does, e.g. an ad blocker killed
  // Google's script), the caller should keep showing loginWithGoogle's
  // own fallback button instead. Always false/no-op on native, where the
  // existing custom button already calls loginWithGoogle directly.
  googleButtonContainerRef: (el: HTMLDivElement | null) => void;
  isGoogleButtonReady: boolean;
}

const STORAGE_KEY = "postinseconds_auth_user";

// GIS (web) requires a nonce round-trip: the *hashed* nonce goes into
// google.accounts.id.initialize(), Google bakes it into the ID token's
// `nonce` claim, and the *raw* nonce then has to be handed back to
// signInWithIdToken so Supabase can hash-and-compare it itself. Skipping
// this (or only doing half of it) is exactly what produces Supabase's
// "Passed nonce and nonce in id_token should either both exist or not."
// error — the token ends up with a nonce claim but signInWithIdToken
// wasn't told what raw value to check it against, or vice versa.
function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

// Guards every sign-in network/plugin call below against hanging forever.
// A regular error (bad nonce, wrong client id, etc.) already rejects fast
// and is handled fine by the existing try/catch — this only protects
// against the call never settling at all (a stalled request, a native
// plugin callback that never fires), which previously left isLoading
// stuck true and the whole app pinned on "Connecting to Studio Editor..."
// with no way out.
function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) return null;
      const parsed = JSON.parse(stored);
      if (parsed?.email && isEmailAdmin(parsed.email)) {
        parsed.role = "admin";
        parsed.isPro = true;
      }
      return parsed;
    } catch {
      return null;
    }
  });

  // Starts true: until the initial getSession() check resolves, we don't yet
  // know if there's a live session, so gates (AdminGate) must show a loading
  // state rather than flashing the signed-out view. The safety timeout below
  // still guarantees this resolves even if the network hangs.
  const [isLoading, setIsLoading] = useState(true);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false);

  // Sync Supabase Auth session on mount and state changes
  useEffect(() => {
    let mounted = true;

    // Safety timeout: Ensure isLoading is resolved even if network/session resolution is delayed
    const timeoutId = setTimeout(() => {
      if (mounted) setIsLoading(false);
    }, 1500);

    // 1. Fetch current active session
    supabase.auth
      .getSession()
      .then(async ({ data: { session } }) => {
        if (session?.user) {
          await syncUserFromSession(session.user);
        } else {
          const stored = localStorage.getItem(STORAGE_KEY);
          if (!stored) setUser(null);
        }
      })
      .catch((err) => {
        console.error("Supabase getSession error:", err);
      })
      .finally(() => {
        clearTimeout(timeoutId);
        if (mounted) setIsLoading(false);
      });

    // 2. Listen to real-time auth changes (Sign in, Sign out, Token Refresh)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      try {
        if (session?.user) {
          await syncUserFromSession(session.user);
        } else {
          setUser(null);
          localStorage.removeItem(STORAGE_KEY);
        }
      } catch (err) {
        console.error("Auth state change error:", err);
      } finally {
        if (mounted) setIsLoading(false);
      }
    });

    return () => {
      mounted = false;
      clearTimeout(timeoutId);
      subscription.unsubscribe();
    };
  }, []);

  // Native-app-only: Google sign-in there goes through Android's native
  // Credential Manager UI (via SocialLogin) instead of a browser-based OAuth
  // redirect — no deep link, no custom URL scheme needed. Just needs the
  // Web Client ID registered up front before loginWithGoogle can call it.
  // No-op on web (the plugin's login() there just wraps the same
  // signInWithOAuth redirect flow, which doesn't need initializing).
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    SocialLogin.initialize({ google: { webClientId: GOOGLE_WEB_CLIENT_ID } }).catch((err) => {
      console.error("SocialLogin.initialize error:", err);
    });
  }, []);

  // Web-only: Google Identity Services (GIS) — the same idea as the native
  // Credential Manager flow above, applied to the browser. Supabase's own
  // signInWithOAuth redirects through Supabase's *own* domain on the way to
  // Google, which is what put "nwomhuftbmbhjfmsboob.supabase.co" on
  // Google's account-picker screen; GIS instead authenticates directly
  // against this site's own origin and hands back an ID token to a JS
  // callback here, with no redirect at all — same signInWithIdToken finish
  // line as native, and Google shows this site, not Supabase's domain.
  //
  // GIS's button is a real Google-hosted iframe for security — a page
  // can't dispatch a synthetic click into it from a different, custom-
  // styled button, so it has to be the thing the user actually clicks.
  // registerGoogleButtonContainer below renders it into whatever container
  // the UI (SignupPage) hands over, styled via GIS's own options to sit as
  // close to the existing button's look as it can.
  const gisReadyRef = useRef(false);
  const pendingButtonContainerRef = useRef<HTMLDivElement | null>(null);
  const [isGoogleButtonReady, setIsGoogleButtonReady] = useState(false);
  const [isGisReady, setIsGisReady] = useState(false);
  const oneTapShownRef = useRef(false);
  // The raw nonce handed to the current initialize() call — signInWithIdToken
  // needs this exact value back to verify the hash Google embedded in the
  // token. Re-generated on every initialize (i.e. every page load).
  const gisNonceRef = useRef<string | null>(null);

  const handleGisCredential = async (response: { credential?: string }) => {
    if (!response.credential) return;
    setIsLoading(true);
    try {
      const { data, error } = await withTimeout(
        supabase.auth.signInWithIdToken({
          provider: "google",
          token: response.credential,
          ...(gisNonceRef.current ? { nonce: gisNonceRef.current } : {}),
        }),
        15000,
        "Sign-in timed out. Please try again.",
      );
      if (error) throw error;
      if (data?.session?.user) {
        await syncUserFromSession(data.session.user);
      }
      setIsLoginModalOpen(false);
    } catch (e: any) {
      console.error("Google Auth Error:", e);
      alert(e.message || "Failed to sign in with Google");
    } finally {
      setIsLoading(false);
    }
  };

  const tryRenderGoogleButton = () => {
    const container = pendingButtonContainerRef.current;
    if (!gisReadyRef.current || !container || container.childElementCount > 0) return;
    try {
      const isMobile = typeof window !== "undefined" && window.innerWidth < 400;
      const targetWidth = isMobile ? Math.max(240, Math.min(300, window.innerWidth - 60)) : 320;

      (window as any).google.accounts.id.renderButton(container, {
        type: "standard",
        theme: "outline",
        size: "large",
        shape: "pill",
        text: "continue_with",
        logo_alignment: "left",
        width: targetWidth,
      });
      setIsGoogleButtonReady(true);
    } catch (err) {
      console.error("GIS renderButton error:", err);
    }
  };

  useEffect(() => {
    if (Capacitor.isNativePlatform()) return;

    const initGis = async () => {
      try {
        const rawNonce = generateNonce();
        const hashedNonce = await sha256Hex(rawNonce);
        gisNonceRef.current = rawNonce;
        (window as any).google.accounts.id.initialize({
          client_id: GOOGLE_WEB_CLIENT_ID,
          callback: handleGisCredential,
          nonce: hashedNonce,
          auto_select: false,
          itp_support: true,
          context: "signin",
        });
        gisReadyRef.current = true;
        setIsGisReady(true);
        tryRenderGoogleButton();
      } catch (err) {
        console.error("GIS initialize error:", err);
      }
    };

    if ((window as any).google?.accounts?.id) {
      initGis();
      return;
    }

    // Ad blockers/privacy extensions commonly block accounts.google.com —
    // if this script never loads, gisReadyRef just stays false forever and
    // the caller's fallback button (plain loginWithGoogle, the redirect
    // flow) is what actually gets used instead.
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = initGis;
    script.onerror = () => console.error("Failed to load Google Identity Services script");
    document.head.appendChild(script);
  }, []);

  const googleButtonContainerRef = (el: HTMLDivElement | null) => {
    pendingButtonContainerRef.current = el;
    if (el) tryRenderGoogleButton();
  };

  // "One Tap" — the small floating account card Google shows in the
  // corner, offering sign-in with zero clicks if the browser already has
  // an active Google session. This is the modern pattern most sites use
  // alongside (not instead of) a regular button; fires once, only once we
  // actually know the visitor isn't already signed in (waiting on the
  // initial getSession() check above) and GIS has finished loading.
  useEffect(() => {
    if (Capacitor.isNativePlatform()) return;
    if (!isGisReady || isLoading || user) return;
    if (oneTapShownRef.current) return;
    oneTapShownRef.current = true;
    try {
      (window as any).google.accounts.id.prompt();
    } catch (err) {
      console.error("GIS prompt error:", err);
    }
  }, [isGisReady, isLoading, user]);

  // Helper to fetch user profile and role from Supabase
  const syncUserFromSession = async (sbUser: any) => {
    let role: "user" | "admin" = "user";
    let isPro = false;
    let plan = "free";
    let subscriptionStatus = "inactive";
    let profile: {
      role?: string;
      full_name?: string | null;
      avatar_url?: string | null;
      is_pro?: boolean;
      plan?: string;
      subscription_status?: string;
    } | null = null;

    // Check stored user state in localStorage as base
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed?.id === sbUser.id && parsed?.isPro) {
          isPro = true;
          plan = parsed.plan || "lifetime";
        }
      }
    } catch {}

    const meta = sbUser?.user_metadata || {};
    const appMeta = sbUser?.app_metadata || {};

    if (meta.is_pro || meta.plan === "lifetime" || appMeta.is_pro || appMeta.plan === "lifetime") {
      isPro = true;
      plan = meta.plan || appMeta.plan || "lifetime";
    }

    try {
      const profilePromise = supabase
        .from("profiles")
        .select("role, full_name, avatar_url, is_pro, plan, subscription_status")
        .eq("id", sbUser.id)
        .maybeSingle();

      const timeoutPromise = new Promise<{ data: null }>((resolve) =>
        setTimeout(() => resolve({ data: null }), 2000),
      );

      const res = (await Promise.race([profilePromise, timeoutPromise])) as any;
      profile = res?.data;

      if (isEmailAdmin(sbUser.email)) {
        role = "admin";
        isPro = true;
      } else if (profile?.role === "admin" || profile?.role === "user") {
        role = profile.role;
      }

      if (profile?.is_pro || role === "admin" || isEmailAdmin(sbUser.email)) {
        isPro = true;
      }
      if (profile?.plan) {
        plan = profile.plan;
      } else if (isPro) {
        plan = "lifetime";
      }
      if (profile?.subscription_status) {
        subscriptionStatus = profile.subscription_status;
      }
    } catch {
      if (isEmailAdmin(sbUser.email)) {
        role = "admin";
        isPro = true;
        plan = "lifetime";
      }
    }

    // 4. Server-Side & Stripe Ledger Verification Fallback
    // If not yet marked pro locally or in client profile, verify with server/Stripe records
    if (!isPro && sbUser.email) {
      try {
        const { checkUserProStatusServerFn } = await import("@/lib/stripe");
        const srvCheck = await checkUserProStatusServerFn({
          data: {
            userId: sbUser.id,
            email: sbUser.email,
          },
        });
        if (srvCheck?.isPro) {
          isPro = true;
          plan = srvCheck.plan || "lifetime";
          if (srvCheck.role === "admin") role = "admin";
        }
      } catch (srvErr) {
        console.warn("Server PRO check error:", srvErr);
      }
    }

    const authUser: AuthUser = {
      id: sbUser.id,
      name:
        profile?.full_name || meta.full_name || meta.name || sbUser.email?.split("@")[0] || "User",
      email: sbUser.email || "",
      avatar: profile?.avatar_url || meta.avatar_url || meta.picture || "/default-img.png",
      role: isEmailAdmin(sbUser.email) ? "admin" : role,
      isPro: isEmailAdmin(sbUser.email) || isPro,
      plan,
      subscriptionStatus,
    };

    setUser(authUser);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(authUser));
    try {
      localStorage.setItem(
        "postinseconds_last_account",
        JSON.stringify({ name: authUser.name, email: authUser.email, avatar: authUser.avatar }),
      );
    } catch {}
  };

  const refreshUser = async () => {
    try {
      const { data } = await supabase.auth.getSession();
      if (data?.session?.user) {
        await syncUserFromSession(data.session.user);
      }
    } catch (e) {
      console.error("Failed to refresh user:", e);
    }
  };

  const updateLocalUser = (
    partial: Partial<Pick<AuthUser, "name" | "avatar" | "isPro" | "plan">>,
  ) => {
    setUser((prev) => {
      if (!prev) return null;
      const updated = { ...prev, ...partial };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      } catch {}
      return updated;
    });
  };

  const loginWithGoogle = async () => {
    setIsLoading(true);
    try {
      if (Capacitor.isNativePlatform()) {
        const login = await withTimeout(
          SocialLogin.login({ provider: "google", options: {} }),
          20000,
          "Sign-in timed out. Please try again.",
        );
        const idToken =
          login.provider === "google" && login.result?.responseType === "online"
            ? login.result.idToken
            : null;
        if (!idToken) throw new Error("Google sign-in did not return an ID token");
        const { data, error } = await withTimeout(
          supabase.auth.signInWithIdToken({ provider: "google", token: idToken }),
          15000,
          "Sign-in timed out. Please try again.",
        );
        if (error) throw error;
        if (data?.session?.user) {
          await syncUserFromSession(data.session.user);
        }
        setIsLoading(false);
      } else {
        const { data, error } = await withTimeout(
          supabase.auth.signInWithOAuth({
            provider: "google",
            options: {
              redirectTo: window.location.origin,
            },
          }),
          15000,
          "Sign-in timed out. Please try again.",
        );
        if (error) throw error;
        if (data?.url) {
          // Leaving the page for Google's OAuth screen — deliberately don't
          // clear isLoading here, so there's no flash of the button back to
          // its idle state in the moment before the browser navigates away.
          window.location.href = data.url;
        } else {
          setIsLoading(false);
        }
      }
      setIsLoginModalOpen(false);
    } catch (e: any) {
      console.error("Google Auth Error:", e);
      alert(e.message || "Failed to sign in with Google");
      setIsLoading(false);
    }
  };

  const logout = async () => {
    setIsLoading(true);
    // Clear local session state up front rather than after the remote call
    // succeeds — the user should never be stuck looking signed-in just
    // because Supabase is slow/unreachable (e.g. a platform outage). The
    // remote signOut below is still attempted (best-effort, to actually
    // revoke the refresh token server-side) but can't block getting out.
    setUser(null);
    localStorage.removeItem(STORAGE_KEY);
    setIsLoginModalOpen(false);
    setIsUpgradeModalOpen(false);
    try {
      if (Capacitor.isNativePlatform()) {
        try {
          await withTimeout(SocialLogin.logout({ provider: "google" }), 8000, "timed out");
        } catch {}
      }
      await withTimeout(supabase.auth.signOut(), 8000, "timed out");
    } catch (e) {
      console.error("Logout Error (local session was still cleared):", e);
    } finally {
      setIsLoading(false);
    }
  };

  const openLoginModal = () => setIsLoginModalOpen(true);
  const closeLoginModal = () => setIsLoginModalOpen(false);

  const openUpgradeModal = () => setIsUpgradeModalOpen(true);
  const closeUpgradeModal = () => setIsUpgradeModalOpen(false);

  const isAdmin = user?.role === "admin" || isEmailAdmin(user?.email) || false;
  const isPro = user?.isPro || isAdmin || false;

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isAdmin,
        isPro,
        isLoading,
        loginWithGoogle,
        logout,
        isLoginModalOpen,
        openLoginModal,
        closeLoginModal,
        isUpgradeModalOpen,
        openUpgradeModal,
        closeUpgradeModal,
        refreshUser,
        updateLocalUser,
        googleButtonContainerRef,
        isGoogleButtonReady,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
