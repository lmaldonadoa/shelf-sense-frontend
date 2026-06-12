"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Briefcase,
  Building2,
  ChevronDown,
  History,
  Home,
  LayoutGrid,
  Menu,
  Microscope,
  PanelTopOpen,
  Plus,
  Settings2,
  Sparkles,
  X,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { ocrApi } from "@/lib/ocrApi";
import { cn } from "@/lib/utils";
import { useAuth } from "@/components/auth/auth-provider";
import { roleMeetsMinimum, type UserRole } from "@/lib/auth/roles";

type NavLink = { label: string; href: string; description?: string; minimumRole?: UserRole };

type NavGroup = {
  label: string;
  icon: React.ReactNode;
  accent: string;
  links: NavLink[];
};

const ACCOUNT_STORAGE_KEY = "ocr_active_account_name";
const QUICK_FAVORITES_KEY = "ocr_quick_favorites";

function isPathActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function groupIsActive(pathname: string, links: NavLink[]): boolean {
  return links.some((link) => isPathActive(pathname, link.href));
}

export function AppShellNav() {
  const pathname = usePathname();
  const { enabled: authEnabled, session } = useAuth();
  const [account, setAccount] = useState("colgate_ecuador");
  const [quickOpen, setQuickOpen] = useState(false);
  const [quickPath, setQuickPath] = useState<string>("/jobs/new");
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [favorites, setFavorites] = useState<Array<{ label: string; href: string }>>([]);
  const shelfEnabled = String(process.env.NEXT_PUBLIC_ENABLE_SHELF_MODULE ?? "true").toLowerCase() === "true";

  const closeMenus = useCallback(() => {
    setOpenGroup(null);
    setMobileOpen(false);
  }, []);

  useEffect(() => {
    const saved = window.localStorage.getItem(ACCOUNT_STORAGE_KEY);
    if (saved?.trim()) setAccount(saved.trim());
  }, []);

  useEffect(() => {
    window.localStorage.setItem(ACCOUNT_STORAGE_KEY, account);
  }, [account]);

  useEffect(() => {
    const raw = window.localStorage.getItem(QUICK_FAVORITES_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as Array<{ label: string; href: string }>;
      if (Array.isArray(parsed)) setFavorites(parsed.slice(0, 8));
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(QUICK_FAVORITES_KEY, JSON.stringify(favorites));
  }, [favorites]);

  useEffect(() => {
    closeMenus();
  }, [pathname, closeMenus]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") closeMenus();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closeMenus]);

  const accountPath = encodeURIComponent(account);
  const currentRole: UserRole | null = authEnabled ? session?.role ?? null : "admin";

  const canSeeLink = useCallback(
    (link: NavLink): boolean => {
      if (!authEnabled) return true;
      if (!currentRole) return false;
      return roleMeetsMinimum(currentRole, link.minimumRole ?? "viewer");
    },
    [authEnabled, currentRole],
  );

  const primaryLinks = useMemo(
    () =>
      [
        {
          label: "Home",
          href: "/",
          icon: Home,
          isActive: pathname === "/",
          minimumRole: "viewer" as const,
        },
        {
          label: "Nuevo Job",
          href: "/jobs/new",
          icon: Plus,
          isActive: pathname.startsWith("/jobs/new"),
          highlight: true,
          minimumRole: "editor" as const,
        },
        {
          label: "Historial",
          href: `/accounts/${accountPath}/jobs`,
          icon: History,
          isActive:
            pathname.includes("/jobs") &&
            !pathname.includes("/jobs/maintenance") &&
            !pathname.startsWith("/jobs/new"),
          minimumRole: "viewer" as const,
        },
        {
          label: "Analytics",
          href: "/analytics",
          icon: BarChart3,
          isActive: pathname.startsWith("/analytics"),
          minimumRole: "viewer" as const,
        },
      ].filter((link) => canSeeLink(link)),
    [accountPath, canSeeLink, pathname],
  );

  const groups = useMemo<NavGroup[]>(
    () =>
      [
        {
          label: "Ejecución",
          icon: <Briefcase className="h-4 w-4" />,
          accent: "cyan",
          links: [
            { label: "Crear Job", href: "/jobs/new", description: "Nuevo procesamiento OCR", minimumRole: "editor" },
            { label: "Historial", href: `/accounts/${accountPath}/jobs`, description: "Jobs de la cuenta activa", minimumRole: "viewer" },
            { label: "Mantenimiento Jobs", href: `/accounts/${accountPath}/jobs/maintenance`, description: "Limpieza y reparación", minimumRole: "admin" },
            ...(shelfEnabled
              ? [{ label: "Shelf Recognition", href: `/accounts/${accountPath}/shelf`, description: "Reconocimiento de góndola", minimumRole: "editor" as const }]
              : []),
            { label: "Preview Realtime", href: `/accounts/${accountPath}/preview`, description: "Vista en vivo", minimumRole: "viewer" },
            { label: "Ops", href: "/ops", description: "Consola operativa", minimumRole: "admin" },
          ],
        },
        {
          label: "Semántica",
          icon: <Microscope className="h-4 w-4" />,
          accent: "violet",
          links: [
            { label: "Training IA", href: `/accounts/${accountPath}/training`, description: "Curaduría y reglas", minimumRole: "editor" },
            { label: "Config OCR", href: `/accounts/${accountPath}/config`, description: "Aliases, cadenas y conocimiento", minimumRole: "editor" },
          ],
        },
        {
          label: "Analítica",
          icon: <BarChart3 className="h-4 w-4" />,
          accent: "lime",
          links: [
            { label: "Analytics", href: "/analytics", description: "Métricas globales", minimumRole: "viewer" },
            { label: "Calidad IA", href: `/accounts/${accountPath}/quality`, description: "Evaluación de precisión", minimumRole: "viewer" },
            { label: "Masterdata Catalog", href: `/accounts/${accountPath}/masterdata`, description: "Catálogo maestro", minimumRole: "editor" },
          ],
        },
        {
          label: "Sistema",
          icon: <Settings2 className="h-4 w-4" />,
          accent: "amber",
          links: [
            { label: "Config global", href: "/configs", description: "Parámetros del entorno", minimumRole: "admin" },
            { label: "Modelos IA", href: `/accounts/${accountPath}/settings/llm`, description: "LLM y visión", minimumRole: "admin" },
            { label: "API Keys", href: `/accounts/${accountPath}/api-keys`, description: "Credenciales de acceso", minimumRole: "admin" },
            { label: "Inbound WhatsApp", href: `/accounts/${accountPath}/inbound-whatsapp`, description: "Entrada por mensajería", minimumRole: "admin" },
          ],
        },
      ]
        .map((group) => ({
          ...group,
          links: group.links.filter((link) => canSeeLink(link)),
        }))
        .filter((group) => group.links.length > 0),
    [accountPath, canSeeLink, shelfEnabled],
  );

  const quickItems = useMemo(
    () =>
      [
        { label: "Crear Job", href: "/jobs/new", minimumRole: "editor" as const },
        { label: "Mantenimiento Jobs", href: `/accounts/${accountPath}/jobs/maintenance`, minimumRole: "admin" as const },
        { label: "Analytics", href: "/analytics", minimumRole: "viewer" as const },
        { label: "Calidad IA", href: `/accounts/${accountPath}/quality`, minimumRole: "viewer" as const },
        { label: "Training IA", href: `/accounts/${accountPath}/training`, minimumRole: "editor" as const },
        ...(shelfEnabled ? [{ label: "Shelf Recognition", href: `/accounts/${accountPath}/shelf`, minimumRole: "editor" as const }] : []),
        { label: "Config OCR", href: `/accounts/${accountPath}/config`, minimumRole: "editor" as const },
        { label: "Modelos IA", href: `/accounts/${accountPath}/settings/llm`, minimumRole: "admin" as const },
        { label: "API Keys", href: `/accounts/${accountPath}/api-keys`, minimumRole: "admin" as const },
        { label: "Inbound WhatsApp", href: `/accounts/${accountPath}/inbound-whatsapp`, minimumRole: "admin" as const },
        { label: "Masterdata Catalog", href: `/accounts/${accountPath}/masterdata`, minimumRole: "editor" as const },
        { label: "Preview Realtime", href: `/accounts/${accountPath}/preview`, minimumRole: "viewer" as const },
      ].filter((item) => canSeeLink(item)),
    [accountPath, canSeeLink, shelfEnabled],
  );

  function addFavorite(item: { label: string; href: string }) {
    setFavorites((prev) => {
      if (prev.some((x) => x.href === item.href)) return prev;
      return [...prev, item].slice(-8);
    });
  }

  const visibleFavorites = useMemo(
    () => favorites.filter((item) => canSeeLink(item)),
    [canSeeLink, favorites],
  );

  const recentJobsQuery = useQuery({
    queryKey: ["quick-panel-recent-jobs", account],
    queryFn: () => ocrApi.listRecentJobs({ accountName: account, limit: 12 }),
    enabled: quickOpen && (!authEnabled || !!currentRole),
  });

  const groupAccentClasses: Record<string, { button: string; menu: string; item: string }> = {
    cyan: {
      button: "hover:border-cyan-400/30 hover:bg-cyan-500/10 hover:text-cyan-100 data-[open=true]:border-cyan-400/40 data-[open=true]:bg-cyan-500/15 data-[open=true]:text-cyan-100",
      menu: "border-cyan-400/20",
      item: "data-[active=true]:bg-cyan-500/20 data-[active=true]:text-cyan-100",
    },
    violet: {
      button: "hover:border-violet-400/30 hover:bg-violet-500/10 hover:text-violet-100 data-[open=true]:border-violet-400/40 data-[open=true]:bg-violet-500/15 data-[open=true]:text-violet-100",
      menu: "border-violet-400/20",
      item: "data-[active=true]:bg-violet-500/20 data-[active=true]:text-violet-100",
    },
    lime: {
      button: "hover:border-lime-400/30 hover:bg-lime-500/10 hover:text-lime-100 data-[open=true]:border-lime-400/40 data-[open=true]:bg-lime-500/15 data-[open=true]:text-lime-100",
      menu: "border-lime-400/20",
      item: "data-[active=true]:bg-lime-500/20 data-[active=true]:text-lime-100",
    },
    amber: {
      button: "hover:border-amber-400/30 hover:bg-amber-500/10 hover:text-amber-100 data-[open=true]:border-amber-400/40 data-[open=true]:bg-amber-500/15 data-[open=true]:text-amber-100",
      menu: "border-amber-400/20",
      item: "data-[active=true]:bg-amber-500/20 data-[active=true]:text-amber-100",
    },
  };

  function renderGroupDropdown(group: NavGroup, compact = false) {
    const open = openGroup === group.label;
    const active = groupIsActive(pathname, group.links);
    const accent = groupAccentClasses[group.accent];

    return (
      <div key={group.label} className="relative">
        <button
          type="button"
          data-open={open}
          onClick={() => setOpenGroup((prev) => (prev === group.label ? null : group.label))}
          className={cn(
            "flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-slate-200 transition-all duration-200",
            accent.button,
            active && !open && "border-white/20 bg-white/[0.06] text-white",
            compact && "w-full justify-between",
          )}
        >
          <span className="flex items-center gap-2">
            {group.icon}
            {group.label}
          </span>
          <ChevronDown className={cn("h-3.5 w-3.5 opacity-60 transition-transform duration-200", open && "rotate-180")} />
        </button>
        {open ? (
          <div
            className={cn(
              "absolute z-50 min-w-64 overflow-hidden rounded-xl border bg-slate-950/95 shadow-2xl backdrop-blur-xl",
              accent.menu,
              compact ? "relative left-0 top-2 w-full" : "left-0 top-[calc(100%+8px)]",
            )}
          >
            <div className="border-b border-white/8 px-3 py-2">
              <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500">{group.label}</p>
            </div>
            <div className="p-1.5">
              {group.links.map((link) => {
                const linkActive = isPathActive(pathname, link.href);
                return (
                  <Link
                    key={`${group.label}-${link.label}`}
                    href={link.href}
                    onClick={closeMenus}
                    data-active={linkActive}
                    className={cn(
                      "block rounded-lg px-3 py-2 transition-colors duration-150 hover:bg-white/8",
                      accent.item,
                    )}
                  >
                    <p className="text-sm font-medium text-slate-100">{link.label}</p>
                    {link.description ? <p className="mt-0.5 text-xs text-slate-500">{link.description}</p> : null}
                  </Link>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  const quickActionButtons = [
    { label: "Config OCR", href: `/accounts/${accountPath}/config`, minimumRole: "editor" as const },
    { label: "Mantenimiento Jobs", href: `/accounts/${accountPath}/jobs/maintenance`, minimumRole: "admin" as const },
    { label: "Training IA", href: `/accounts/${accountPath}/training`, minimumRole: "editor" as const },
    ...(shelfEnabled ? [{ label: "Shelf Recognition", href: `/accounts/${accountPath}/shelf`, minimumRole: "editor" as const }] : []),
    { label: "Modelos IA", href: `/accounts/${accountPath}/settings/llm`, minimumRole: "admin" as const },
    { label: "Calidad IA", href: `/accounts/${accountPath}/quality`, minimumRole: "viewer" as const },
    { label: "Masterdata Catalog", href: `/accounts/${accountPath}/masterdata`, minimumRole: "editor" as const },
    { label: "Preview Realtime", href: `/accounts/${accountPath}/preview`, minimumRole: "viewer" as const },
    { label: "API Keys", href: `/accounts/${accountPath}/api-keys`, minimumRole: "admin" as const },
    { label: "Inbound WhatsApp", href: `/accounts/${accountPath}/inbound-whatsapp`, minimumRole: "admin" as const },
    { label: "Analytics", href: "/analytics", minimumRole: "viewer" as const },
  ].filter((item) => canSeeLink(item));

  return (
    <>
      <nav className="flex w-full flex-col gap-3 xl:max-w-4xl">
        <div className="flex flex-wrap items-center justify-end gap-2">
          <div className="hidden items-center gap-1 rounded-xl border border-white/10 bg-black/25 p-1 lg:flex">
            {primaryLinks.map((link) => {
              const Icon = link.icon;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    "relative flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200",
                    link.isActive
                      ? link.highlight
                        ? "bg-cyan-500/25 text-cyan-50 shadow-[0_0_20px_rgba(34,211,238,0.15)]"
                        : "bg-white/10 text-white"
                      : link.highlight
                        ? "text-cyan-200/90 hover:bg-cyan-500/15 hover:text-cyan-50"
                        : "text-slate-300 hover:bg-white/6 hover:text-white",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {link.label}
                </Link>
              );
            })}
          </div>

          <div className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-black/25 p-1">
            <div className="hidden items-center gap-2 rounded-lg border border-white/8 bg-white/[0.03] px-2.5 py-1.5 md:flex">
              <Building2 className="h-3.5 w-3.5 shrink-0 text-slate-500" />
              <Input
                value={account}
                onChange={(e) => setAccount(e.target.value)}
                placeholder="colgate_ecuador"
                aria-label="Cuenta activa"
                className="h-7 w-[9.5rem] border-0 bg-transparent px-0 text-sm text-slate-100 shadow-none focus-visible:ring-0"
              />
            </div>

            <Button
              variant="ghost"
              size="sm"
              className="hidden border border-amber-400/25 bg-amber-500/10 text-amber-100 hover:bg-amber-500/20 md:inline-flex"
              onClick={() => setQuickOpen(true)}
              disabled={authEnabled && !currentRole}
            >
              <PanelTopOpen className="mr-1.5 h-4 w-4" />
              Panel rápido
            </Button>

            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 text-slate-300 hover:bg-white/8 hover:text-white lg:hidden"
              onClick={() => setMobileOpen((prev) => !prev)}
              aria-label={mobileOpen ? "Cerrar menú" : "Abrir menú"}
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
          </div>
        </div>

        <div className="hidden flex-wrap items-center gap-2 lg:flex">
          {groups.map((group) => renderGroupDropdown(group))}
        </div>

        {mobileOpen ? (
          <div className="space-y-3 rounded-xl border border-white/10 bg-black/35 p-3 backdrop-blur-xl lg:hidden">
            <div className="flex items-center gap-2 rounded-lg border border-white/8 bg-white/[0.03] px-3 py-2">
              <Building2 className="h-4 w-4 shrink-0 text-slate-500" />
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">Cuenta activa</p>
                <Input
                  value={account}
                  onChange={(e) => setAccount(e.target.value)}
                  placeholder="colgate_ecuador"
                  className="mt-0.5 h-8 border-white/10 bg-black/20"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {primaryLinks.map((link) => {
                const Icon = link.icon;
                return (
                  <Link
                    key={`mobile-${link.href}`}
                    href={link.href}
                    onClick={closeMenus}
                    className={cn(
                      "flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors",
                      link.isActive
                        ? "border-cyan-400/30 bg-cyan-500/15 text-cyan-50"
                        : "border-white/10 bg-white/[0.03] text-slate-200 hover:bg-white/8",
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {link.label}
                  </Link>
                );
              })}
            </div>

            <Button
              variant="outline"
              className="w-full border-amber-400/30 bg-amber-500/10 text-amber-100 hover:bg-amber-500/20"
              onClick={() => {
                setQuickOpen(true);
                setMobileOpen(false);
              }}
              disabled={authEnabled && !currentRole}
            >
              <PanelTopOpen className="mr-2 h-4 w-4" />
              Panel rápido
            </Button>

            <div className="space-y-2 border-t border-white/8 pt-3">
              {groups.map((group) => renderGroupDropdown(group, true))}
            </div>
          </div>
        ) : null}
      </nav>

      {quickOpen ? (
        <div className="fixed inset-0 z-50 bg-black/75 p-2 backdrop-blur-sm sm:p-4">
          <div className="mx-auto grid h-[calc(100vh-1rem)] max-h-[920px] w-full max-w-7xl grid-rows-[auto_1fr] overflow-hidden rounded-2xl border border-white/10 bg-slate-950 shadow-2xl sm:h-[calc(100vh-2rem)]">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-500/20 text-cyan-200">
                  <Sparkles className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">Panel rápido</p>
                  <p className="text-xs text-slate-500">Navegación y jobs recientes</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {quickItems.map((item) => (
                  <div key={`quick-${item.href}`} className="flex items-center gap-0.5">
                    <Button size="sm" variant="outline" className="h-8 border-white/15" onClick={() => setQuickPath(item.href)}>
                      {item.label}
                    </Button>
                    <Button size="sm" variant="ghost" className="h-8 w-8 px-0" onClick={() => addFavorite(item)} title="Agregar a favoritos">
                      +
                    </Button>
                  </div>
                ))}
              </div>
              <Button size="sm" variant="ghost" onClick={() => setQuickOpen(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="grid min-h-0 gap-2 p-2 sm:grid-cols-[280px_1fr] sm:p-3">
              <div className="min-h-0 overflow-auto rounded-xl border border-white/10 bg-black/25 p-2">
                <p className="mb-2 px-2 text-xs font-medium uppercase tracking-wider text-slate-500">Jobs recientes</p>
                <div className="space-y-1">
                  {(recentJobsQuery.data ?? []).slice(0, 10).map((job) => (
                    <button
                      key={`quick-job-${job.id}`}
                      type="button"
                      onClick={() => setQuickPath(`/jobs/${job.id}`)}
                      className="w-full rounded-lg border border-white/8 bg-white/[0.03] px-2.5 py-2 text-left transition-colors hover:bg-white/8"
                    >
                      <p className="truncate font-mono text-[11px] text-slate-100">{job.id}</p>
                      <p className="mt-1 text-[11px] text-slate-500">{job.status}</p>
                    </button>
                  ))}
                  {!recentJobsQuery.data?.length ? <p className="px-2 text-xs text-slate-500">Sin jobs recientes.</p> : null}
                </div>
                <div className="mt-3 border-t border-white/8 pt-2">
                  <p className="mb-2 px-2 text-xs font-medium uppercase tracking-wider text-slate-500">Acciones</p>
                  <div className="flex flex-col gap-1">
                    {quickActionButtons.map((item) => (
                      <button
                        key={`quick-action-${item.href}`}
                        type="button"
                        onClick={() => setQuickPath(item.href)}
                        className="rounded-lg px-2.5 py-1.5 text-left text-sm text-slate-200 transition-colors hover:bg-white/8"
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="mt-3 border-t border-white/8 pt-2">
                  <p className="mb-2 px-2 text-xs font-medium uppercase tracking-wider text-slate-500">Favoritos</p>
                  <div className="flex flex-col gap-1">
                    {visibleFavorites.map((item) => (
                      <button key={`fav-${item.href}`} type="button" onClick={() => setQuickPath(item.href)} className="rounded-lg px-2.5 py-1.5 text-left text-sm text-slate-200 transition-colors hover:bg-white/8">
                        {item.label}
                      </button>
                    ))}
                    {!visibleFavorites.length ? <p className="px-2 text-xs text-slate-500">Sin favoritos aún.</p> : null}
                  </div>
                </div>
              </div>
              <iframe title="quick-panel" src={quickPath} className="h-full min-h-0 w-full rounded-xl border border-white/10 bg-white" />
            </div>
          </div>
        </div>
      ) : null}

      {openGroup || mobileOpen ? (
        <button
          type="button"
          aria-label="Cerrar menú"
          className="fixed inset-0 z-40 cursor-default bg-transparent"
          onClick={closeMenus}
        />
      ) : null}
    </>
  );
}

export function AppShellBrand() {
  return (
    <Link href="/" className="group flex min-w-0 items-center gap-3 transition-opacity hover:opacity-95">
      <div className="relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-cyan-400/25 bg-gradient-to-br from-cyan-500/25 via-slate-900 to-emerald-500/20 shadow-[0_0_24px_rgba(34,211,238,0.12)]">
        <LayoutGrid className="h-5 w-5 text-cyan-100 transition-transform duration-300 group-hover:scale-110" />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.18),transparent_55%)]" />
      </div>
      <div className="min-w-0">
        <p className="truncate font-heading text-lg font-semibold tracking-tight text-white">
          Xplorab <span className="text-cyan-200">Shelfsense</span>
        </p>
        <p className="truncate text-sm text-slate-400">
          Inteligencia de anaquel · OCR · Operaciones
        </p>
      </div>
    </Link>
  );
}
