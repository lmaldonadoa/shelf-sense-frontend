export type FormattedDuration = {
  primary: string;
  secondary: string;
  ms: number;
};

export function formatDurationMs(ms: number): FormattedDuration {
  if (!Number.isFinite(ms) || ms < 0) {
    return { primary: "—", secondary: "", ms: 0 };
  }
  const rounded = Math.round(ms);
  if (ms < 1000) {
    return { primary: `${rounded} ms`, secondary: "", ms: rounded };
  }
  const seconds = ms / 1000;
  if (seconds < 60) {
    const primary = seconds < 10 ? `${seconds.toFixed(1)} s` : `${Math.round(seconds)} s`;
    return { primary, secondary: `${rounded.toLocaleString("es")} ms`, ms: rounded };
  }
  const minutes = Math.floor(seconds / 60);
  const remSec = Math.round(seconds % 60);
  return {
    primary: `${minutes}m ${remSec}s`,
    secondary: `${rounded.toLocaleString("es")} ms`,
    ms: rounded,
  };
}

export function formatWallClockDuration(started?: string | null, finished?: string | null): string {
  if (!started || !finished) return "En curso";
  const startMs = new Date(started).getTime();
  const endMs = new Date(finished).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) return "—";
  return formatDurationMs(endMs - startMs).primary;
}

export function percentOfTotal(value: number, total: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(total) || total <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((value / total) * 100)));
}