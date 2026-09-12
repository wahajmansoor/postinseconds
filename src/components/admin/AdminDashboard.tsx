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
import { compressImageFile } from "@/lib/imageCompression";
import { toast } from "@/components/ui/sonner";
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
  const [editThumbnailUrl, setEditThumbnailUrl] = useState("");
  const [isUploadingThumb, setIsUploadingThumb] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

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
    setEditThumbnailUrl(t.thumbnailUrl || "");
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
      thumbnailUrl: "",
      state: { ...INITIAL_STATE },
    });
    setIsNewTemplate(true);
    setEditLabel("New Design Preset");
    setEditDesc("Custom template description.");
    setEditThumbnailUrl("");
    setEditCategory("premium");
  };

  const handleSaveTemplate = async () => {
    if (!editingTemplate) return;
    setIsSaving(true);
    try {
      const updated: Template = {
        id: editingTemplate.id,
        label: editLabel.trim() || "Untitled Template",
        description: editDesc.trim(),
        thumbnailUrl: editThumbnailUrl.trim() || undefined,
        state: {
          ...editingTemplate.state,
          thumbnailUrl: editThumbnailUrl.trim() || undefined,
        },
      };

      const success = await upsertTemplate(updated, editCategory === "premium", user?.email);
      if (success) {
        toast.success("Template saved successfully!");
        window.dispatchEvent(
          new CustomEvent("postinseconds:template-saved", {
            detail: { category: editCategory },
          }),
        );
      } else {
        toast.error("Failed to save template to database.");
      }
      setEditingTemplate(null);
      await loadData();
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteTemplate = (id: string) => {
    setDeleteConfirmId(id);
  };

  const handleToggleRole = async (targetUser: DbProfile) => {
    const nextRole = targetUser.role === "admin" ? "user" : "admin";
    await updateUserRole(targetUser.id, nextRole);
    await loadData();
  };

  const isTemplatePremium = (t: Template) => {
    if (t.category === "premium" || t.is_premium === true) return true;
    if (t.category === "starter" || t.is_premium === false) return false;
    return (
      t.id.startsWith("premium-") ||
      t.id.includes("founder") ||
      t.id.includes("hormozi") ||
      t.id.includes("jasmin") ||
      t.id.includes("viral") ||
      t.id.includes("cyber") ||
      t.id.includes("creator") ||
      t.id.includes("luxury")
    );
  };

  const starterTemplates = templates.filter((t) => !isTemplatePremium(t));
  const premiumTemplates = templates.filter((t) => isTemplatePremium(t));

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Top Navbar */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-background/80 px-3 sm:px-6 py-2.5 sm:py-3.5 backdrop-blur-xl gap-2">
        <div className="flex items-center gap-2 sm:gap-4 min-w-0">
          <Link
            to="/"
            className="flex items-center gap-1.5 sm:gap-2 rounded-xl border border-border bg-card px-2.5 sm:px-3 py-1.5 text-xs font-semibold text-foreground transition-all hover:bg-accent active:scale-95 shrink-0"
            title="Back to Studio"
          >
            <ArrowLeft01Icon size={16} />
            <span className="hidden sm:inline">Back to Studio</span>
            <span className="sm:hidden">Studio</span>
          </Link>
          <div className="hidden xs:block h-4 w-px bg-border shrink-0" />
          <div className="flex items-center gap-2 min-w-0">
            <span className="grid h-7 w-7 sm:h-8 sm:w-8 place-items-center rounded-lg bg-gradient-to-tr from-indigo-500 to-pink-500 shadow-md shrink-0">
              <SecurityCheckIcon size={15} className="text-white" />
            </span>
            <div className="min-w-0">
              <h1 className="text-xs sm:text-sm font-bold leading-none tracking-tight truncate">
                Admin Center
              </h1>
              <p className="hidden sm:block mt-1 text-[10px] text-muted-foreground truncate">
                Post In Seconds Platform Manager
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          {/* User badge */}
          {user ? (
            <div className="flex items-center gap-1.5 sm:gap-2.5 rounded-full border border-border bg-card p-1 sm:pr-3 text-xs">
              <img
                src={user.avatar}
                alt=""
                className="h-7 w-7 sm:h-8 sm:w-8 rounded-full object-cover ring-1 ring-border shadow-sm shrink-0"
              />
              <span className="hidden md:inline font-semibold text-foreground truncate max-w-[120px]">
                {user.name}
              </span>
              <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[9px] font-bold uppercase text-primary">
                {user.role}
              </span>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => loginWithGoogle()}
              className="rounded-full bg-primary px-3 sm:px-3.5 py-1.5 text-xs font-semibold text-primary-foreground shadow-sm hover:bg-primary/90"
            >
              Sign in
            </button>
          )}
        </div>
      </header>

      {/* Main Container */}
      <main className="mx-auto max-w-7xl px-3 sm:px-6 py-4 sm:py-8">
        {/* Metric Cards */}
        <div className="grid grid-cols-2 gap-2.5 sm:gap-4 lg:grid-cols-4">
          <div className="rounded-2xl border border-border bg-card p-3 sm:p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-[11px] sm:text-xs font-medium text-muted-foreground">Templates</span>
              <span className="rounded-lg bg-indigo-500/10 p-1.5 sm:p-2 text-indigo-500">
                <Layout01Icon size={16} />
              </span>
            </div>
            <p className="mt-1.5 sm:mt-2 text-xl sm:text-2xl font-bold tracking-tight text-foreground">{templates.length}</p>
            <p className="mt-0.5 sm:mt-1 text-[10px] sm:text-[11px] text-muted-foreground truncate">
              {starterTemplates.length} Free · {premiumTemplates.length} Pro
            </p>
          </div>

          <div className="rounded-2xl border border-border bg-card p-3 sm:p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-[11px] sm:text-xs font-medium text-muted-foreground">Users</span>
              <span className="rounded-lg bg-emerald-500/10 p-1.5 sm:p-2 text-emerald-500">
                <UserGroupIcon size={16} />
              </span>
            </div>
            <p className="mt-1.5 sm:mt-2 text-xl sm:text-2xl font-bold tracking-tight text-foreground">{profiles.length}</p>
            <p className="mt-0.5 sm:mt-1 text-[10px] sm:text-[11px] text-muted-foreground truncate">
              {profiles.filter((p) => p.role === "admin").length} Admins
            </p>
          </div>

          <div className="rounded-2xl border border-border bg-card p-3 sm:p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-[11px] sm:text-xs font-medium text-muted-foreground">Saved Posts</span>
              <span className="rounded-lg bg-pink-500/10 p-1.5 sm:p-2 text-pink-500">
                <Folder01Icon size={16} />
              </span>
            </div>
            <p className="mt-1.5 sm:mt-2 text-xl sm:text-2xl font-bold tracking-tight text-foreground">{savedQuotes.length}</p>
            <p className="mt-0.5 sm:mt-1 text-[10px] sm:text-[11px] text-muted-foreground truncate">Cloud creations</p>
          </div>

          <div className="rounded-2xl border border-border bg-card p-3 sm:p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-[11px] sm:text-xs font-medium text-muted-foreground">Cloud Sync</span>
              <span className="rounded-lg bg-cyan-500/10 p-1.5 sm:p-2 text-cyan-500">
                <DatabaseIcon size={16} />
              </span>
            </div>
            <p className="mt-1.5 sm:mt-2 text-xs sm:text-sm font-bold tracking-tight text-emerald-600 dark:text-emerald-400">
              Active / Live
            </p>
            <p className="mt-0.5 sm:mt-1 text-[10px] sm:text-[11px] text-muted-foreground truncate">Protected RLS</p>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="mt-6 sm:mt-8 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-1 sm:pb-0">
          <div className="flex items-center gap-2 sm:gap-6 overflow-x-auto no-scrollbar scroll-smooth">
            <button
              type="button"
              onClick={() => setActiveTab("templates")}
              className={`flex shrink-0 items-center gap-1.5 sm:gap-2 border-b-2 px-1 py-2.5 sm:py-3 text-xs font-semibold transition-colors ${
                activeTab === "templates"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Layout01Icon size={15} />
              <span>Templates</span>
              <span className="rounded-full bg-secondary px-1.5 py-0.2 text-[9px] text-muted-foreground">
                {templates.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("users")}
              className={`flex shrink-0 items-center gap-1.5 sm:gap-2 border-b-2 px-1 py-2.5 sm:py-3 text-xs font-semibold transition-colors ${
                activeTab === "users"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <UserGroupIcon size={15} />
              <span>Users & Roles</span>
              <span className="rounded-full bg-secondary px-1.5 py-0.2 text-[9px] text-muted-foreground">
                {profiles.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("quotes")}
              className={`flex shrink-0 items-center gap-1.5 sm:gap-2 border-b-2 px-1 py-2.5 sm:py-3 text-xs font-semibold transition-colors ${
                activeTab === "quotes"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Folder01Icon size={15} />
              <span>Saved Designs</span>
              <span className="rounded-full bg-secondary px-1.5 py-0.2 text-[9px] text-muted-foreground">
                {savedQuotes.length}
              </span>
            </button>
          </div>

          {activeTab === "templates" ? (
            <button
              type="button"
              onClick={handleOpenCreate}
              className="flex items-center justify-center gap-1.5 rounded-xl bg-primary px-3 py-2 sm:py-1.5 text-xs font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary/90 active:scale-95 self-stretch sm:self-auto mb-1 sm:mb-2"
            >
              <Add01Icon size={15} />
              <span>Create Template</span>
            </button>
          ) : null}
        </div>

        {/* Tab Content */}
        <div className="mt-5 sm:mt-6">
          {/* 1. TEMPLATES TAB */}
          {activeTab === "templates" ? (
            <div className="space-y-6 sm:space-y-8">
              {/* Premium Templates Section */}
              <div>
                <div className="mb-3 sm:mb-4 flex items-center justify-between">
                  <div>
                    <h2 className="text-xs sm:text-sm font-bold text-foreground">
                      Premium Templates ({premiumTemplates.length})
                    </h2>
                    <p className="text-[11px] sm:text-xs text-muted-foreground">
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
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
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
                          <div className="flex items-center justify-between gap-1">
                            <h3 className="text-xs font-bold text-foreground truncate">{t.label}</h3>
                            <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-500 shrink-0">
                              Premium
                            </span>
                          </div>
                          <p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">
                            {t.description || "No description provided."}
                          </p>
                        </div>

                        <div className="mt-3.5 flex flex-wrap items-center justify-between gap-1.5 border-t border-border/60 pt-2.5">
                          <button
                            type="button"
                            onClick={() => handleOpenInEditor(t)}
                            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary px-2.5 py-1.5 text-[11px] font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary/90 active:scale-95"
                            title="Open & edit design in Studio Canvas"
                          >
                            <BrushIcon size={13} />
                            <span>Edit Design</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenEdit(t)}
                            className="flex items-center justify-center gap-1 rounded-lg border border-border bg-card px-2 py-1.5 text-[11px] font-semibold text-foreground transition-colors hover:bg-secondary"
                            title="Adjust template name, category & description"
                          >
                            <Edit02Icon size={12} />
                            <span>Edit</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteTemplate(t.id)}
                            className="rounded-lg border border-border p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                            title="Delete Template"
                          >
                            <Delete02Icon size={13} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Starter Templates Section */}
              <div>
                <div className="mb-3 sm:mb-4 flex items-center justify-between">
                  <div>
                    <h2 className="text-xs sm:text-sm font-bold text-foreground">
                      Free Starter Templates ({starterTemplates.length})
                    </h2>
                    <p className="text-[11px] sm:text-xs text-muted-foreground">
                      Default starter templates visible in the studio free tab
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
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
                        <div className="flex items-center justify-between gap-1">
                          <h3 className="text-xs font-bold text-foreground truncate">{t.label}</h3>
                          <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold text-muted-foreground shrink-0">
                            Starter
                          </span>
                        </div>
                        <p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">
                          {t.description || "No description provided."}
                        </p>
                      </div>

                      <div className="mt-3.5 flex flex-wrap items-center justify-between gap-1.5 border-t border-border/60 pt-2.5">
                        <button
                          type="button"
                          onClick={() => handleOpenInEditor(t)}
                          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary px-2.5 py-1.5 text-[11px] font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary/90 active:scale-95"
                          title="Open & edit design in Studio Canvas"
                        >
                          <BrushIcon size={13} />
                          <span>Edit Design</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleOpenEdit(t)}
                          className="flex items-center justify-center gap-1 rounded-lg border border-border bg-card px-2 py-1.5 text-[11px] font-semibold text-foreground transition-colors hover:bg-secondary"
                          title="Adjust template name, category & description"
                        >
                          <Edit02Icon size={12} />
                          <span>Edit</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteTemplate(t.id)}
                          className="rounded-lg border border-border p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                          title="Delete Template"
                        >
                          <Delete02Icon size={13} />
                        </button>
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
              <div className="border-b border-border px-4 sm:px-6 py-3.5 sm:py-4">
                <h2 className="text-xs sm:text-sm font-bold text-foreground">Registered Users ({profiles.length})</h2>
                <p className="text-[11px] sm:text-xs text-muted-foreground">Manage user accounts and admin privilege roles</p>
              </div>

              {profiles.length === 0 ? (
                <div className="p-8 text-center text-xs text-muted-foreground">
                  No users loaded.
                </div>
              ) : (
                <>
                  {/* Desktop Table View */}
                  <div className="hidden sm:block overflow-x-auto">
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
                                    className="h-8 w-8 rounded-full border border-border object-cover shrink-0"
                                  />
                                ) : (
                                  <div className="grid h-8 w-8 place-items-center rounded-full bg-primary/10 font-bold text-primary shrink-0">
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

                  {/* Mobile Card List View */}
                  <div className="sm:hidden divide-y divide-border">
                    {profiles.map((p) => (
                      <div key={p.id} className="p-3.5 space-y-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2.5 min-w-0">
                            {p.avatar_url ? (
                              <img
                                src={p.avatar_url}
                                alt=""
                                className="h-8 w-8 rounded-full border border-border object-cover shrink-0"
                              />
                            ) : (
                              <div className="grid h-8 w-8 place-items-center rounded-full bg-primary/10 font-bold text-primary shrink-0">
                                {p.full_name?.charAt(0) || "U"}
                              </div>
                            )}
                            <div className="min-w-0">
                              <p className="font-semibold text-foreground text-xs truncate">
                                {p.full_name || "Anonymous User"}
                              </p>
                              <p className="text-[11px] text-muted-foreground truncate">{p.email}</p>
                            </div>
                          </div>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[9px] font-bold shrink-0 ${
                              p.role === "admin"
                                ? "bg-purple-500/10 text-purple-500"
                                : "bg-secondary text-muted-foreground"
                            }`}
                          >
                            {p.role.toUpperCase()}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-1">
                          <span>Joined {new Date(p.created_at).toLocaleDateString()}</span>
                          <button
                            type="button"
                            onClick={() => handleToggleRole(p)}
                            className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                              p.role === "admin"
                                ? "border border-border text-foreground hover:bg-secondary"
                                : "bg-primary text-primary-foreground hover:bg-primary/90"
                            }`}
                          >
                            {p.role === "admin" ? "Demote" : "Promote to Admin"}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          ) : null}

          {/* 3. SAVED DESIGNS TAB */}
          {activeTab === "quotes" ? (
            <div className="space-y-3 sm:space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xs sm:text-sm font-bold text-foreground">
                    User Saved Designs ({savedQuotes.length})
                  </h2>
                  <p className="text-[11px] sm:text-xs text-muted-foreground">
                    Designs saved by platform users in their personal library
                  </p>
                </div>
              </div>

              {savedQuotes.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border py-12 text-center">
                  <Folder01Icon size={32} className="text-muted-foreground/40" />
                  <p className="mt-2 text-sm font-semibold text-foreground">No saved designs found</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
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
                        <h3 className="text-xs font-bold text-foreground truncate">{q.title}</h3>
                        <p className="mt-0.5 text-[10px] text-muted-foreground">
                          Created {new Date(q.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="mt-3 border-t border-border/60 pt-2 text-[10px] text-muted-foreground truncate">
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-3 sm:p-4 backdrop-blur-sm">
          <div className="flex max-h-[92vh] w-full max-w-lg flex-col rounded-2xl border border-border bg-background p-4 sm:p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-border pb-3 sm:pb-4">
              <h3 className="text-sm sm:text-base font-bold text-foreground truncate pr-2">
                {isNewTemplate ? "Create New Template" : `Edit: ${editingTemplate.label}`}
              </h3>
              <button
                type="button"
                onClick={() => setEditingTemplate(null)}
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground shrink-0"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3.5 sm:space-y-4 overflow-y-auto py-3.5 sm:py-4 text-xs">
              {/* Visual Preview */}
              <div className="flex flex-col items-center justify-center rounded-xl border border-border/70 bg-secondary/30 p-2.5 sm:p-3">
                <TemplatePreview
                  template={{
                    ...editingTemplate,
                    label: editLabel || "Template Preview",
                    description: editDesc,
                    thumbnailUrl: editThumbnailUrl.trim() || undefined,
                  }}
                  width={130}
                  showLabel={false}
                />
                {editThumbnailUrl ? (
                  <span className="mt-2 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[9px] font-bold text-emerald-600 dark:text-emerald-400">
                    ✓ Using Custom Thumbnail Cover
                  </span>
                ) : null}
              </div>

              <div>
                <label htmlFor="admin-edit-template-name" className="mb-1 block font-semibold text-foreground">Template Name</label>
                <input
                  type="text"
                  id="admin-edit-template-name"
                  name="templateName"
                  value={editLabel}
                  onChange={(e) => setEditLabel(e.target.value)}
                  className="w-full rounded-xl border border-border bg-card px-3 py-2 text-foreground focus:border-primary focus:outline-none"
                  placeholder="e.g. Minimalist Dark"
                />
              </div>

              <div>
                <div className="mb-1 flex items-center justify-between">
                  <label htmlFor="admin-edit-thumbnail-url" className="font-semibold text-foreground">
                    Custom Thumbnail / Cover Image (Optional)
                  </label>
                  {editThumbnailUrl ? (
                    <button
                      type="button"
                      onClick={() => setEditThumbnailUrl("")}
                      className="text-[10px] font-medium text-destructive hover:underline"
                    >
                      Remove Cover
                    </button>
                  ) : null}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    id="admin-edit-thumbnail-url"
                    name="templateThumbnailUrl"
                    value={editThumbnailUrl}
                    onChange={(e) => setEditThumbnailUrl(e.target.value)}
                    className="flex-1 rounded-xl border border-border bg-card px-3 py-2 text-foreground focus:border-primary focus:outline-none placeholder:text-muted-foreground/60 text-xs"
                    placeholder="Paste image URL (Unsplash, CDN, etc.)"
                  />
                  <label className="flex cursor-pointer items-center justify-center rounded-xl border border-border bg-secondary/60 px-3 py-2 text-[11px] font-semibold text-foreground transition-colors hover:bg-secondary shrink-0">
                    <span>{isUploadingThumb ? "Compressing..." : "Upload"}</span>
                    <input
                      type="file"
                      accept="image/*"
                      disabled={isUploadingThumb}
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          setIsUploadingThumb(true);
                          try {
                            const compressed = await compressImageFile(file, {
                              maxDimension: 600,
                              quality: 0.82,
                            });
                            setEditThumbnailUrl(compressed);
                            toast.success("Cover image ready!");
                          } catch (err) {
                            console.error("Failed to process image:", err);
                            toast.error("Failed to process image.");
                          } finally {
                            setIsUploadingThumb(false);
                          }
                        }
                      }}
                    />
                  </label>
                </div>
                <p className="mt-1 text-[10px] text-muted-foreground leading-relaxed">
                  Display a custom person or brand photo as the gallery thumbnail. When users import it, the canvas uses placeholder graphics to prevent copyright issues.
                </p>
              </div>

              <div>
                <label htmlFor="admin-edit-category-tier" className="mb-1 block font-semibold text-foreground">Category Tier</label>
                <select
                  id="admin-edit-category-tier"
                  name="categoryTier"
                  value={editCategory}
                  onChange={(e) => setEditCategory(e.target.value as any)}
                  className="w-full rounded-xl border border-border bg-card px-3 py-2 text-foreground focus:border-primary focus:outline-none"
                >
                  <option value="starter">Free Template</option>
                  <option value="premium">Premium Pro Template</option>
                </select>
              </div>

              <div>
                <label htmlFor="admin-edit-description" className="mb-1 block font-semibold text-foreground">Description</label>
                <input
                  type="text"
                  id="admin-edit-description"
                  name="templateDescription"
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  className="w-full rounded-xl border border-border bg-card px-3 py-2 text-foreground focus:border-primary focus:outline-none"
                  placeholder="e.g. Modern typography layout on dark gradient"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 sm:gap-3 border-t border-border pt-3 sm:pt-4">
              <button
                type="button"
                onClick={() => setEditingTemplate(null)}
                className="flex-1 sm:flex-none rounded-xl border border-border px-4 py-2 text-xs font-semibold text-foreground hover:bg-accent"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveTemplate}
                disabled={isSaving || isUploadingThumb}
                className="flex-1 sm:flex-none rounded-xl bg-primary px-5 py-2 text-xs font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-50"
              >
                {isSaving ? "Saving..." : "Save Template"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Delete Confirmation Modal */}
      {deleteConfirmId ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-5 shadow-2xl animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-destructive/10 text-destructive shadow-sm">
                <Delete02Icon size={20} />
              </span>
              <div>
                <h3 className="text-base font-bold text-foreground">Delete template?</h3>
                <p className="text-xs text-muted-foreground mt-0.5">This action cannot be undone.</p>
              </div>
            </div>

            <p className="mt-3 text-xs text-muted-foreground leading-relaxed">
              Are you sure you want to permanently delete{" "}
              <span className="font-semibold text-foreground">
                "{templates.find((t) => t.id === deleteConfirmId)?.label || "this template"}"
              </span>{" "}
              from the template catalog?
            </p>

            <div className="mt-5 flex items-center justify-end gap-2 border-t border-border pt-3">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setDeleteConfirmId(null)}
                className="rounded-xl border border-border px-3.5 py-2 text-xs font-semibold text-foreground hover:bg-secondary active:scale-95 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={async () => {
                  if (!deleteConfirmId) return;
                  setIsDeleting(true);
                  try {
                    const success = await deleteTemplate(deleteConfirmId);
                    await loadData();
                    if (success) {
                      toast.success("Template deleted successfully");
                      setDeleteConfirmId(null);
                    } else {
                      // deleteTemplate() now actually confirms the row was
                      // removed (see its own comment) instead of trusting a
                      // falsy `error`, so a false here is a real failure —
                      // most likely this account isn't recognized as admin
                      // by the live RLS check. Leave the confirm dialog open
                      // rather than lying that it worked.
                      toast.error("Delete didn't go through — you may not have admin rights on the server side");
                    }
                  } catch {
                    toast.error("Failed to delete template");
                  } finally {
                    setIsDeleting(false);
                  }
                }}
                className="flex items-center gap-1.5 rounded-xl bg-destructive px-4 py-2 text-xs font-semibold text-destructive-foreground shadow-md hover:bg-destructive/90 active:scale-95 disabled:opacity-50"
              >
                <Delete02Icon size={14} />
                <span>{isDeleting ? "Deleting..." : "Delete Template"}</span>
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
