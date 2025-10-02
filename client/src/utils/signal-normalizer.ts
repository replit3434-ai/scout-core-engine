import { ActiveSignal, ActiveSnapshot, SafeActiveSignal } from '@/types/active-signals';

/**
 * Normalize raw API signal to safe UI signal
 */
export function normalizeSignal(raw: any): ActiveSignal {
  return {
    id: String(raw?.id ?? ""),
    match_id: String(raw?.match_id ?? ""),
    market: String(raw?.market ?? "unknown"),
    home: raw?.home ?? null,
    away: raw?.away ?? null,
    confidence: typeof raw?.confidence === "number" ? raw.confidence : null,
    minute: Number.isFinite(raw?.minute) ? raw.minute : null,
    ttl_left: Number.isFinite(raw?.ttl_left) ? Math.max(0, raw.ttl_left) : 0,
    state: (raw?.state as any) ?? "ACTIVE",
    selection: raw?.selection ?? null,
    reasoning: raw?.reasoning ?? null,
  };
}

/**
 * Convert ActiveSignal to SafeActiveSignal with fallback values
 */
export function toSafeSignal(signal: ActiveSignal): SafeActiveSignal {
  return {
    id: signal.id,
    matchId: signal.match_id,
    market: signal.market,
    homeTeam: signal.home ?? "Home",
    awayTeam: signal.away ?? "Away", 
    confidence: signal.confidence ?? 0,
    minute: signal.minute ?? 0,
    ttlMinutes: Math.max(0, Math.floor(signal.ttl_left / 60)),
    state: signal.state,
    selection: signal.selection ?? "—",
    reasoning: signal.reasoning ?? "No reasoning provided"
  };
}

/**
 * Normalize API response to safe snapshot
 */
export function normalizeSnapshot(raw: any): ActiveSnapshot {
  const active = Array.isArray(raw?.active) ? raw.active.map(normalizeSignal) : [];
  
  return {
    active,
    counts: {
      PRE: Number(raw?.counts?.PRE ?? 0),
      CANDIDATE: Number(raw?.counts?.CANDIDATE ?? 0),
      ACTIVE: Number(raw?.counts?.ACTIVE ?? active.length), // Use API count, fallback to array length
    },
  };
}

/**
 * Check if signal is valid and renderable
 */
export function isValidSignal(signal: any): boolean {
  return signal && 
         typeof signal.id === 'string' && 
         signal.id.length > 0 &&
         typeof signal.match_id === 'string' &&
         typeof signal.market === 'string';
}

/**
 * Format confidence as percentage string
 */
export function formatConfidence(confidence: number | null): string {
  if (confidence == null || !Number.isFinite(confidence)) return "—";
  return `${Math.round(confidence)}%`;
}

/**
 * Format minute display
 */
export function formatMinute(minute: number | null): string {
  if (minute == null || !Number.isFinite(minute)) return "—";
  return `${minute}'`;
}

/**
 * Format TTL display
 */
export function formatTTL(ttlLeft: number): string {
  const minutes = Math.max(0, Math.floor(ttlLeft / 60));
  return `${minutes}m`;
}