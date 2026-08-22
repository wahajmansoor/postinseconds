import React, { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  fetchAllTemplates,
  upsertTemplate,
  deleteTemplate,
  fetchProfiles,
  updateUserRole,
  fetchSavedQuotes,
  isSupabaseConfigured,
  type DbProfile,
  type DbSavedQuote,
} from "@/lib/supabase";
import { TemplatePreview } from "@/components/editor/TemplatePreview";
import {
  INITIAL_STATE,
  type Template,
  type EditorState,
} from "@/components/editor/types";
import {
  Add01Icon,
  ArrowLeft01Icon,
  DashboardSquare01Icon,
  DatabaseIcon,
  Delete02Icon,
  Edit02Icon,
  Folder01Icon,
  Layout01Icon,
  PaintBrush01Icon as BrushIcon,
  SecurityCheckIcon,
  SparklesIcon,
  StarCircleIcon,
  UserGroupIcon,
} from "hugeicons-react";

export function AdminDashboard() {
  const { user, isAdmin, loginWithGoogle } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<"templates" | "users" | "quotes">("templates");
  const [templates, setTemplates] = useState<Template[]>([]);
  const [profiles, setProfiles] = useState<DbProfile[]>([]);
  const [savedQuotes, setSavedQuotes] = useState<DbSavedQuote[]>([]);
  const [loading, setLoading] = useState(true);

  // Template edit / create modal state
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [isNewTemplate, setIsNewTemplate] = useState(false);
  const [editLabel, setEditLabel] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editCategory, setEditCategory] = useState<"starter" | "premium">("starter");

  const handleOpenInEditor = (t: Template) => {
    try {
      sessionStorage.setItem("postinseconds_load_template", JSON.stringify(t));
    } catch {}
    navigate({ to: "/" });
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const [allT, allP, allQ] = await Promise.all([
        fetchAllTemplates(),
        fetchProfiles(),
        fetchSavedQuotes(),
      ]);
      setTemplates(allT);
      setProfiles(allP);
      setSavedQuotes(allQ);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleOpenEdit = (t: Template) => {
    setEditingTemplate(t);
    setIsNewTemplate(false);
    setEditLabel(t.label);
    setEditDesc(t.description || "");
    setEditCategory(
      t.id.includes("founder") ||
        t.id.includes("hormozi") ||
        t.id.includes("jasmin") ||
        t.id.includes("viral") ||
        t.id.includes("cyber") ||
        t.id.includes("creator") ||
        t.id.includes("luxury")
        ? "premium"
        : "starter",
    );
  };

  const handleOpenCreate = () => {
    const newId = "custom-" + Math.random().toString(36).substring(2, 8);
    setEditingTemplate({
      id: newId,
      label: "New Design Preset",
      description: "Custom template description.",
      state: { ...INITIAL_STATE },
    });
    setIsNewTemplate(true);
    setEditLabel("New Design Preset");
    setEditDesc("Custom template description.");
    setEditCategory("premium");
  };

  const handleSaveTemplate = async () => {
    if (!editingTemplate) return;
    const updated: Template = {
      id: editingTemplate.id,
      label: editLabel.trim() || "Untitled Template",
      description: editDesc.trim(),
      state: editingTemplate.state,
    };

    await upsertTemplate(updated, editCategory === "premium");
    setEditingTemplate(null);
    await loadData();
  };

  const handleDeleteTemplate = async (id: string) => {
    if (confirm("Are you sure you want to delete this template?")) {
      await deleteTemplate(id);
      await loadData();
    }
  };

  const handleToggleRole = async (targetUser: DbProfile) => {
    const nextRole = targetUser.role === "admin" ? "user" : "admin";
    await updateUserRole(targetUser.id, nextRole);
    await loadData();
  };

  const starterTemplates = templates.filter(
    (t) =>
      !t.id.includes("founder") &&
      !t.id.includes("hormozi") &&
      !t.id.includes("jasmin") &&
      !t.id.includes("viral") &&
      !t.id.includes("cyber") &&
      !t.id.includes("creator") &&
      !t.id.includes("luxury"),
  );

  const premiumTemplates = templates.filter(
    (t) =>
      t.id.includes("founder") ||
      t.id.includes("hormozi") ||
      t.id.includes("jasmin") ||
      t.id.includes("viral") ||
      t.id.includes("cyber") ||
      t.id.includes("creator") ||
      t.id.includes("luxury"),
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Top Navbar */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-background/80 px-6 py-3.5 backdrop-blur-xl">
        <div className="flex items-center gap-4">
          <Link
            to="/"
            className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground transition-all hover:bg-accent active:scale-95"
          >
            <ArrowLeft01Icon size={16} />
            <span>Back to Studio</span>
          </Link>
          <div className="h-4 w-px bg-border" />
          <div className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-tr from-indigo-500 to-pink-500 shadow-md">
              <SecurityCheckIcon size={16} className="text-white" />
            </span>
            <div>
              <h1 className="text-sm font-bold leading-none tracking-tight">Admin Control Center</h1>
              <p className="mt-1 text-[10px] text-muted-foreground">Post In Seconds Platform Manager</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* User badge */}
          {user ? (
            <div className="flex items-center gap-2.5 rounded-full border border-border bg-card p-1 pr-3 text-xs">
              <img src={user.avatar} alt="" className="h-8 w-8 rounded-full object-cover ring-1 ring-border shadow-sm" />
              <span className="font-semibold text-foreground">{user.name}</span>
              <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[9px] font-bold uppercase text-primary">
                {user.role}
              </span>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => loginWithGoogle()}
              className="rounded-full bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-foreground shadow-sm hover:bg-primary/90"
            >
              Sign in with Google
            </button>
          )}
        </div>
      </header>

      {/* Main Container */}
      <main className="mx-auto max-w-7xl px-6 py-8">
        {/* Metric Cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Total Templates</span>
              <span className="rounded-lg bg-indigo-500/10 p-2 text-indigo-500">
                <Layout01Icon size={18} />
              </span>
            </div>
            <p className="mt-2 text-2xl font-bold tracking-tight text-foreground">{templates.length}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {starterTemplates.length} Free · {premiumTemplates.length} Premium
            </p>
          </div>

          <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Registered Users</span>
              <span className="rounded-lg bg-emerald-500/10 p-2 text-emerald-500">
                <UserGroupIcon size={18} />
              </span>
            </div>
            <p className="mt-2 text-2xl font-bold tracking-tight text-foreground">{profiles.length}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {profiles.filter((p) => p.role === "admin").length} Admins
            </p>
          </div>

          <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Cloud Saved Designs</span>
              <span className="rounded-lg bg-pink-500/10 p-2 text-pink-500">
                <Folder01Icon size={18} />
              </span>
            </div>
            <p className="mt-2 text-2xl font-bold tracking-tight text-foreground">{savedQuotes.length}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">Saved creations in database</p>
          </div>

          <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Cloud Sync Status</span>
              <span className="rounded-lg bg-cyan-500/10 p-2 text-cyan-500">
                <DatabaseIcon size={18} />
              </span>
            </div>
            <p className="mt-2 text-sm font-bold tracking-tight text-foreground">
              Active / Real-time Sync
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">Protected with Row Level Security</p>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="mt-8 flex items-center justify-between border-b border-border">
          <div className="flex items-center gap-6">
            <button
              type="button"
              onClick={() => setActiveTab("templates")}
              className={`flex items-center gap-2 border-b-2 py-3 text-xs font-semibold transition-colors ${
                activeTab === "templates"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Layout01Icon size={16} />
              <span>Template Management</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("users")}
              className={`flex items-center gap-2 border-b-2 py-3 text-xs font-semibold transition-colors ${
                activeTab === "users"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <UserGroupIcon size={16} />
              <span>Users & Roles</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("quotes")}
              className={`flex items-center gap-2 border-b-2 py-3 text-xs font-semibold transition-colors ${
                activeTab === "quotes"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Folder01Icon size={16} />
              <span>Saved Designs</span>
            </button>
          </div>

          {activeTab === "templates" ? (
            <button
              type="button"
              onClick={handleOpenCreate}
              className="mb-2 flex items-center gap-2 rounded-xl bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary/90 active:scale-95"
            >
              <Add01Icon size={15} />
              <span>Create Template</span>
            </button>
          ) : null}
        </div>

        {/* Tab Content */}
        <div className="mt-6">
          {/* 1. TEMPLATES TAB */}
          {activeTab === "templates" ? (
            <div className="space-y-8">
              {/* Premium Templates Section */}
              <div>
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-bold text-foreground">
                      Premium Templates ({premiumTemplates.length})
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      Exclusive curated designs displayed in the Premium showcase
                    </p>
                  </div>
                </div>

                {premiumTemplates.length === 0 ? (
                  <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border py-12 text-center">
                    <StarCircleIcon size={32} className="text-muted-foreground/40" />
                    <p className="mt-2 text-sm font-semibold text-foreground">No premium templates published yet</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Design a quote on the canvas and click "★ Save as Platform Template" to add one!
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {premiumTemplates.map((t) => (
                      <div
                        key={t.id}
                        className="group flex flex-col justify-between overflow-hidden rounded-2xl border border-border bg-card p-3 shadow-sm transition-all hover:border-primary/50 hover:shadow-md"
                      >
                        <div>
                          <div
                            className="mb-3 flex cursor-pointer justify-center transition-transform group-hover:scale-102"
                            onClick={() => handleOpenInEditor(t)}
                            title="Click to open and edit in Studio"
                          >
                            <TemplatePreview
                              template={t}
                              width={150}
                              showLabel={false}
                            />
                          </div>
                          <div className="flex items-center justify-between">
                            <h3 className="text-xs font-bold text-foreground">{t.label}</h3>
                            <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-500">
                              Premium
                            </span>
                          </div>
                          <p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">
                            {t.description || "No description provided."}
                          </p>
                        </div>

                        <div className="mt-4 flex items-center justify-end border-t border-border/60 pt-3">
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleOpenInEditor(t)}
                              className="flex items-center gap-1.5 rounded-lg bg-primary px-2.5 py-1 text-[11px] font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary/90 active:scale-95"
                              title="Open & edit design in Studio Canvas"
                            >
                              <BrushIcon size={13} />
                              <span>Edit Design</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleOpenEdit(t)}
                              className="flex items-center gap-1 rounded-lg border border-border bg-card px-2.5 py-1 text-[11px] font-semibold text-foreground transition-colors hover:bg-secondary"
                              title="Adjust template name, category & description"
                            >
                              <Edit02Icon size={12} />
                              <span>Edit Name</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteTemplate(t.id)}
                              className="rounded-lg border border-border p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                              title="Delete Template"
                            >
                              <Delete02Icon size={13} />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Starter Templates Section */}
              <div>
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-bold text-foreground">
                      Free Starter Templates ({starterTemplates.length})
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      Default starter templates visible in the studio free tab
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {starterTemplates.map((t) => (
                    <div
                      key={t.id}
                      className="group flex flex-col justify-between overflow-hidden rounded-2xl border border-border bg-card p-3 shadow-sm transition-all hover:border-primary/50 hover:shadow-md"
                    >
                      <div>
                        <div
                          className="mb-3 flex cursor-pointer justify-center transition-transform group-hover:scale-102"
                          onClick={() => handleOpenInEditor(t)}
                          title="Click to open and edit in Studio"
                        >
                          <TemplatePreview
                            template={t}
                            width={150}
                            showLabel={false}
                          />
                        </div>
                        <div className="flex items-center justify-between">
                          <h3 className="text-xs font-bold text-foreground">{t.label}</h3>
                          <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                            Starter
                          </span>
                        </div>
                        <p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">
                          {t.description || "No description provided."}
                        </p>
                      </div>

                      <div className="mt-4 flex items-center justify-end border-t border-border/60 pt-3">
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleOpenInEditor(t)}
                            className="flex items-center gap-1.5 rounded-lg bg-primary px-2.5 py-1 text-[11px] font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary/90 active:scale-95"
                            title="Open & edit design in Studio Canvas"
                          >
                            <BrushIcon size={13} />
                            <span>Edit Design</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenEdit(t)}
                            className="flex items-center gap-1 rounded-lg border border-border bg-card px-2.5 py-1 text-[11px] font-semibold text-foreground transition-colors hover:bg-secondary"
                            title="Adjust template name, category & description"
                          >
                            <Edit02Icon size={12} />
                            <span>Edit Name</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteTemplate(t.id)}
                            className="rounded-lg border border-border p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                            title="Delete Template"
                          >
                            <Delete02Icon size={13} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : null}

          {/* 2. USERS & ROLES TAB */}
          {activeTab === "users" ? (
            <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
              <div className="border-b border-border px-6 py-4">
                <h2 className="text-sm font-bold text-foreground">Registered Users ({profiles.length})</h2>
                <p className="text-xs text-muted-foreground">Manage user accounts and admin privilege roles</p>
              </div>

              {profiles.length === 0 ? (
                <div className="p-8 text-center text-xs text-muted-foreground">
                  No users loaded.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-border bg-muted/40 text-[11px] font-semibold text-muted-foreground">
                      <tr>
                        <th className="px-6 py-3">User</th>
                        <th className="px-6 py-3">Email</th>
                        <th className="px-6 py-3">Role</th>
                        <th className="px-6 py-3">Joined Date</th>
                        <th className="px-6 py-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {profiles.map((p) => (
                        <tr key={p.id} className="hover:bg-muted/20">
                          <td className="px-6 py-3.5">
                            <div className="flex items-center gap-3">
                              {p.avatar_url ? (
                                <img
                                  src={p.avatar_url}
                                  alt=""
                                  className="h-8 w-8 rounded-full border border-border object-cover"
                                />
                              ) : (
                                <div className="grid h-8 w-8 place-items-center rounded-full bg-primary/10 font-bold text-primary">
                                  {p.full_name?.charAt(0) || "U"}
                                </div>
                              )}
                              <div>
                                <p className="font-semibold text-foreground">{p.full_name || "Anonymous User"}</p>
                                <p className="font-mono text-[10px] text-muted-foreground">{p.id.substring(0, 8)}...</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-3.5 text-muted-foreground">{p.email}</td>
                          <td className="px-6 py-3.5">
                            <span
                              className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${
                                p.role === "admin"
                                  ? "bg-purple-500/10 text-purple-500"
                                  : "bg-secondary text-muted-foreground"
                              }`}
                            >
                              {p.role.toUpperCase()}
                            </span>
                          </td>
                          <td className="px-6 py-3.5 text-muted-foreground">
                            {new Date(p.created_at).toLocaleDateString()}
                          </td>
                          <td className="px-6 py-3.5 text-right">
                            <button
                              type="button"
                              onClick={() => handleToggleRole(p)}
                              className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                                p.role === "admin"
                                  ? "border border-border text-foreground hover:bg-secondary"
                                  : "bg-primary text-primary-foreground hover:bg-primary/90"
                              }`}
                            >
                              {p.role === "admin" ? "Demote to User" : "Promote to Admin"}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : null}

          {/* 3. SAVED DESIGNS TAB */}
          {activeTab === "quotes" ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-bold text-foreground">User Saved Designs ({savedQuotes.length})</h2>
                  <p className="text-xs text-muted-foreground">Designs saved by platform users in their personal library</p>
                </div>
              </div>

              {savedQuotes.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border py-12 text-center">
                  <Folder01Icon size={32} className="text-muted-foreground/40" />
                  <p className="mt-2 text-sm font-semibold text-foreground">No saved designs found</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {savedQuotes.map((q) => (
                    <div
                      key={q.id}
                      className="flex flex-col justify-between overflow-hidden rounded-2xl border border-border bg-card p-3 shadow-sm"
                    >
                      <div>
                        <div className="mb-3 flex justify-center">
                          <TemplatePreview
                            template={{ id: q.id, label: q.title, description: "", state: q.state }}
                            width={150}
                            showLabel={false}
                          />
                        </div>
                        <h3 className="text-xs font-bold text-foreground">{q.title}</h3>
                        <p className="mt-0.5 text-[10px] text-muted-foreground">
                          Created {new Date(q.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="mt-3 border-t border-border/60 pt-2 text-[10px] text-muted-foreground">
                        User ID: {q.user_id ? `${q.user_id.substring(0, 8)}...` : "Anonymous"}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : null}
        </div>
      </main>

      {/* Edit / Create Template Modal */}
      {editingTemplate ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-2xl border border-border bg-background p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-border pb-4">
              <div>
                <h3 className="text-base font-bold text-foreground">
                  {isNewTemplate ? "Create New Template" : `Edit Template: ${editingTemplate.label}`}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setEditingTemplate(null)}
                className="rounded-lg p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 overflow-y-auto py-4 text-xs">
              {/* Visual Preview */}
              <div className="flex justify-center rounded-xl border border-border/70 bg-secondary/30 p-3">
                <TemplatePreview
                  template={editingTemplate}
                  width={140}
                  showLabel={false}
                />
              </div>

              <div>
                <label className="mb-1 block font-semibold text-foreground">Template Name</label>
                <input
                  type="text"
                  value={editLabel}
                  onChange={(e) => setEditLabel(e.target.value)}
                  className="w-full rounded-xl border border-border bg-card px-3 py-2 text-foreground focus:border-primary focus:outline-none"
                  placeholder="e.g. Minimalist Dark"
                />
              </div>

              <div>
                <label className="mb-1 block font-semibold text-foreground">Category Tier</label>
                <select
                  value={editCategory}
                  onChange={(e) => setEditCategory(e.target.value as any)}
                  className="w-full rounded-xl border border-border bg-card px-3 py-2 text-foreground focus:border-primary focus:outline-none"
                >
                  <option value="starter">Free Template</option>
                  <option value="premium">Premium Pro Template</option>
                </select>
              </div>

              <div>
                <label className="mb-1 block font-semibold text-foreground">Description</label>
                <input
                  type="text"
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  className="w-full rounded-xl border border-border bg-card px-3 py-2 text-foreground focus:border-primary focus:outline-none"
                  placeholder="e.g. Modern typography layout on dark gradient"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-border pt-4">
              <button
                type="button"
                onClick={() => setEditingTemplate(null)}
                className="rounded-xl border border-border px-4 py-2 text-xs font-semibold text-foreground hover:bg-accent"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveTemplate}
                className="rounded-xl bg-primary px-5 py-2 text-xs font-semibold text-primary-foreground shadow-sm hover:bg-primary/90"
              >
                Save Template
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
