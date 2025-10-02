// server/services/odds-utils.ts

export interface BestOdds {
  bookmaker: string;
  odds: number;
}

export interface OddsConfig {
  minOddsDefault: number;
  minOddsPerMarket: Record<string, number>;
  bookmakerWhitelist: string[];
  valueMargin: number;
  movementWindowSecs: number;
  movementMinChange: number;
}

/**
 * Select best odds from SportMonks odds data
 * @param oddsPayload - Raw odds data from SportMonks API
 * @param marketKey - Market identifier (e.g., "over_under", "btts")
 * @param bookmakerWhitelist - List of preferred bookmakers
 * @returns Best odds with bookmaker name or null
 */
export function selectBestOdds(
  oddsPayload: any,
  marketKey: string,
  bookmakerWhitelist: string[]
): BestOdds | null {
  if (!oddsPayload || typeof oddsPayload !== 'object') {
    return null;
  }

  let bestBookmaker: string | null = null;
  let bestOdds = 0;
  const whitelist = new Set(bookmakerWhitelist || []);

  // Handle different SportMonks odds formats
  const oddsData = oddsPayload.data || oddsPayload;
  
  if (!Array.isArray(oddsData)) {
    return null;
  }

  for (const item of oddsData) {
    // Match market
    const market = (item.market || item.label || '').toLowerCase();
    if (!market.includes(marketKey.toLowerCase())) {
      continue;
    }

    // Get bookmaker name
    const bookmaker = item.bookmaker?.name || item.bookmaker_name || 'Unknown';
    
    // Check whitelist
    if (whitelist.size > 0 && !whitelist.has(bookmaker)) {
      continue;
    }

    // Get odds value
    const oddsValue = item.value || item.price || item.odd;
    const odds = parseFloat(oddsValue);
    
    if (isNaN(odds) || odds <= 0) {
      continue;
    }

    if (odds > bestOdds) {
      bestOdds = odds;
      bestBookmaker = bookmaker;
    }
  }

  return bestBookmaker && bestOdds > 0 
    ? { bookmaker: bestBookmaker, odds: bestOdds }
    : null;
}

/**
 * Calculate implied probability from odds
 */
export function impliedProbabilityFromOdds(odds: number): number {
  if (!odds || odds <= 0) {
    return 0;
  }
  return 1 / odds;
}

/**
 * Calculate value bet score
 * @param modelProbability - Model's estimated probability (0-1)
 * @param odds - Market odds
 * @param valueMargin - Required margin for value bet (default 0.10 = 10%)
 */
export function calculateValueBet(
  modelProbability: number,
  odds: number,
  valueMargin: number = 0.10
): {
  isValueBet: boolean;
  valueScore: number;
  impliedProbability: number;
} {
  const impliedProb = impliedProbabilityFromOdds(odds);
  const valueScore = modelProbability - impliedProb;
  const isValueBet = modelProbability > impliedProb * (1 + valueMargin);

  return {
    isValueBet,
    valueScore,
    impliedProbability: impliedProb
  };
}

/**
 * Odds trend tracking cache
 */
export class OddsTrendCache {
  private store: Map<string, Array<{ timestamp: number; odds: number }>> = new Map();
  private windowSecs: number;

  constructor(windowSecs: number = 300) {
    this.windowSecs = windowSecs;
  }

  push(key: string, odds: number): void {
    const now = Date.now() / 1000;
    const arr = this.store.get(key) || [];
    
    arr.push({ timestamp: now, odds });
    
    // Remove old entries
    const cutoff = now - this.windowSecs;
    const filtered = arr.filter(entry => entry.timestamp >= cutoff);
    
    this.store.set(key, filtered);
  }

  delta(key: string): number | null {
    const arr = this.store.get(key);
    if (!arr || arr.length < 2) {
      return null;
    }
    
    // Return difference between first and last
    return arr[arr.length - 1].odds - arr[0].odds;
  }

  clear(): void {
    this.store.clear();
  }
}

/**
 * Get minimum odds threshold for a market
 */
export function getMinOddsForMarket(
  config: OddsConfig,
  marketKey: string
): number {
  return config.minOddsPerMarket[marketKey] || config.minOddsDefault;
}

/**
 * Check if odds meet minimum threshold
 */
export function meetsMinimumOdds(
  odds: number | null | undefined,
  config: OddsConfig,
  marketKey: string
): boolean {
  if (odds == null || odds <= 0) {
    return false;
  }
  
  const minRequired = getMinOddsForMarket(config, marketKey);
  return odds >= minRequired;
}
