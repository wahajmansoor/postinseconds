import React, { createContext, useContext, useEffect, useState } from "react";
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
      if (Capacitor.isNativePlatform()) {
        // Native Android sign-in: opens the OS-level Credential Manager
        // account picker (no browser, no deep link) and returns a Google ID
        // token directly. Handing that to signInWithIdToken makes Supabase
        // verify it and create the exact same kind of session
        // signInWithOAuth used to — syncUserFromSession above and the
        // onAuthStateChange listener pick it up identically either way.
        //
        // No explicit `scopes` here deliberately: the plugin already
        // requests email/profile/openid by default, and passing a `scopes`
        // array at all — even ones already covered by the default — makes
        // it require MainActivity to implement
        // ModifiedMainActivityForSocialLoginPlugin (an extra native step,
        // only actually needed for scopes beyond the default three).
        const login = await SocialLogin.login({
          provider: "google",
          options: {},
        });
        const idToken =
          login.provider === "google" && login.result?.responseType === "online"
            ? login.result.idToken
            : null;
        if (!idToken) throw new Error("Google sign-in did not return an ID token");
        const { error } = await supabase.auth.signInWithIdToken({ provider: "google", token: idToken });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signInWithOAuth({
          provider: "google",
          options: { redirectTo: window.location.origin },
        });
        if (error) throw error;
      }
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
    if (Capacitor.isNativePlatform()) {
      // Clears Credential Manager's own cached account-selection state too
      // — without this, signing out in-app and signing back in could
      // silently reuse the same cached credential instead of showing the
      // account picker again.
      try {
        await SocialLogin.logout({ provider: "google" });
      } catch {}
    }
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
