import { createClient } from "@supabase/supabase-js";
import {
  STARTER_TEMPLATES,
  PREMIUM_TEMPLATES,
  TEMPLATES,
  type Template,
  type EditorState,
} from "@/components/editor/types";

const supabaseUrl = (import.meta.env["VITE_SUPABASE_URL"] as string) || "https://your-project.supabase.co";
const supabaseAnonKey = (import.meta.env["VITE_SUPABASE_ANON_KEY"] as string) || "your-anon-key";

export const isSupabaseConfigured = Boolean(
  import.meta.env["VITE_SUPABASE_URL"] &&
    import.meta.env["VITE_SUPABASE_ANON_KEY"] &&
    !(import.meta.env["VITE_SUPABASE_URL"] as string).includes("your-project"),
);

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export interface DbProfile {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  role: "user" | "admin";
  created_at: string;
}

export interface DbSavedQuote {
  id: string;
  user_id: string;
  title: string;
  state: EditorState;
  thumbnail_url?: string;
  created_at: string;
  updated_at: string;
}

const LOCAL_TEMPLATES_KEY = "postinseconds_custom_templates";
const LOCAL_SAVED_QUOTES_KEY = "postinseconds_saved_quotes";

// Helper: Seed local storage with default starter + premium templates if empty
function getLocalTemplates(): Template[] {
  if (typeof window === "undefined") return TEMPLATES;
  try {
    const raw = localStorage.getItem(LOCAL_TEMPLATES_KEY);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch {}
  return TEMPLATES;
}

function saveLocalTemplates(templates: Template[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LOCAL_TEMPLATES_KEY, JSON.stringify(templates));
  } catch {}
}

export async function fetchAllTemplates(): Promise<Template[]> {
  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase
        .from("templates")
        .select("*")
        .order("sort_order", { ascending: true });

      if (!error && data && data.length > 0) {
        return data.map((d: any) => ({
          id: d.id,
          label: d.label,
          description: d.description || "",
          state: d.state,
        }));
      }
    } catch (e) {
      console.warn("Supabase fetch failed, using local templates", e);
    }
  }
  return getLocalTemplates();
}

export async function upsertTemplate(template: Template, isPremium: boolean = false): Promise<boolean> {
  // Update local storage
  const current = getLocalTemplates();
  const existingIdx = current.findIndex((t) => t.id === template.id);
  let next: Template[];
  if (existingIdx >= 0) {
    next = current.map((t) => (t.id === template.id ? template : t));
  } else {
    next = [template, ...current];
  }
  saveLocalTemplates(next);

  if (isSupabaseConfigured) {
    try {
      const { error } = await supabase.from("templates").upsert({
        id: template.id,
        label: template.label,
        category: isPremium ? "premium" : "starter",
        description: template.description,
        state: template.state,
        is_premium: isPremium,
        is_published: true,
        updated_at: new Date().toISOString(),
      });
      return !error;
    } catch {
      return false;
    }
  }
  return true;
}

export async function deleteTemplate(id: string): Promise<boolean> {
  const current = getLocalTemplates();
  const next = current.filter((t) => t.id !== id);
  saveLocalTemplates(next);

  if (isSupabaseConfigured) {
    try {
      const { error } = await supabase.from("templates").delete().eq("id", id);
      return !error;
    } catch {
      return false;
    }
  }
  return true;
}

export async function fetchProfiles(): Promise<DbProfile[]> {
  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: false });
    if (!error && data) return data;
  } catch (e) {
    console.error("Error fetching Supabase profiles:", e);
  }
  return [];
}

export async function updateOwnProfile(
  userId: string,
  updates: { full_name?: string; avatar_url?: string },
): Promise<boolean> {
  // Unlike updateUserRole, this is a plain table update — the guard trigger
  // on profiles only blocks changes to `role`, so a user editing their own
  // name/avatar goes through the normal "Users can update own profile" RLS
  // policy with no RPC needed.
  try {
    const { error } = await supabase.from("profiles").update(updates).eq("id", userId);
    if (error) console.error("Error updating own profile:", error);
    return !error;
  } catch (e) {
    console.error("Error updating own profile:", e);
    return false;
  }
}

