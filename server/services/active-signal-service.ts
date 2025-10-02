import { SignalCandidate, SignalState, ActiveSignalSnapshot, ActiveSignalSummary } from '@shared/schema';

interface MarketConfig {
  enabled: boolean;
  minConfidence: number;
  maxSignalsPerMatch: number;
}

interface ActiveSignalConfig {
  confidenceActive: number;      // 0.65 - Confidence threshold for ACTIVE state
  maxActive: number;             // 10 - Max active signals in UI
  cooldownSeconds: number;       // 300 - Cooldown between same signal ID
  maturationWindow: number;      // 60 - Min seconds to mature from CANDIDATE to ACTIVE
  signalTTL: number;             // 15 - Signal TTL in minutes
  markets: {
    over_under: MarketConfig;
    btts: MarketConfig;
    next_goal: MarketConfig;
  };
}

/**
 * Active Signal Service
 * Manages signal state machine: PRE → CANDIDATE → ACTIVE → EXPIRED
 * Handles maturation, deduplication, and priority-based filtering
 */
export class ActiveSignalService {
  private signals: Map<string, SignalCandidate> = new Map();
  private cooldown: Map<string, number> = new Map(); // Last ACTIVE timestamp by ID
  private config: ActiveSignalConfig;

  constructor(config?: Partial<ActiveSignalConfig>) {
    this.config = {
      confidenceActive: config?.confidenceActive ?? 65, // 65%
      maxActive: config?.maxActive ?? 10,
      cooldownSeconds: config?.cooldownSeconds ?? 300, // 5 minutes
      maturationWindow: config?.maturationWindow ?? 60, // 1 minute
      signalTTL: config?.signalTTL ?? 15, // 15 minutes
      markets: {
        over_under: {
          enabled: true,
          minConfidence: 65,
          maxSignalsPerMatch: 2
        },
        btts: {
          enabled: true,
          minConfidence: 60,
          maxSignalsPerMatch: 2
        },
        next_goal: {
          enabled: true,
          minConfidence: 70,
          maxSignalsPerMatch: 1
        },
        ...config?.markets
      },
      ...config
    };

    console.log('🎯 Active Signal Service initialized:', this.config);
  }

  /**
   * Get market confidence threshold based on market type
   */
  private getMarketThreshold(market: string): number {
    if (market.startsWith('over_') || market.startsWith('under_')) {
      return this.config.markets.over_under.minConfidence;
    }
    if (market.startsWith('btts')) {
      return this.config.markets.btts.minConfidence;
    }
    if (market.startsWith('next_goal')) {
      return this.config.markets.next_goal.minConfidence;
    }
    return this.config.confidenceActive; // default
  }

  /**
   * Get per-match limit for market type
   */
  private getPerMatchLimit(market: string): number {
    if (market.startsWith('over_') || market.startsWith('under_')) {
      return this.config.markets.over_under.maxSignalsPerMatch;
    }
    if (market.startsWith('btts')) {
      return this.config.markets.btts.maxSignalsPerMatch;
    }
    if (market.startsWith('next_goal')) {
      return this.config.markets.next_goal.maxSignalsPerMatch;
    }
    return 2; // default
  }

  /**
   * Get market type key for grouping
   */
  private getMarketType(market: string): string {
    if (market.startsWith('over_') || market.startsWith('under_')) return 'ou';
    if (market.startsWith('btts')) return 'btts';
    if (market.startsWith('next_goal')) return 'next_goal';
    return 'other';
  }

  /**
   * Priority calculation: Lower values = higher priority
   * Prioritizes higher confidence and less remaining time
   */
  private calculatePriority(signal: SignalCandidate): [number, number] {
    return [-signal.confidence, this.getTimeLeft(signal)];
  }

  /**
   * Check if signal ID is in cooldown period
   */
  private isDeduplicated(signal: SignalCandidate): boolean {
    const lastActiveTs = this.cooldown.get(signal.id);
    if (!lastActiveTs) return true; // Not in cooldown

    const timeSinceActive = Date.now() - lastActiveTs;
    return timeSinceActive >= (this.config.cooldownSeconds * 1000);
  }

  /**
   * Get remaining time in seconds for signal TTL
   */
  private getTimeLeft(signal: SignalCandidate): number {
    const age = (Date.now() - signal.createdTs) / 1000;
    return Math.max(0, signal.ttlSeconds - age);
  }

  /**
   * Get signal age in seconds
   */
  private getAge(signal: SignalCandidate): number {
    return (Date.now() - signal.createdTs) / 1000;
  }

