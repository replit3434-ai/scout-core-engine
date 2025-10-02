// UI-safe types for Active Signals API
export type SignalState = "PRE" | "CANDIDATE" | "ACTIVE" | "EXPIRED";

export interface ActiveSignal {
  id: string;
  match_id: string;
  market: string;
  home: string | null;
  away: string | null;
  confidence: number | null;
  minute: number | null;
  ttl_left: number; // seconds
  state: SignalState;
  selection?: string | null;
  reasoning?: string | null;
}

export interface ActiveSnapshot {
  active: ActiveSignal[];
  counts: { 
    PRE: number; 
    CANDIDATE: number; 
    ACTIVE: number; 
  };
}

// Normalized signal for safe rendering
export interface SafeActiveSignal {
  id: string;
  matchId: string;
  market: string;
  homeTeam: string;
  awayTeam: string;
  confidence: number;
  minute: number;
  ttlMinutes: number;
  state: SignalState;
  selection: string;
  reasoning: string;
}