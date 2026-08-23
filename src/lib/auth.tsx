import React, { createContext, useContext, useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { App as CapacitorApp } from "@capacitor/app";
import { supabase } from "@/lib/supabase";

// Custom scheme the native app registers a deep-link intent-filter for (see
// android/app/src/main/AndroidManifest.xml) — must also be added to
// Supabase's Authentication > URL Configuration > Redirect URLs allowlist,
// or Supabase rejects the redirect before it ever reaches the device.
const NATIVE_OAUTH_REDIRECT = "postinseconds://auth-callback";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  avatar: string;
  role: "user" | "admin";
}

interface AuthContextType {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isLoading: boolean;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  isLoginModalOpen: boolean;
  openLoginModal: () => void;
  closeLoginModal: () => void;
  updateLocalUser: (partial: Partial<Pick<AuthUser, "name" | "avatar">>) => void;
}

const STORAGE_KEY = "postinseconds_auth_user";

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });
  // Starts true: until the initial getSession() check resolves, we don't yet
  // know if there's a live session, so gates (AdminGate/StudioGate) must show
  // a loading state rather than flashing the signed-out view.
  const [isLoading, setIsLoading] = useState(true);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);

  // Sync Supabase Auth session on mount and state changes
  useEffect(() => {
    let mounted = true;

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
      subscription.unsubscribe();
    };
  }, []);

  // Native-app-only: catches the deep-link the system browser is routed
  // back to once Google OAuth completes (see NATIVE_OAUTH_REDIRECT above
  // and the intent-filter in AndroidManifest.xml). The tokens travel as a
  // URL hash fragment (#access_token=...&refresh_token=...), same shape
  // supabase-js's browser code parses automatically from window.location on
  // the web — here we parse it by hand off the deep-link URL and hand it to
  // setSession(), which fires the same onAuthStateChange SIGNED_IN event as
  // any other sign-in, so syncUserFromSession above picks it up for free.
  // No-op on web (listener only registers on native platform).
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const sub = CapacitorApp.addListener("appUrlOpen", async ({ url }) => {
      if (!url.startsWith(NATIVE_OAUTH_REDIRECT)) return;
      const hash = url.split("#")[1];
      if (!hash) return;
      const params = new URLSearchParams(hash);
      const access_token = params.get("access_token");
      const refresh_token = params.get("refresh_token");
      if (access_token && refresh_token) {
        const { error } = await supabase.auth.setSession({ access_token, refresh_token });
        if (error) console.error("Failed to establish session from deep link:", error);
      }
    });
    return () => {
      sub.then((s) => s.remove());
    };
  }, []);

  // Helper to fetch user profile and role from Supabase
  const syncUserFromSession = async (sbUser: any) => {
    let role: "user" | "admin" = "user";
    let profile: { role?: string; full_name?: string | null; avatar_url?: string | null } | null = null;
    try {
      const { data } = await supabase
        .from("profiles")
        .select("role, full_name, avatar_url")
        .eq("id", sbUser.id)
        .single();

      profile = data;
      if (profile?.role === "admin" || profile?.role === "user") {
        role = profile.role;
      }
    } catch {}

    const meta = sbUser.user_metadata || {};
    const authUser: AuthUser = {
      id: sbUser.id,
      // profiles.full_name/avatar_url win once set — they're the record of
      // any edit made through Edit Profile; Google's own metadata is only
      // the fallback for a user who has never customized either field.
      name: profile?.full_name || meta.full_name || meta.name || sbUser.email?.split("@")[0] || "User",
      email: sbUser.email || "",
      avatar: profile?.avatar_url || meta.avatar_url || meta.picture || "/defult-img.jpg",
      role,
    };

    setUser(authUser);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(authUser));
  };

  const updateLocalUser = (partial: Partial<Pick<AuthUser, "name" | "avatar">>) => {
    setUser((prev) => {
      if (!prev) return prev;
      const next = { ...prev, ...partial };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  };

  const loginWithGoogle = async () => {
    setIsLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          // In the native app, a plain http(s) redirectTo just reopens the
          // system browser on that URL with nowhere to go — the browser has
          // no way to hand control back to the app. The custom-scheme
          // redirect is what Android recognizes as belonging to this app
          // (via the deep-link intent-filter) and routes back in; the
          // appUrlOpen listener below then picks the session out of it.
          redirectTo: Capacitor.isNativePlatform() ? NATIVE_OAUTH_REDIRECT : window.location.origin,
        },
      });
      if (error) throw error;
      setIsLoginModalOpen(false);
    } catch (e: any) {
      console.error("Google Auth Error:", e);
      alert(e.message || "Failed to sign in with Google");
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    try {
      await supabase.auth.signOut();
    } catch {}
    setUser(null);
    localStorage.removeItem(STORAGE_KEY);
  };

  const openLoginModal = () => setIsLoginModalOpen(true);
  const closeLoginModal = () => setIsLoginModalOpen(false);

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isAdmin: user?.role === "admin",
        isLoading,
        loginWithGoogle,
        logout,
        isLoginModalOpen,
        openLoginModal,
        closeLoginModal,
        updateLocalUser,
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