  /**
   * Promote signal through state machine
   */
  private promoteSignal(signal: SignalCandidate): void {
    const originalState = signal.state;
    const threshold = this.getMarketThreshold(signal.market);

    // PRE -> CANDIDATE: Basic threshold met (15% below main threshold)
    if (signal.state === 'PRE' && 
        signal.confidence >= (threshold - 15) && 
        signal.liquidityOk) {
      signal.state = 'CANDIDATE';
      console.log(`🔼 PRE->CANDIDATE: ${signal.id} (conf=${signal.confidence}%, req=${threshold - 15}%)`);
    }

    // CANDIDATE -> ACTIVE: Maturation requirements met
    if (signal.state === 'CANDIDATE' && 
        signal.confidence >= threshold &&
        this.getAge(signal) >= this.config.maturationWindow &&
        signal.liquidityOk &&
        this.isDeduplicated(signal)) {
      signal.state = 'ACTIVE';
      this.cooldown.set(signal.id, Date.now());
      console.log(`🚀 CANDIDATE->ACTIVE: ${signal.id} (conf=${signal.confidence}%, req=${threshold}%, age=${Math.round(this.getAge(signal))}s)`);
    }

    if (originalState !== signal.state) {
      signal.lastUpdateTs = Date.now();
    }
  }

  /**
   * Check if signal should be expired
   */
  private expireSignal(signal: SignalCandidate): boolean {
    if (this.getTimeLeft(signal) <= 0) {
      signal.state = 'EXPIRED';
      console.log(`⏰ EXPIRED: ${signal.id} (TTL exceeded)`);
      return true;
    }

    // Additional expiration rules can be added here
    // e.g., match finished (minute >= 90), etc.
    
    return false;
  }

  /**
   * Update service with new signal candidates
   * Returns list of active signals ready for UI display
   */
  public update(candidates: SignalCandidate[]): ActiveSignalSummary[] {
    const now = Date.now();

    // Process incoming candidates
    for (const candidate of candidates) {
      candidate.lastUpdateTs = now;
      
      const existing = this.signals.get(candidate.id);
      if (existing) {
        // Update existing signal
        existing.confidence = candidate.confidence;
        existing.minute = candidate.minute;
        existing.liquidityOk = candidate.liquidityOk;
        existing.reasoning = candidate.reasoning;
        existing.meta = { ...existing.meta, ...candidate.meta };
        existing.lastUpdateTs = now;
        
        // Keep original timestamps and state progression
        candidate.createdTs = existing.createdTs;
        candidate.state = existing.state;
      }
      
      this.signals.set(candidate.id, candidate);
      
      // Promote through state machine
      if (candidate.state === 'PRE' || candidate.state === 'CANDIDATE') {
        this.promoteSignal(candidate);
      }
    }

    // Expire old signals
    const expiredIds: string[] = [];
    this.signals.forEach((signal, id) => {
      if (this.expireSignal(signal)) {
        expiredIds.push(id);
      }
    });

    // Remove expired signals
    for (const id of expiredIds) {
      this.signals.delete(id);
    }

    // Get active signals and apply per-match, per-market limits
    const activeSignals = Array.from(this.signals.values())
      .filter(signal => signal.state === 'ACTIVE');

    // Group by match ID first
    const groupedByMatch = new Map<string, SignalCandidate[]>();
    for (const signal of activeSignals) {
      if (!groupedByMatch.has(signal.matchId)) {
        groupedByMatch.set(signal.matchId, []);
      }
      groupedByMatch.get(signal.matchId)!.push(signal);
    }

    // Apply per-match, per-market limits
    const limitedSignals: SignalCandidate[] = [];
    for (const [matchId, signals] of Array.from(groupedByMatch.entries())) {
      // Sort by priority within this match
      signals.sort((a: SignalCandidate, b: SignalCandidate) => {
        const [priorityA1, priorityA2] = this.calculatePriority(a);
        const [priorityB1, priorityB2] = this.calculatePriority(b);
        
        if (priorityA1 !== priorityB1) return priorityA1 - priorityB1;
        return priorityA2 - priorityB2;
      });

      // Group by market type within this match
      const perMarketGroup = new Map<string, SignalCandidate[]>();
      for (const signal of signals) {
        const marketType = this.getMarketType(signal.market);
        if (!perMarketGroup.has(marketType)) {
          perMarketGroup.set(marketType, []);
        }
        perMarketGroup.get(marketType)!.push(signal);
      }

      // Apply per-market limits for this match
      for (const [marketType, marketSignals] of Array.from(perMarketGroup.entries())) {
        const limit = this.getPerMatchLimit(marketSignals[0]?.market || 'other');
        const cappedSignals = marketSignals.slice(0, limit);
        limitedSignals.push(...cappedSignals);
      }
    }

    // Final sort by global priority and apply UI display limit
    const finalSignals = limitedSignals
      .sort((a, b) => {
        const [priorityA1, priorityA2] = this.calculatePriority(a);
        const [priorityB1, priorityB2] = this.calculatePriority(b);
        
        if (priorityA1 !== priorityB1) return priorityA1 - priorityB1;
        return priorityA2 - priorityB2;
      })
      .slice(0, this.config.maxActive);

    console.log(`🎯 Active signals processed: ${finalSignals.length}/${this.signals.size} total (${groupedByMatch.size} matches)`);

    return finalSignals.map(this.toSummary.bind(this));
  }