export async function updateUserRole(userId: string, role: "user" | "admin"): Promise<boolean> {
  // Role changes must go through the admin_update_user_role RPC — the
  // profiles table has a guard trigger that rejects direct role updates
  // (including from an admin's own client session) to close off the
  // self-privilege-escalation hole a plain `.update({ role })` would allow.
  try {
    const { error } = await supabase.rpc("admin_update_user_role", {
      target_id: userId,
      new_role: role,
    });
    if (error) console.error("Error updating user role:", error);
    return !error;
  } catch (e) {
    console.error("Error updating user role:", e);
    return false;
  }
}

export async function fetchSavedQuotes(userId?: string): Promise<DbSavedQuote[]> {
  if (isSupabaseConfigured && userId) {
    try {
      let query = supabase.from("user_saved_quotes").select("*").order("created_at", { ascending: false });
      if (userId) query = query.eq("user_id", userId);
      const { data, error } = await query;
      if (!error && data) return data;
    } catch {}
  }

  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LOCAL_SAVED_QUOTES_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return [];
}

export async function saveQuoteDesign(userId: string, title: string, state: EditorState): Promise<boolean> {
  const newQuote: DbSavedQuote = {
    id: "quote_" + Math.random().toString(36).substring(2, 10),
    user_id: userId,
    title: title || "Untitled Design",
    state,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const existing = await fetchSavedQuotes();
  const next = [newQuote, ...existing];
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(LOCAL_SAVED_QUOTES_KEY, JSON.stringify(next));
    } catch {}
  }

  if (isSupabaseConfigured) {
    try {
      const { error } = await supabase.from("user_saved_quotes").insert({
        user_id: userId,
        title: newQuote.title,
        state: newQuote.state,
      });
      return !error;
    } catch {
      return false;
    }
  }
  return true;
}

export async function updateSavedQuoteDesign(
  quoteId: string,
  title: string,
  state: EditorState,
  userId?: string,
): Promise<boolean> {
  if (typeof window !== "undefined") {
    try {
      const raw = localStorage.getItem(LOCAL_SAVED_QUOTES_KEY);
      if (raw) {
        const parsed: DbSavedQuote[] = JSON.parse(raw);
        const next = parsed.map((q) =>
          q.id === quoteId
            ? { ...q, title: title || q.title, state, updated_at: new Date().toISOString() }
            : q,
        );
        localStorage.setItem(LOCAL_SAVED_QUOTES_KEY, JSON.stringify(next));
      }
    } catch {}
  }

  if (isSupabaseConfigured && quoteId) {
    try {
      const { error } = await supabase
        .from("user_saved_quotes")
        .update({
          title: title || "Untitled Design",
          state,
          updated_at: new Date().toISOString(),
        })
        .eq("id", quoteId);
      return !error;
    } catch {
      return false;
    }
  }
  return true;
}

export async function deleteSavedQuote(quoteId: string): Promise<boolean> {
  if (typeof window !== "undefined") {
    try {
      const raw = localStorage.getItem(LOCAL_SAVED_QUOTES_KEY);
      if (raw) {
        const parsed: DbSavedQuote[] = JSON.parse(raw);
        const next = parsed.filter((q) => q.id !== quoteId);
        localStorage.setItem(LOCAL_SAVED_QUOTES_KEY, JSON.stringify(next));
      }
    } catch {}
  }

  if (isSupabaseConfigured) {
    try {
      const { error } = await supabase.from("user_saved_quotes").delete().eq("id", quoteId);
      return !error;
    } catch {
      return false;
    }
  }
  return true;
}

export const LOCAL_AUTOSAVE_DRAFT_KEY = "postinseconds_active_draft_v2";

export function getSavedDraft(): EditorState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(LOCAL_AUTOSAVE_DRAFT_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        return parsed as EditorState;
      }
    }
  } catch {}
  return null;
}

export function saveActiveDraft(state: EditorState): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LOCAL_AUTOSAVE_DRAFT_KEY, JSON.stringify(state));
  } catch {}
}

export function clearActiveDraft(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(LOCAL_AUTOSAVE_DRAFT_KEY);
  } catch {}
}

// --- Cloud-synced active draft (account-wide, live) ----------------------
// Everything above this (getSavedDraft/saveActiveDraft/clearActiveDraft) is
// a plain per-device localStorage mirror — the fast, always-available
// local cache, and the only thing that exists at all when signed out or
// Supabase isn't configured. These three add an account-scoped copy in
// Supabase's `user_active_draft` table (see supabase_schema.sql) on top of
// that, so opening the editor on a different device picks up the same
// in-progress design, and a live subscription pushes further edits to any
// other open tab/device in real time. index.tsx calls the local functions
// unconditionally and these only when signed in — the local draft still
// gets written every time as a fast/offline fallback.

