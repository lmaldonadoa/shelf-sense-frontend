"use client";

import {
  ReactNode,
  cloneElement,
  isValidElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  ChevronDown,
  ChevronUp,
  Download,
  ExternalLink,
  ListTree,
  Loader2,
  PanelLeftClose,
  PanelLeftOpen,
  ScrollText,
  Search,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

export type MarkdownTocEntry = {
  id: string;
  level: number;
  title: string;
};

function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "section"
  );
}

export function extractMarkdownToc(markdown: string): MarkdownTocEntry[] {
  const entries: MarkdownTocEntry[] = [];
  const slugCounts: Record<string, number> = {};

  for (const line of markdown.split("\n")) {
    const match = /^(#{1,4})\s+(.+)$/.exec(line.trim());
    if (!match) continue;
    const level = match[1].length;
    const title = match[2].replace(/[#*`_~[\]]/g, "").trim();
    if (!title) continue;
    const baseSlug = slugify(title);
    slugCounts[baseSlug] = (slugCounts[baseSlug] ?? 0) + 1;
    const id = slugCounts[baseSlug] > 1 ? `${baseSlug}-${slugCounts[baseSlug]}` : baseSlug;
    entries.push({ id, level, title });
  }

  return entries;
}

const SEARCH_DEBOUNCE_MS = 320;

type TextRange = { start: number; end: number };

function normalizeForSearch(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

function buildSearchableText(text: string): { normalized: string; toOriginal: number[] } {
  const toOriginal: number[] = [];
  let normalized = "";

  for (let i = 0; i < text.length; i += 1) {
    const decomposed = text[i].normalize("NFD").toLowerCase();
    for (const ch of decomposed) {
      if (/\p{M}/u.test(ch)) continue;
      normalized += ch;
      toOriginal.push(i);
    }
  }

  return { normalized, toOriginal };
}

function tokenizeSearchQuery(query: string): string[] {
  return normalizeForSearch(query)
    .split(/[^\p{L}\p{N}]+/u)
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
}

function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const prev = Array.from({ length: b.length + 1 }, (_, index) => index);
  const curr = new Array<number>(b.length + 1);

  for (let i = 1; i <= a.length; i += 1) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= b.length; j += 1) prev[j] = curr[j];
  }

  return prev[b.length];
}

function fuzzyThreshold(token: string): number {
  if (token.length >= 6) return 2;
  if (token.length >= 4) return 1;
  return 0;
}

function tokenFuzzyMatches(word: string, token: string): boolean {
  const threshold = fuzzyThreshold(token);
  if (threshold === 0) return false;
  const normalizedWord = normalizeForSearch(word);
  if (!normalizedWord) return false;
  if (normalizedWord.includes(token) || token.includes(normalizedWord)) return true;
  return levenshteinDistance(normalizedWord, token) <= threshold;
}

function findSubstringMatches(text: string, token: string): TextRange[] {
  const { normalized, toOriginal } = buildSearchableText(text);
  const ranges: TextRange[] = [];
  let from = 0;

  while (from < normalized.length) {
    const index = normalized.indexOf(token, from);
    if (index === -1) break;
    const start = toOriginal[index];
    const end = toOriginal[index + token.length - 1] + 1;
    ranges.push({ start, end });
    from = index + 1;
  }

  return ranges;
}

function findWordFuzzyMatches(text: string, token: string): TextRange[] {
  const ranges: TextRange[] = [];
  const wordPattern = /[\p{L}\p{N}_]+/gu;
  let match: RegExpExecArray | null;

  while ((match = wordPattern.exec(text)) !== null) {
    const word = match[0];
    if (!tokenFuzzyMatches(word, token)) continue;
    ranges.push({ start: match.index, end: match.index + word.length });
  }

  return ranges;
}

function findTokenMatches(text: string, token: string): TextRange[] {
  if (!token) return [];
  const exact = findSubstringMatches(text, token);
  if (exact.length > 0) return exact;
  return findWordFuzzyMatches(text, token);
}

function mergeTextRanges(ranges: TextRange[]): TextRange[] {
  if (!ranges.length) return [];
  const sorted = [...ranges].sort((a, b) => a.start - b.start || a.end - b.end);
  const merged: TextRange[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i += 1) {
    const current = sorted[i];
    const last = merged[merged.length - 1];
    if (current.start <= last.end) {
      last.end = Math.max(last.end, current.end);
    } else {
      merged.push(current);
    }
  }

  return merged;
}

function findSearchMatches(text: string, query: string): TextRange[] {
  const tokens = tokenizeSearchQuery(query);
  if (!tokens.length) return [];

  const allRanges: TextRange[] = [];
  for (const token of tokens) {
    allRanges.push(...findTokenMatches(text, token));
  }

  return mergeTextRanges(allRanges);
}

function countSearchMatches(text: string, query: string): number {
  return findSearchMatches(text, query).length;
}

function cleanJsonCandidate(text: string): string {
  return text
    .trim()
    .replace(/^json\s+/i, "")
    .replace(/^```json\s*/i, "")
    .replace(/\s*```\s*$/g, "")
    .trim();
}

function tryFormatJson(text: string): string | null {
  const cleaned = cleanJsonCandidate(text);
  if (!cleaned.startsWith("{") && !cleaned.startsWith("[")) return null;
  try {
    return JSON.stringify(JSON.parse(cleaned), null, 2);
  } catch {
    return null;
  }
}

function isParseableJsonBlock(text: string): boolean {
  return tryFormatJson(text) !== null;
}

const LLM_JSON_LABELS = new Set([
  "raw_preview",
  "visual_structured_products_before_rules",
  "products_after_semantic_enrichment",
  "structured_products_before_filter",
  "structured_products_after_enrichment",
  "field_audit",
  "ocr_ensemble.evidence_by_field",
  "productos",
  "summary",
  "promotion_catalog_memory",
  "support_crop_catalog_hints",
]);

function isFieldLabelLine(trimmed: string): string | null {
  const match = /^-?\s*([\w][\w_.]*):?\s*$/.exec(trimmed);
  if (!match) return null;
  const name = match[1];
  if (LLM_JSON_LABELS.has(name) || name.includes("_") || name.includes(".")) return name;
  return null;
}

function isSectionBoundaryLine(trimmed: string): boolean {
  if (!trimmed) return false;
  if (/^#{1,6}\s+/.test(trimmed)) return true;
  if (trimmed === "```" || /^```[\w-]*\s*$/.test(trimmed)) return true;
  return Boolean(isFieldLabelLine(trimmed));
}

function wrapJsonFence(body: string): string[] {
  const formatted = tryFormatJson(body) ?? cleanJsonCandidate(body);
  return ["```json", formatted, "```"];
}

function flattenText(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(flattenText).join("");
  if (isValidElement<{ children?: ReactNode }>(node)) {
    return flattenText(node.props.children ?? "");
  }
  return "";
}

function isLlmSectionTitle(title: string): boolean {
  return /interpretaci[oó]n|llm|visual|traza/i.test(title);
}

function collectLooseJsonBlock(lines: string[], startIndex: number): { body: string; endIndex: number } | null {
  let body = "";

  for (let i = startIndex; i < lines.length; i += 1) {
    const trimmed = lines[i].trim();

    if (i > startIndex) {
      if (trimmed === "```" || /^```[\w-]*\s*$/.test(trimmed)) {
        if (body && isParseableJsonBlock(body)) {
          return { body: body.trim(), endIndex: i + 1 };
        }
        break;
      }
      if (isSectionBoundaryLine(trimmed)) break;
    }

    const chunk = trimmed.replace(/^json\s+/i, "").replace(/\s*```\s*$/g, "");
    if (!chunk && !body) continue;
    body += (body ? "\n" : "") + chunk;

    if (isParseableJsonBlock(body)) {
      let endIndex = i + 1;
      while (endIndex < lines.length) {
        const next = lines[endIndex].trim();
        if (!next) {
          endIndex += 1;
          continue;
        }
        if (next === "```" || /^```[\w-]*\s*$/.test(next)) {
          endIndex += 1;
        }
        break;
      }
      return { body: body.trim(), endIndex };
    }

    if (i - startIndex > 500) break;
  }

  return null;
}

