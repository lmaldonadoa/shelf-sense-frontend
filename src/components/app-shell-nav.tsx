"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { BarChart3, Briefcase, Microscope, PanelTopOpen, Settings2, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { ocrApi } from "@/lib/ocrApi";

type NavGroup = {
  label: string;
  icon: React.ReactNode;
  links: Array<{ label: string; href: string }>;
};

const ACCOUNT_STORAGE_KEY = "ocr_active_account_name";
const QUICK_FAVORITES_KEY = "ocr_quick_favorites";

export function AppShellNav() {
  const pathname = usePathname();
  const [account, setAccount] = useState("colgate_ecuador");
  const [quickOpen, setQuickOpen] = useState(false);
  const [quickPath, setQuickPath] = useState<string>("/jobs/new");
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<Array<{ label: string; href: string }>>([]);
  const shelfEnabled = String(process.env.NEXT_PUBLIC_ENABLE_SHELF_MODULE ?? "true").toLowerCase() === "true";

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

  const groups = useMemo<NavGroup[]>(
    () => [
      {
        label: "Ejecucion",
        icon: <Briefcase className="h-4 w-4" />,
        links: [
          { label: "Crear Job", href: "/jobs/new" },
          { label: "Historial", href: `/accounts/${encodeURIComponent(account)}/jobs` },
          { label: "Mantenimiento Jobs", href: `/accounts/${encodeURIComponent(account)}/jobs/maintenance` },
          ...(shelfEnabled ? [{ label: "Shelf Recognition", href: `/accounts/${encodeURIComponent(account)}/shelf` }] : []),
          { label: "Preview Realtime", href: `/accounts/${encodeURIComponent(account)}/preview` },
          { label: "Ops", href: "/ops" },
        ],
      },
      {
        label: "Semantica",
        icon: <Microscope className="h-4 w-4" />,
        links: [
          { label: "Training IA", href: `/accounts/${encodeURIComponent(account)}/training` },
          { label: "Config OCR", href: `/accounts/${encodeURIComponent(account)}/config` },
        ],
      },
      {
        label: "Analitica",
        icon: <BarChart3 className="h-4 w-4" />,
        links: [
          { label: "Analytics", href: "/analytics" },
          { label: "Calidad IA", href: `/accounts/${encodeURIComponent(account)}/quality` },
          { label: "Masterdata Catalog", href: `/accounts/${encodeURIComponent(account)}/masterdata` },
        ],
      },
      {
        label: "Sistema",
        icon: <Settings2 className="h-4 w-4" />,
        links: [
          { label: "Config global", href: "/configs" },
          { label: "Modelos IA", href: `/accounts/${encodeURIComponent(account)}/settings/llm` },
          { label: "API Keys", href: `/accounts/${encodeURIComponent(account)}/api-keys` },
          { label: "Inbound WhatsApp", href: `/accounts/${encodeURIComponent(account)}/inbound-whatsapp` },
        ],
      },
    ],
    [account, shelfEnabled],
  );

  const quickItems = [
    { label: "Crear Job", href: "/jobs/new" },
    { label: "Mantenimiento Jobs", href: `/accounts/${encodeURIComponent(account)}/jobs/maintenance` },
    { label: "Analytics", href: "/analytics" },
    { label: "Calidad IA", href: `/accounts/${encodeURIComponent(account)}/quality` },
    { label: "Training IA", href: `/accounts/${encodeURIComponent(account)}/training` },
    ...(shelfEnabled ? [{ label: "Shelf Recognition", href: `/accounts/${encodeURIComponent(account)}/shelf` }] : []),
    { label: "Config OCR", href: `/accounts/${encodeURIComponent(account)}/config` },
    { label: "Modelos IA", href: `/accounts/${encodeURIComponent(account)}/settings/llm` },
    { label: "API Keys", href: `/accounts/${encodeURIComponent(account)}/api-keys` },
    { label: "Inbound WhatsApp", href: `/accounts/${encodeURIComponent(account)}/inbound-whatsapp` },
    { label: "Masterdata Catalog", href: `/accounts/${encodeURIComponent(account)}/masterdata` },
    { label: "Preview Realtime", href: `/accounts/${encodeURIComponent(account)}/preview` },
  ];

  function addFavorite(item: { label: string; href: string }) {
    setFavorites((prev) => {
      if (prev.some((x) => x.href === item.href)) return prev;
      return [...prev, item].slice(-8);
    });
  }

  const recentJobsQuery = useQuery({
    queryKey: ["quick-panel-recent-jobs", account],
    queryFn: () => ocrApi.listRecentJobs({ accountName: account, limit: 12 }),
    enabled: quickOpen,
  });

  return (
    <div className="flex w-full flex-col gap-3 xl:w-auto">
      <div className="flex flex-wrap items-center gap-2">
        <Link href="/" className="rounded-md border border-white/15 bg-white/5 px-3 py-2 text-sm text-slate-100 hover:bg-white/10">Home</Link>
        <Link href="/jobs/new" className="rounded-md border border-cyan-300/35 bg-cyan-500/20 px-3 py-2 text-sm font-semibold text-cyan-100 hover:bg-cyan-500/30">Nuevo Job</Link>
        <Link href={`/accounts/${encodeURIComponent(account)}/jobs`} className="rounded-md border border-white/15 bg-white/5 px-3 py-2 text-sm text-slate-100 hover:bg-white/10">Historial</Link>
        <Link href="/analytics" className="rounded-md border border-lime-300/35 bg-lime-500/20 px-3 py-2 text-sm font-medium text-lime-100 hover:bg-lime-500/30">Analytics</Link>
        <Button
          variant="outline"
          className="border-amber-300/35 bg-amber-500/20 text-amber-100 hover:bg-amber-500/30"
          onClick={() => setQuickOpen(true)}
        >
          <PanelTopOpen className="mr-2 h-4 w-4" />
          Panel rapido
        </Button>
      </div>

      <div className="grid gap-2 xl:grid-cols-[1fr_auto] xl:items-center">
        <div className="flex items-center gap-2 rounded-md border border-white/15 bg-white/5 px-3 py-2">
          <span className="text-xs uppercase tracking-wide text-slate-400">Cuenta activa</span>
          <Input
            value={account}
            onChange={(e) => setAccount(e.target.value)}
            placeholder="colgate_ecuador"
            className="h-8 border-white/15 bg-black/20"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          {groups.map((group) => (
            <div key={group.label} className="relative">
              <button
                type="button"
                onClick={() => setOpenGroup((prev) => (prev === group.label ? null : group.label))}
                className="flex items-center gap-2 rounded-md border border-white/15 bg-white/5 px-3 py-2 text-sm text-slate-100 transition hover:bg-white/10"
              >
                {group.icon}
                {group.label}
              </button>
              {openGroup === group.label ? (
                <div className="absolute left-0 top-[calc(100%+6px)] z-40 min-w-56 rounded-lg border border-white/10 bg-slate-950/95 p-2 shadow-2xl backdrop-blur-xl">
                  {group.links.map((link) => {
                    const active = pathname.startsWith(link.href);
                    return (
                      <Link
                        key={`${group.label}-${link.label}`}
                        href={link.href}
                        onClick={() => setOpenGroup(null)}
                        className={`block rounded px-2 py-1.5 text-sm transition ${
                          active ? "bg-cyan-500/25 text-cyan-100" : "text-slate-200 hover:bg-white/10"
                        }`}
                      >
                        {link.label}
                      </Link>
                    );
                  })}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </div>

      {quickOpen ? (
        <div className="fixed inset-0 z-50 bg-black/70 p-2 sm:p-4">
          <div className="mx-auto grid h-[calc(100vh-1rem)] max-h-[920px] w-full max-w-7xl grid-rows-[auto_1fr] rounded-xl border border-white/10 bg-slate-950 shadow-2xl sm:h-[calc(100vh-2rem)]">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-4 py-3">
              <p className="text-sm font-semibold text-white">Panel rapido</p>
                <div className="flex flex-wrap gap-2">
                  {quickItems.map((item) => (
                    <div key={`quick-${item.href}`} className="flex items-center gap-1">
                      <Button size="sm" variant="outline" onClick={() => setQuickPath(item.href)}>
                        {item.label}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => addFavorite(item)} title="Agregar a favoritos">+</Button>
                    </div>
                  ))}
                </div>
              <Button size="sm" variant="ghost" onClick={() => setQuickOpen(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="grid min-h-0 gap-2 p-2 sm:grid-cols-[280px_1fr] sm:p-3">
              <div className="min-h-0 overflow-auto rounded-md border border-white/10 bg-black/20 p-2">
                <p className="mb-2 px-2 text-xs uppercase tracking-wide text-slate-400">Jobs recientes</p>
                <div className="space-y-1">
                  {(recentJobsQuery.data ?? []).slice(0, 10).map((job) => (
                    <button
                      key={`quick-job-${job.id}`}
                      type="button"
                      onClick={() => setQuickPath(`/jobs/${job.id}`)}
                      className="w-full rounded-md border border-white/10 bg-white/5 px-2 py-2 text-left hover:bg-white/10"
                    >
                      <p className="truncate font-mono text-[11px] text-slate-100">{job.id}</p>
                      <p className="mt-1 text-[11px] text-slate-400">{job.status}</p>
                    </button>
                  ))}
                  {!recentJobsQuery.data?.length ? <p className="px-2 text-xs text-slate-400">Sin jobs recientes.</p> : null}
                </div>
                <div className="mt-3 border-t border-white/10 pt-2">
                  <p className="mb-2 px-2 text-xs uppercase tracking-wide text-slate-400">Acciones</p>
                  <div className="flex flex-col gap-1">
                    <button type="button" onClick={() => setQuickPath(`/accounts/${encodeURIComponent(account)}/config`)} className="rounded-md px-2 py-1.5 text-left text-sm text-slate-200 hover:bg-white/10">Config OCR</button>
                    <button type="button" onClick={() => setQuickPath(`/accounts/${encodeURIComponent(account)}/jobs/maintenance`)} className="rounded-md px-2 py-1.5 text-left text-sm text-slate-200 hover:bg-white/10">Mantenimiento Jobs</button>
                    <button type="button" onClick={() => setQuickPath(`/accounts/${encodeURIComponent(account)}/training`)} className="rounded-md px-2 py-1.5 text-left text-sm text-slate-200 hover:bg-white/10">Training IA</button>
                    {shelfEnabled ? <button type="button" onClick={() => setQuickPath(`/accounts/${encodeURIComponent(account)}/shelf`)} className="rounded-md px-2 py-1.5 text-left text-sm text-slate-200 hover:bg-white/10">Shelf Recognition</button> : null}
                    <button type="button" onClick={() => setQuickPath(`/accounts/${encodeURIComponent(account)}/settings/llm`)} className="rounded-md px-2 py-1.5 text-left text-sm text-slate-200 hover:bg-white/10">Modelos IA</button>
                    <button type="button" onClick={() => setQuickPath(`/accounts/${encodeURIComponent(account)}/quality`)} className="rounded-md px-2 py-1.5 text-left text-sm text-slate-200 hover:bg-white/10">Calidad IA</button>
                    <button type="button" onClick={() => setQuickPath(`/accounts/${encodeURIComponent(account)}/masterdata`)} className="rounded-md px-2 py-1.5 text-left text-sm text-slate-200 hover:bg-white/10">Masterdata Catalog</button>
                    <button type="button" onClick={() => setQuickPath(`/accounts/${encodeURIComponent(account)}/preview`)} className="rounded-md px-2 py-1.5 text-left text-sm text-slate-200 hover:bg-white/10">Preview Realtime</button>
                    <button type="button" onClick={() => setQuickPath(`/accounts/${encodeURIComponent(account)}/api-keys`)} className="rounded-md px-2 py-1.5 text-left text-sm text-slate-200 hover:bg-white/10">API Keys</button>
                    <button type="button" onClick={() => setQuickPath(`/accounts/${encodeURIComponent(account)}/inbound-whatsapp`)} className="rounded-md px-2 py-1.5 text-left text-sm text-slate-200 hover:bg-white/10">Inbound WhatsApp</button>
                    <button type="button" onClick={() => setQuickPath("/analytics")} className="rounded-md px-2 py-1.5 text-left text-sm text-slate-200 hover:bg-white/10">Analytics</button>
                  </div>
                </div>
                <div className="mt-3 border-t border-white/10 pt-2">
                  <p className="mb-2 px-2 text-xs uppercase tracking-wide text-slate-400">Favoritos</p>
                  <div className="flex flex-col gap-1">
                    {favorites.map((item) => (
                      <button key={`fav-${item.href}`} type="button" onClick={() => setQuickPath(item.href)} className="rounded-md px-2 py-1.5 text-left text-sm text-slate-200 hover:bg-white/10">
                        {item.label}
                      </button>
                    ))}
                    {!favorites.length ? <p className="px-2 text-xs text-slate-400">Sin favoritos aun.</p> : null}
                  </div>
                </div>
              </div>
              <iframe title="quick-panel" src={quickPath} className="h-full min-h-0 w-full rounded-md border border-white/10 bg-white" />
            </div>
          </div>
        </div>
      ) : null}

      {openGroup ? (
        <button
          type="button"
          aria-label="Cerrar menu"
          className="fixed inset-0 z-30 cursor-default bg-transparent"
          onClick={() => setOpenGroup(null)}
        />
      ) : null}
    </div>
  );
}


