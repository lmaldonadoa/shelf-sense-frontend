"use client";

import { ReactNode, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Download, ExternalLink, Loader2, ScrollText, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

function tryFormatJson(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return null;
  try {
    return JSON.stringify(JSON.parse(trimmed), null, 2);
  } catch {
    return null;
  }
}

function CodeBlock({ className, children }: { className?: string; children?: ReactNode }) {
  const raw = String(children ?? "").replace(/\n$/, "");
  const language = /language-(\w+)/.exec(className ?? "")?.[1]?.toLowerCase() ?? "";
  const formattedJson = language === "json" ? tryFormatJson(raw) ?? raw : tryFormatJson(raw);
  const isJson = Boolean(formattedJson && (language === "json" || raw.trim().startsWith("{") || raw.trim().startsWith("[")));

  return (
    <pre
      className={`my-3 max-h-80 overflow-auto rounded-lg border p-3 text-xs leading-relaxed ${
        isJson
          ? "border-emerald-400/20 bg-emerald-950/30 text-emerald-100"
          : "border-white/10 bg-black/40 text-slate-200"
      }`}
    >
      <code className="font-mono whitespace-pre-wrap break-words">{isJson ? formattedJson : raw}</code>
    </pre>
  );
}

type MarkdownReportViewerProps = {
  content: string;
  className?: string;
};

export function MarkdownReportViewer({ content, className = "" }: MarkdownReportViewerProps) {
  const components = useMemo(
    () => ({
      h1: ({ children }: { children?: ReactNode }) => (
        <h1 className="mb-4 border-b border-white/10 pb-2 text-xl font-semibold tracking-tight text-white">{children}</h1>
      ),
      h2: ({ children }: { children?: ReactNode }) => (
        <h2 className="mb-3 mt-6 text-lg font-semibold text-cyan-100">{children}</h2>
      ),
      h3: ({ children }: { children?: ReactNode }) => (
        <h3 className="mb-2 mt-4 text-base font-semibold text-slate-100">{children}</h3>
      ),
      h4: ({ children }: { children?: ReactNode }) => (
        <h4 className="mb-2 mt-3 text-sm font-semibold text-slate-200">{children}</h4>
      ),
      p: ({ children }: { children?: ReactNode }) => <p className="mb-2 text-sm leading-relaxed text-slate-200">{children}</p>,
      ul: ({ children }: { children?: ReactNode }) => <ul className="mb-3 list-disc space-y-1 pl-5 text-sm text-slate-200">{children}</ul>,
      ol: ({ children }: { children?: ReactNode }) => <ol className="mb-3 list-decimal space-y-1 pl-5 text-sm text-slate-200">{children}</ol>,
      li: ({ children }: { children?: ReactNode }) => <li className="leading-relaxed">{children}</li>,
      strong: ({ children }: { children?: ReactNode }) => <strong className="font-semibold text-white">{children}</strong>,
      a: ({ href, children }: { href?: string; children?: ReactNode }) => (
        <a href={href} target="_blank" rel="noreferrer" className="text-cyan-300 underline underline-offset-2 hover:text-cyan-200">
          {children}
        </a>
      ),
      hr: () => <hr className="my-4 border-white/10" />,
      table: ({ children }: { children?: ReactNode }) => (
        <div className="my-3 overflow-x-auto rounded-lg border border-white/10">
          <table className="min-w-full text-left text-xs text-slate-200">{children}</table>
        </div>
      ),
      thead: ({ children }: { children?: ReactNode }) => <thead className="bg-white/5 text-slate-300">{children}</thead>,
      th: ({ children }: { children?: ReactNode }) => <th className="border border-white/10 px-3 py-2 font-semibold">{children}</th>,
      td: ({ children }: { children?: ReactNode }) => <td className="border border-white/10 px-3 py-2 align-top">{children}</td>,
      code: ({ className, children }: { className?: string; children?: ReactNode }) => {
        const isBlock = Boolean(className);
        if (isBlock) return <CodeBlock className={className}>{children}</CodeBlock>;
        return <code className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-xs text-cyan-100">{children}</code>;
      },
      pre: ({ children }: { children?: ReactNode }) => <>{children}</>,
    }),
    [],
  );

  return (
    <div className={`markdown-report-viewer space-y-1 ${className}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
}

export type MdReportModalState = {
  title: string;
  url: string;
  downloadFilename?: string;
} | null;

type MdReportModalProps = {
  state: MdReportModalState;
  content: string | null;
  isLoading: boolean;
  error: string | null;
  onClose: () => void;
};

function downloadTextFile(filename: string, text: string) {
  const blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function MdReportModal({ state, content, isLoading, error, onClose }: MdReportModalProps) {
  if (!state) return null;

  const filename = state.downloadFilename ?? `${state.title.replace(/\s+/g, "_").toLowerCase()}.md`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={onClose}>
      <div
        className="flex max-h-[92vh] w-full max-w-5xl flex-col rounded-xl border border-white/10 bg-slate-950 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <ScrollText className="h-5 w-5 shrink-0 text-cyan-300" />
              <h3 className="truncate text-lg font-semibold text-white">{state.title}</h3>
            </div>
            <p className="mt-1 truncate text-xs text-slate-400">Reporte técnico OCR/LLM en Markdown</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {content ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => downloadTextFile(filename, content)}
              >
                <Download className="mr-2 h-4 w-4" />
                Descargar .md
              </Button>
            ) : null}
            <a href={state.url} target="_blank" rel="noreferrer">
              <Button size="sm" variant="outline">
                <ExternalLink className="mr-2 h-4 w-4" />
                Abrir en pestaña
              </Button>
            </a>
            <Button size="sm" variant="outline" onClick={onClose}>
              <X className="mr-2 h-4 w-4" />
              Cerrar
            </Button>
          </div>
        </div>

        <div className="overflow-y-auto px-5 py-4">
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-8 w-2/3" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
              <Skeleton className="h-32 w-full" />
            </div>
          ) : error ? (
            <div className="rounded-lg border border-amber-300/30 bg-amber-500/10 p-4 text-sm text-amber-100">
              <p className="font-semibold">No se pudo cargar el reporte</p>
              <p className="mt-1">{error}</p>
              <a href={state.url} target="_blank" rel="noreferrer" className="mt-3 inline-block text-cyan-200 underline">
                Abrir en pestaña nueva
              </a>
            </div>
          ) : content ? (
            <MarkdownReportViewer content={content} />
          ) : (
            <p className="text-sm text-muted-foreground">Sin contenido disponible.</p>
          )}
        </div>
      </div>
    </div>
  );
}

export async function fetchMarkdownReport(url: string): Promise<string> {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`No se pudo cargar markdown (${response.status})`);
  return response.text();
}

export function MdReportLoadingIndicator() {
  return (
    <div className="flex items-center gap-2 text-sm text-slate-300">
      <Loader2 className="h-4 w-4 animate-spin" />
      Cargando reporte...
    </div>
  );
}