  /**
   * Convert SignalCandidate to ActiveSignalSummary for UI
   */
  private toSummary(signal: SignalCandidate): ActiveSignalSummary {
    return {
      id: signal.id,
      matchId: signal.matchId,
      market: signal.market,
      selection: signal.selection,
      homeTeam: signal.homeTeam,
      awayTeam: signal.awayTeam,
      league: signal.league,
      confidence: signal.confidence,
      minute: signal.minute,
      ttlLeft: Math.round(this.getTimeLeft(signal)),
      state: signal.state,
      reasoning: signal.reasoning
    };
  }

  /**
   * Convert SignalCandidate to UI-friendly format with null-safety
   */
  private toUISignal(signal: SignalCandidate): any {
    return {
      id: signal.id || '',
      match_id: signal.matchId || '',
      market: signal.market || 'unknown',
      home: signal.homeTeam || null,
      away: signal.awayTeam || null,
      confidence: typeof signal.confidence === 'number' ? signal.confidence : null,
      minute: typeof signal.minute === 'number' ? signal.minute : null,
      ttl_left: Math.max(0, Math.round(this.getTimeLeft(signal))),
      state: signal.state,
      selection: signal.selection || null,
      reasoning: signal.reasoning || null
    };
  }

  /**
   * Get current snapshot for API/WebSocket with per-match limits
   */
  public getSnapshot(): ActiveSignalSnapshot {
    const allSignals = Array.from(this.signals.values());
    
    // Apply the same per-match logic as update() method
    const activeSignals = allSignals.filter(signal => signal.state === 'ACTIVE');

    // Group by match ID
    const groupedByMatch = new Map<string, SignalCandidate[]>();
    for (const signal of activeSignals) {
      if (!groupedByMatch.has(signal.matchId)) {
        groupedByMatch.set(signal.matchId, []);
      }
      groupedByMatch.get(signal.matchId)!.push(signal);
    }

    // Apply per-match, per-market limits
    const limitedSignals: SignalCandidate[] = [];
    for (const [matchId, signals] of Array.from(groupedByMatch.entries())) {
      signals.sort((a: SignalCandidate, b: SignalCandidate) => {
        const [priorityA1, priorityA2] = this.calculatePriority(a);
        const [priorityB1, priorityB2] = this.calculatePriority(b);
        if (priorityA1 !== priorityB1) return priorityA1 - priorityB1;
        return priorityA2 - priorityB2;
      });

      const perMarketGroup = new Map<string, SignalCandidate[]>();
      for (const signal of signals) {
        const marketType = this.getMarketType(signal.market);
        if (!perMarketGroup.has(marketType)) {
          perMarketGroup.set(marketType, []);
        }
        perMarketGroup.get(marketType)!.push(signal);
      }

      for (const [marketType, marketSignals] of Array.from(perMarketGroup.entries())) {
        const limit = this.getPerMatchLimit(marketSignals[0]?.market || 'other');
        const cappedSignals = marketSignals.slice(0, limit);
        limitedSignals.push(...cappedSignals);
      }
    }

    // Final UI signals with display limit
    const finalUISignals = limitedSignals
      .sort((a: SignalCandidate, b: SignalCandidate) => {
        const [priorityA1, priorityA2] = this.calculatePriority(a);
        const [priorityB1, priorityB2] = this.calculatePriority(b);
        if (priorityA1 !== priorityB1) return priorityA1 - priorityB1;
        return priorityA2 - priorityB2;
      })
      .slice(0, this.config.maxActive)
      .map(this.toUISignal.bind(this));

    // Count signals by state
    const counts = allSignals.reduce((acc, signal) => {
      acc[signal.state] = (acc[signal.state] || 0) + 1;
      return acc;
    }, {} as Record<SignalState, number>);

    return {
      active: finalUISignals,
      counts: {
        PRE: counts.PRE || 0,
        CANDIDATE: counts.CANDIDATE || 0,
        ACTIVE: counts.ACTIVE || 0
      }
    };
  }

  /**
   * Get service statistics for monitoring
   */
  public getStats(): Record<string, any> {
    const allSignals = Array.from(this.signals.values());
    const avgConfidence = allSignals.length > 0 
      ? allSignals.reduce((sum, s) => sum + s.confidence, 0) / allSignals.length 
      : 0;

    return {
      totalSignals: allSignals.length,
      activeSignals: allSignals.filter(s => s.state === 'ACTIVE').length,
      candidateSignals: allSignals.filter(s => s.state === 'CANDIDATE').length,
      preSignals: allSignals.filter(s => s.state === 'PRE').length,
      avgConfidence: Math.round(avgConfidence * 100) / 100,
      cooldownEntries: this.cooldown.size,
      config: this.config
    };
  }

  /**
   * Clear all signals (for testing or reset)
   */
  public clear(): void {
    this.signals.clear();
    this.cooldown.clear();
    console.log('🧹 Active Signal Service cleared');
  }
}