/** Normaliza reportes OCR con fences rotos y JSON suelto (típico en Interpretación Visual / LLM). */
export function preprocessOcrReportMarkdown(raw: string): string {
  let text = raw.replace(/\r\n/g, "\n");

  text = text.replace(/```text\s*\n```json\s*/gi, "```json\n");
  text = text.replace(/```text\s*\njson\s+/gi, "```json\n");
  text = text.replace(/```\s*\n\s*```/g, "\n");

  const lines = text.split("\n");
  const out: string[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      out.push("");
      continue;
    }

    if (trimmed === "```" || /^```[\w-]*\s*$/.test(trimmed)) {
      const last = out[out.length - 1] ?? "";
      if (last === "```") continue;
      out.push(line);
      continue;
    }

    const fieldLabel = isFieldLabelLine(trimmed);
    if (fieldLabel) {
      out.push(`- ${fieldLabel}:`);
      let j = i + 1;
      while (j < lines.length && !lines[j].trim()) {
        j += 1;
      }
      if (j < lines.length) {
        const peek = lines[j].trim();
        if (peek.startsWith("```json")) {
          i = j - 1;
          continue;
        }
        if (peek.startsWith("[") || peek.startsWith("{") || /^json\s+[\[{]/.test(peek)) {
          const collected = collectLooseJsonBlock(lines, j);
          if (collected) {
            out.push(...wrapJsonFence(collected.body));
            i = collected.endIndex - 1;
            continue;
          }
        }
      }
      continue;
    }

    if ((trimmed.startsWith("{") || trimmed.startsWith("[")) && isParseableJsonBlock(trimmed)) {
      out.push(...wrapJsonFence(trimmed));
      continue;
    }

    if (trimmed.startsWith("{") || trimmed.startsWith("[") || /^json\s+[\[{]/.test(trimmed)) {
      const collected = collectLooseJsonBlock(lines, i);
      if (collected) {
        out.push(...wrapJsonFence(collected.body));
        i = collected.endIndex - 1;
        continue;
      }
    }

    const inlineBroken = /^json\s+(\{[\s\S]*\}|\[[\s\S]*\])\s*```?\s*$/.exec(trimmed);
    if (inlineBroken) {
      out.push(...wrapJsonFence(inlineBroken[1]));
      continue;
    }

    const inlineJsonFence = /^```json\s+(\{[\s\S]*\}|\[[\s\S]*\])\s*```\s*$/.exec(trimmed);
    if (inlineJsonFence) {
      out.push(...wrapJsonFence(inlineJsonFence[1]));
      continue;
    }

    const inlineListJson = /^-\s+([\w_.]+):\s*(\{[\s\S]*\}|\[[\s\S]*\])\s*$/.exec(trimmed);
    if (inlineListJson && isParseableJsonBlock(inlineListJson[2])) {
      out.push(`- ${inlineListJson[1]}:`);
      out.push(...wrapJsonFence(inlineListJson[2]));
      continue;
    }

    out.push(line);
  }

  return out.join("\n");
}

function MetadataChipsLine({ text, highlight }: { text: string; highlight: (n: ReactNode) => ReactNode }) {
  const normalized = text.replace(/^-\s*/, "").trim();
  const parts = normalized.split(" | ").map((part) => part.trim()).filter(Boolean);
  const isPrimary = parts[0]?.toLowerCase() === "primary" || parts.some((p) => p.startsWith("crop="));

  return (
    <li className="list-none py-1">
      <div
        className={`flex flex-wrap gap-1.5 rounded-lg border p-2.5 ${
          isPrimary
            ? "border-violet-400/25 bg-violet-500/10"
            : "border-white/10 bg-white/[0.03]"
        }`}
      >
        {parts.map((part, index) => {
          const kv = /^([\w_.]+):\s*(.+)$/.exec(part);
          if (kv) {
            const [, key, value] = kv;
            const valueTone =
              value === "True" || value === "ok"
                ? "text-emerald-300"
                : value === "False" || value === "error"
                  ? "text-rose-300"
                  : "text-slate-200";
            return (
              <span
                key={`${key}-${index}`}
                className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-black/30 px-2 py-1 text-[11px]"
              >
                <span className="font-medium text-slate-400">{highlight(key)}:</span>
                <span className={`font-mono ${valueTone}`}>{highlight(value)}</span>
              </span>
            );
          }
          return (
            <span
              key={`${part}-${index}`}
              className="rounded-md border border-white/10 bg-black/30 px-2 py-1 font-mono text-[11px] text-slate-200"
            >
              {highlight(part)}
            </span>
          );
        })}
      </div>
    </li>
  );
}

function JsonFieldLabel({ label }: { label: string }) {
  const isKnown = LLM_JSON_LABELS.has(label);
  return (
    <li className="mt-4 list-none">
      <div
        className={`mb-1 inline-flex items-center gap-2 rounded-md px-2 py-1 text-[11px] font-semibold uppercase tracking-wide ${
          isKnown
            ? "border border-violet-400/30 bg-violet-500/15 text-violet-200"
            : "border border-white/10 bg-white/5 text-slate-300"
        }`}
      >
        {label}
      </div>
    </li>
  );
}

type HighlightContext = {
  query: string;
  activeIndex: number;
  counter: { current: number };
};

function highlightText(text: string, ctx: HighlightContext): ReactNode {
  const query = ctx.query.trim();
  if (!query) return text;

  const ranges = findSearchMatches(text, query);
  if (!ranges.length) return text;

  const parts: ReactNode[] = [];
  let lastIndex = 0;

  for (const range of ranges) {
    if (range.start > lastIndex) parts.push(text.slice(lastIndex, range.start));
    const matchIndex = ctx.counter.current++;
    const isActive = matchIndex === ctx.activeIndex;
    parts.push(
      <mark
        key={`hl-${matchIndex}-${range.start}`}
        data-search-match={matchIndex}
        className={
          isActive
            ? "rounded-sm bg-amber-300 px-0.5 text-black ring-2 ring-amber-400"
            : "rounded-sm bg-amber-500/35 px-0.5 text-amber-50"
        }
      >
        {text.slice(range.start, range.end)}
      </mark>,
    );
    lastIndex = range.end;
  }

  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts.length === 1 ? parts[0] : <>{parts}</>;
}

function highlightNode(node: ReactNode, ctx: HighlightContext): ReactNode {
  if (!ctx.query.trim()) return node;
  if (typeof node === "string") return highlightText(node, ctx);
  if (typeof node === "number") return highlightText(String(node), ctx);
  if (Array.isArray(node)) return node.map((child, index) => (
    <span key={`hl-node-${index}`}>{highlightNode(child, ctx)}</span>
  ));
  if (isValidElement<{ children?: ReactNode }>(node)) {
    if (node.props.children) {
      return cloneElement(node, {
        ...node.props,
        children: highlightNode(node.props.children, ctx),
      });
    }
  }
  return node;
}

function MarkdownCodeBlock({
  className,
  children,
  highlightCtx,
}: {
  className?: string;
  children?: ReactNode;
  highlightCtx?: HighlightContext;
}) {
  const raw = String(children ?? "").replace(/\n$/, "");
  const language = /language-(\w+)/.exec(className ?? "")?.[1]?.toLowerCase() ?? "";
  const formattedJson = language === "json" ? tryFormatJson(raw) ?? raw : tryFormatJson(raw);
  const isJson = Boolean(
    formattedJson && (language === "json" || raw.trim().startsWith("{") || raw.trim().startsWith("[")),
  );
  const display = isJson ? formattedJson : raw;
  const lineCount = (display ?? raw).split("\n").length;

  return (
    <div
      className={`my-3 overflow-hidden rounded-lg border ${
        isJson ? "border-emerald-400/25 bg-emerald-950/20" : "border-white/10 bg-black/40"
      }`}
    >
      <div
        className={`flex items-center justify-between border-b px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide ${
          isJson
            ? "border-emerald-400/20 bg-emerald-500/10 text-emerald-200"
            : "border-white/10 bg-white/5 text-slate-400"
        }`}
      >
        <span>{isJson ? "JSON" : language || "texto"}</span>
        <span className="font-normal normal-case text-slate-500">{lineCount} líneas</span>
      </div>
      <pre className="max-h-[28rem] overflow-auto p-3 text-[11px] leading-relaxed">
        <code
          className={`font-mono whitespace-pre-wrap break-words ${
            isJson ? "text-emerald-100" : "text-slate-200"
          }`}
        >
          {highlightCtx?.query.trim() ? highlightText(display ?? raw, highlightCtx) : display}
        </code>
      </pre>
    </div>
  );
}

export type MarkdownReportContentProps = {
  content: string;
  className?: string;
  searchQuery?: string;
  activeMatchIndex?: number;
  onMatchCountChange?: (count: number) => void;
};

/** Renderiza markdown con estilos para reportes OCR (títulos, listas, JSON, texto). */
export function MarkdownReportContent({
  content,
  className = "",
  searchQuery = "",
  activeMatchIndex = 0,
  onMatchCountChange,
}: MarkdownReportContentProps) {
  const processedContent = useMemo(() => preprocessOcrReportMarkdown(content), [content]);
  const toc = useMemo(() => extractMarkdownToc(processedContent), [processedContent]);
  const headingCursor = useRef(0);

  useEffect(() => {
    onMatchCountChange?.(countSearchMatches(processedContent, searchQuery));
  }, [processedContent, searchQuery, onMatchCountChange]);

  const highlightCtx = useMemo<HighlightContext>(
    () => ({
      query: searchQuery,
      activeIndex: activeMatchIndex,
      counter: { current: 0 },
    }),
    [searchQuery, activeMatchIndex, processedContent],
  );

  headingCursor.current = 0;

  const wrapHighlight = useCallback(
    (children: ReactNode) => highlightNode(children, highlightCtx),
    [highlightCtx],
  );

  const nextHeadingId = () => {
    const entry = toc[headingCursor.current];
    headingCursor.current += 1;
    return entry?.id ?? `heading-${headingCursor.current}`;
  };

  const components = useMemo(
    () => ({
      h1: ({ children }: { children?: ReactNode }) => {
        const id = nextHeadingId();
        return (
          <h1
            id={id}
            className="scroll-mt-28 mb-4 border-b border-white/10 pb-2 text-xl font-semibold tracking-tight text-white"
          >
            {wrapHighlight(children)}
          </h1>
        );
      },
      h2: ({ children }: { children?: ReactNode }) => {
        const id = nextHeadingId();
        const title = flattenText(children);
        const llm = isLlmSectionTitle(title);
        return (
          <h2
            id={id}
            className={`scroll-mt-28 mb-3 mt-8 rounded-r-lg py-2 pr-3 text-lg font-semibold ${
              llm
                ? "border-l-4 border-violet-400 bg-violet-500/10 pl-3 text-violet-100"
                : "text-cyan-100"
            }`}
          >
            {wrapHighlight(children)}
          </h2>
        );
      },
      h3: ({ children }: { children?: ReactNode }) => {
        const id = nextHeadingId();
        return (
          <h3 id={id} className="scroll-mt-28 mb-2 mt-4 text-base font-semibold text-slate-100">
            {wrapHighlight(children)}
          </h3>
        );
      },
      h4: ({ children }: { children?: ReactNode }) => {
        const id = nextHeadingId();
        return (
          <h4 id={id} className="scroll-mt-28 mb-2 mt-3 text-sm font-semibold text-slate-200">
            {wrapHighlight(children)}
          </h4>
        );
      },
      p: ({ children }: { children?: ReactNode }) => {
        const plain = flattenText(children).trim();
        if (plain.startsWith("{") || plain.startsWith("[")) {
          const formatted = tryFormatJson(plain);
          if (formatted) {
            return (
              <MarkdownCodeBlock className="language-json" highlightCtx={highlightCtx}>
                {formatted}
              </MarkdownCodeBlock>
            );
          }
        }
        const paragraphLabel = isFieldLabelLine(plain);
        if (paragraphLabel) return <JsonFieldLabel label={paragraphLabel} />;
        return <p className="mb-2 text-sm leading-relaxed text-slate-200">{wrapHighlight(children)}</p>;
      },
      ul: ({ children }: { children?: ReactNode }) => (
        <ul className="mb-3 space-y-1 pl-0 text-sm text-slate-200 [&>li]:list-disc [&>li]:ml-5">{children}</ul>
      ),
      ol: ({ children }: { children?: ReactNode }) => (
        <ol className="mb-3 list-decimal space-y-1 pl-5 text-sm text-slate-200">{children}</ol>
      ),
      li: ({ children }: { children?: ReactNode }) => {
        const plain = flattenText(children).trim();
        const labelOnly = /^([\w_.]+):\s*$/.exec(plain.replace(/^-\s*/, ""));
        if (labelOnly) return <JsonFieldLabel label={labelOnly[1]} />;

        if (plain.includes(" | ") && /[:=]/.test(plain) && !plain.startsWith("{") && !plain.startsWith("[")) {
          return <MetadataChipsLine text={plain} highlight={wrapHighlight} />;
        }

        const kvStats = /^([\w_.]+):\s*.+\|/.test(plain);
        if (kvStats) return <MetadataChipsLine text={plain} highlight={wrapHighlight} />;

        return <li className="leading-relaxed">{wrapHighlight(children)}</li>;
      },
      strong: ({ children }: { children?: ReactNode }) => (
        <strong className="font-semibold text-white">{wrapHighlight(children)}</strong>
      ),
      a: ({ href, children }: { href?: string; children?: ReactNode }) => (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="text-cyan-300 underline underline-offset-2 hover:text-cyan-200"
        >
          {wrapHighlight(children)}
        </a>
      ),
      hr: () => <hr className="my-4 border-white/10" />,
      table: ({ children }: { children?: ReactNode }) => (
        <div className="my-3 overflow-x-auto rounded-lg border border-white/10">
          <table className="min-w-full text-left text-xs text-slate-200">{children}</table>
        </div>
      ),
      thead: ({ children }: { children?: ReactNode }) => (
        <thead className="bg-white/5 text-slate-300">{children}</thead>
      ),
      th: ({ children }: { children?: ReactNode }) => (
        <th className="border border-white/10 px-3 py-2 font-semibold">{wrapHighlight(children)}</th>
      ),
      td: ({ children }: { children?: ReactNode }) => (
        <td className="border border-white/10 px-3 py-2 align-top">{wrapHighlight(children)}</td>
      ),
      code: ({ className, children }: { className?: string; children?: ReactNode }) => {
        const isBlock = Boolean(className);
        if (isBlock) {
          return (
            <MarkdownCodeBlock className={className} highlightCtx={highlightCtx}>
              {children}
            </MarkdownCodeBlock>
          );
        }
        return (
          <code className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-xs text-cyan-100">
            {wrapHighlight(children)}
          </code>
        );
      },
      pre: ({ children }: { children?: ReactNode }) => <>{children}</>,
    }),
    [wrapHighlight, highlightCtx, toc],
  );

  return (
    <div className={`markdown-report-content space-y-1 ${className}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {processedContent}
      </ReactMarkdown>
    </div>
  );
}

function MarkdownTocPanel({
  entries,
  activeId,
  onSelect,
}: {
  entries: MarkdownTocEntry[];
  activeId: string | null;
  onSelect: (id: string) => void;
}) {
  if (!entries.length) {
    return <p className="px-3 py-2 text-xs text-slate-500">Sin secciones detectadas.</p>;
  }

  return (
    <nav className="space-y-0.5 p-2" aria-label="Índice del reporte">
      {entries.map((entry) => (
        <button
          key={`${entry.id}-${entry.title}`}
          type="button"
          onClick={() => onSelect(entry.id)}
          className={`block w-full rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-white/10 ${
            activeId === entry.id ? "bg-cyan-500/20 text-cyan-100" : "text-slate-300"
          }`}
          style={{ paddingLeft: `${(entry.level - 1) * 12 + 8}px` }}
          title={entry.title}
        >
          <span className="line-clamp-2">{entry.title}</span>
        </button>
      ))}
    </nav>
  );
}

export type MdReportDialogProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  markdown?: string | null;
  isLoading?: boolean;
  error?: string | null;
  sourceUrl?: string | null;
  downloadFilename?: string;
};

function downloadMarkdownFile(filename: string, text: string) {
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

export function MdReportDialog({
  open,
  onClose,
  title,
  subtitle = "Reporte técnico en Markdown",
  markdown = null,
  isLoading = false,
  error = null,
  sourceUrl = null,
  downloadFilename,
}: MdReportDialogProps) {
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [isSearchPending, setIsSearchPending] = useState(false);
  const [matchCount, setMatchCount] = useState(0);
  const [activeMatchIndex, setActiveMatchIndex] = useState(0);
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);
  const [showToc, setShowToc] = useState(true);
  const contentRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  const processedMarkdown = useMemo(
    () => (markdown ? preprocessOcrReportMarkdown(markdown) : null),
    [markdown],
  );
  const toc = useMemo(
    () => (processedMarkdown ? extractMarkdownToc(processedMarkdown) : []),
    [processedMarkdown],
  );

  useEffect(() => {
    if (!open) {
      setSearchInput("");
      setDebouncedSearchQuery("");
      setIsSearchPending(false);
      setMatchCount(0);
      setActiveMatchIndex(0);
      setActiveSectionId(null);
      setShowToc(true);
    }
  }, [open]);

  useEffect(() => {
    if (!searchInput.trim()) {
      setDebouncedSearchQuery("");
      setIsSearchPending(false);
      return;
    }

    setIsSearchPending(true);
    const timer = window.setTimeout(() => {
      setDebouncedSearchQuery(searchInput);
      setIsSearchPending(false);
    }, SEARCH_DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f") {
        event.preventDefault();
        dialogRef.current?.querySelector<HTMLInputElement>('input[placeholder*="Buscar"]')?.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    setActiveMatchIndex(0);
  }, [debouncedSearchQuery]);

  useEffect(() => {
    if (!open || !debouncedSearchQuery.trim() || matchCount === 0 || isSearchPending) return;
    const el = contentRef.current?.querySelector(`[data-search-match="${activeMatchIndex}"]`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [open, debouncedSearchQuery, activeMatchIndex, matchCount, markdown, isSearchPending]);

  const scrollToSection = useCallback((id: string) => {
    setActiveSectionId(id);
    const el = contentRef.current?.querySelector(`#${CSS.escape(id)}`);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const goToMatch = useCallback(
    (direction: 1 | -1) => {
      if (matchCount === 0) return;
      setActiveMatchIndex((prev) => {
        const next = prev + direction;
        if (next < 0) return matchCount - 1;
        if (next >= matchCount) return 0;
        return next;
      });
    },
    [matchCount],
  );

  if (!open) return null;

  const filename = downloadFilename ?? `${title.replace(/\s+/g, "_").toLowerCase()}.md`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-3 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="md-report-dialog-title"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        className="flex max-h-[94vh] w-full max-w-7xl flex-col overflow-hidden rounded-xl border border-white/10 bg-slate-950 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="shrink-0 border-b border-white/10 bg-slate-950/95 px-4 py-3 sm:px-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <ScrollText className="h-5 w-5 shrink-0 text-cyan-300" />
                <h3 id="md-report-dialog-title" className="truncate text-lg font-semibold text-white">
                  {title}
                </h3>
              </div>
              {subtitle ? <p className="mt-1 truncate text-xs text-slate-400">{subtitle}</p> : null}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                className="lg:hidden"
                onClick={() => setShowToc((prev) => !prev)}
              >
                {showToc ? <PanelLeftClose className="mr-2 h-4 w-4" /> : <PanelLeftOpen className="mr-2 h-4 w-4" />}
                Índice
              </Button>
              {markdown ? (
                <Button size="sm" variant="outline" onClick={() => downloadMarkdownFile(filename, markdown)}>
                  <Download className="mr-2 h-4 w-4" />
                  Descargar
                </Button>
              ) : null}
              {sourceUrl ? (
                <a href={sourceUrl} target="_blank" rel="noreferrer">
                  <Button size="sm" variant="outline">
                    <ExternalLink className="mr-2 h-4 w-4" />
                    Pestaña
                  </Button>
                </a>
              ) : null}
              <Button size="sm" variant="outline" onClick={onClose}>
                <X className="mr-2 h-4 w-4" />
                Cerrar
              </Button>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <div className="relative min-w-[220px] flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="Buscar palabras, frases o términos similares… (Ctrl+F)"
                className="h-9 border-white/15 bg-black/30 pl-9 text-slate-100 placeholder:text-slate-500"
              />
            </div>
            {searchInput.trim() ? (
              <>
                <span className="inline-flex items-center gap-1.5 text-xs text-slate-400">
                  {isSearchPending ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-cyan-300" />
                      Buscando…
                    </>
                  ) : matchCount > 0 ? (
                    `${activeMatchIndex + 1} de ${matchCount}`
                  ) : (
                    "Sin coincidencias"
                  )}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => goToMatch(-1)}
                  disabled={matchCount === 0 || isSearchPending}
                >
                  <ChevronUp className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => goToMatch(1)}
                  disabled={matchCount === 0 || isSearchPending}
                >
                  <ChevronDown className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setSearchInput("");
                    setDebouncedSearchQuery("");
                    setIsSearchPending(false);
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              </>
            ) : null}
            {processedMarkdown ? (
              <span className="text-xs text-slate-500">
                {toc.length} secciones · {processedMarkdown.split("\n").length} líneas
              </span>
            ) : null}
          </div>
        </div>

        <div className="flex min-h-0 flex-1">
          <aside
            className={`${
              showToc ? "flex" : "hidden"
            } w-full shrink-0 flex-col border-r border-white/10 bg-black/25 lg:flex lg:w-64 xl:w-72`}
          >
            <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              <ListTree className="h-4 w-4 text-cyan-300" />
              Índice
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <MarkdownTocPanel entries={toc} activeId={activeSectionId} onSelect={scrollToSection} />
            </div>
          </aside>

          <div ref={contentRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
            {isLoading ? (
              <div className="space-y-3" aria-busy="true">
                <Skeleton className="h-8 w-2/3" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-5/6" />
                <Skeleton className="h-32 w-full" />
              </div>
            ) : error ? (
              <div className="rounded-lg border border-amber-300/30 bg-amber-500/10 p-4 text-sm text-amber-100">
                <p className="font-semibold">No se pudo mostrar el reporte</p>
                <p className="mt-1">{error}</p>
                {sourceUrl ? (
                  <a href={sourceUrl} target="_blank" rel="noreferrer" className="mt-3 inline-block text-cyan-200 underline">
                    Abrir en pestaña nueva
                  </a>
                ) : null}
              </div>
            ) : markdown ? (
              <MarkdownReportContent
                content={markdown}
                searchQuery={debouncedSearchQuery}
                activeMatchIndex={activeMatchIndex}
                onMatchCountChange={setMatchCount}
              />
            ) : (
              <p className="text-sm text-muted-foreground">Sin contenido disponible.</p>
            )}
          </div>
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

export function MdReportDialogLoadingHint() {
  return (
    <div className="flex items-center gap-2 text-sm text-slate-300">
      <Loader2 className="h-4 w-4 animate-spin" />
      Cargando reporte...
    </div>
  );
}