export async function fetchCloudActiveDraft(
  userId: string,
): Promise<{ state: EditorState; updatedAt: string } | null> {
  if (!isSupabaseConfigured || !userId) return null;
  try {
    const { data, error } = await supabase
      .from("user_active_draft")
      .select("state, updated_at")
      .eq("user_id", userId)
      .maybeSingle();
    // Logged, not silently swallowed — this table/policy set is new
    // (supabase_schema.sql), so a missing-migration or RLS mistake fails
    // here first, silently, unless something says so out loud. A 42P01
    // ("relation does not exist") code means the migration hasn't been run
    // yet in this Supabase project.
    if (error) {
      console.warn("[cloud draft] fetch failed — is the user_active_draft migration applied?", error);
      return null;
    }
    if (data) return { state: data.state as EditorState, updatedAt: data.updated_at as string };
  } catch (err) {
    console.warn("[cloud draft] fetch threw", err);
  }
  return null;
}

// Returns the `updated_at` this write was stamped with, so the caller can
// remember "the newest point I myself pushed" — see subscribeToCloudActiveDraft's
// comment for why that's needed to keep a fast-editing client from
// clobbering its own newer local state with a delayed echo of this write.
export async function upsertCloudActiveDraft(userId: string, state: EditorState): Promise<string | null> {
  if (!isSupabaseConfigured || !userId) return null;
  const updatedAt = new Date().toISOString();
  try {
    const { error } = await supabase.from("user_active_draft").upsert({
      user_id: userId,
      state,
      updated_at: updatedAt,
    });
    if (error) {
      console.warn("[cloud draft] upsert failed — is the user_active_draft migration applied?", error);
      return null;
    }
    return updatedAt;
  } catch (err) {
    console.warn("[cloud draft] upsert threw", err);
    return null;
  }
}

// Fires `onRemoteChange` whenever this user's active draft row changes,
// carrying the row's own `updated_at` alongside the new state.
//
// IMPORTANT — this DOES also fire for writes made by this exact client, not
// just a different tab/device: Supabase's `postgres_changes` mirrors actual
// table changes (via Postgres's replication stream) to every subscribed
// client whose filter matches, with no built-in exclusion of the socket
// that made the write (that self-suppression only exists for the separate
// "Broadcast" feature, not postgres_changes). A previous version of this
// comment claimed otherwise — confirmed wrong by a real repro: fast
// dragging on a single device/tab, no other device involved, still showed a
// layer snap back to an older position, which is only possible if this
// client received its own echoed write back. Callers MUST compare the
// passed `updatedAt` against the newest `updatedAt` they already know about
// (their own most recent push, or the newest remote update already
// applied) and ignore anything not strictly newer — otherwise a delayed
// echo of an earlier local state races the user's own subsequent edits and
// silently reverts them (the exact bug above). Returns an unsubscribe
// function — call it on cleanup (user change/sign-out, component unmount)
// or the realtime channel leaks.
export function subscribeToCloudActiveDraft(
  userId: string,
  onRemoteChange: (state: EditorState, updatedAt: string) => void,
): () => void {
  if (!isSupabaseConfigured || !userId) return () => {};
  const channel = supabase
    .channel(`active-draft-${userId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "user_active_draft", filter: `user_id=eq.${userId}` },
      (payload) => {
        const row = payload.new as { state?: EditorState; updated_at?: string } | null;
        if (row?.state && row.updated_at) onRemoteChange(row.state, row.updated_at);
      },
    )
    // status is 'SUBSCRIBED' once the realtime channel actually connects,
    // 'CHANNEL_ERROR'/'TIMED_OUT'/'CLOSED' otherwise — logged because a
    // channel that never reaches SUBSCRIBED (e.g. the table isn't in the
    // supabase_realtime publication yet, or Realtime is off for the
    // project) fails completely silently otherwise: fetch/upsert above
    // would still work fine, so the draft loads correctly on open, it
    // just never live-updates while both devices are open — which looks
    // exactly like "each device shows something different" once they've
    // each been edited independently from that shared starting point.
    .subscribe((status, err) => {
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        console.warn(
          `[cloud draft] realtime subscription ${status} — check that user_active_draft is in the ` +
          `supabase_realtime publication (see supabase_schema.sql) and that Realtime is enabled for this project.`,
          err,
        );
      }
    });
  return () => {
    supabase.removeChannel(channel);
  };
}
