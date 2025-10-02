const SM_BASE_URL = process.env.SM_BASE_URL || 'https://api.sportmonks.com/v3/football';
const SM_TOKEN = process.env.SPORTMONKS_API_KEY;
const ODDS_LIVE_ENABLED = process.env.ODDS_LIVE_ENABLED === '1' || process.env.ODDS_LIVE_ENABLED === 'true';
const ODDS_FALLBACK_FIXTURE = process.env.ODDS_FALLBACK_FIXTURE === '1' || process.env.ODDS_FALLBACK_FIXTURE === 'true';
const ODDS_CACHE_TTL = parseInt(process.env.ODDS_CACHE_TTL || '45', 10) * 1000; // ms
const ODDS_FIXTURE_CONCURRENCY = parseInt(process.env.ODDS_FIXTURE_CONCURRENCY || '6', 10);

interface OddsCacheEntry {
  ts: number;
  payload: any;
}

const oddsCache = new Map<string, OddsCacheEntry>();

function cacheGet(fid: string): any | null {
  const hit = oddsCache.get(fid);
  if (!hit) return null;
  
  if (Date.now() - hit.ts <= ODDS_CACHE_TTL) {
    return hit.payload;
  }
  
  oddsCache.delete(fid);
  return null;
}

function cachePut(fid: string, payload: any): void {
  oddsCache.set(fid, { ts: Date.now(), payload });
}

export async function fetchOddsLive(): Promise<any[]> {
  if (!ODDS_LIVE_ENABLED) {
    console.log(`⏭️ ODDS LIVE: Skipped (disabled)`);
    return [];
  }

  try {
    const url = `${SM_BASE_URL}/odds/live?api_token=${SM_TOKEN}`;
    console.log(`🌐 ODDS LIVE: Fetching from ${SM_BASE_URL}/odds/live...`);
    const response = await fetch(url, {
      signal: AbortSignal.timeout(10000)
    });
    
    if (!response.ok) {
      console.log(`❌ ODDS LIVE: HTTP ${response.status} - ${response.statusText}`);
      throw new Error(`HTTP ${response.status}`);
    }
    
    const json = await response.json();
    const data = json?.data || [];
    console.log(`📊 ODDS LIVE: Fetched ${data.length} odds entries`);
    if (data.length > 0) {
      console.log(`📋 ODDS LIVE: First entry: ${JSON.stringify(data[0]).substring(0, 200)}`);
    }
    return data;
  } catch (error: any) {
    console.warn(`⚠️ odds/live fetch failed: ${error.message}`);
    return [];
  }
}

export async function fetchFixtureOdds(fid: string): Promise<any | null> {
  if (!ODDS_FALLBACK_FIXTURE) {
    return null;
  }

  const cached = cacheGet(fid);
  if (cached !== null) {
    return cached;
  }

  try {
    const url = `${SM_BASE_URL}/fixtures/${fid}?api_token=${SM_TOKEN}&include=odds`;
    const response = await fetch(url, {
      signal: AbortSignal.timeout(8000)
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const json = await response.json();
    const oddsPayload = json?.data?.odds || null;
    if (oddsPayload) {
      cachePut(fid, oddsPayload);
      console.log(`💰 FIXTURE ODDS: Cached odds for fixture ${fid}`);
    }
    return oddsPayload;
  } catch (error: any) {
    console.debug(`⚠️ fixture odds fetch failed for ${fid}: ${error.message}`);
    return null;
  }
}

export function indexOddsLive(oddsLiveList: any[]): Map<string, any> {
  const index = new Map<string, any>();
  
  for (const o of oddsLiveList) {
    const fid = o.fixture_id || o.fixture?.id || o.id;
    if (!fid) continue;
    index.set(String(fid), o);
  }
  
  return index;
}

export async function hydrateOddsForMatches(matches: any[]): Promise<void> {
  // 1) Fetch odds/live bulk
  let liveMap = new Map<string, any>();
  if (ODDS_LIVE_ENABLED) {
    const liveList = await fetchOddsLive();
    liveMap = indexOddsLive(liveList);
  }

  // 2) Attach to matches or fallback to fixture endpoint
  const tasks: Promise<void>[] = [];
  const semaphore = createSemaphore(ODDS_FIXTURE_CONCURRENCY);

  for (const m of matches) {
    const fid = m.id || m.fixture_id || m.match_id;
    if (!fid) continue;
    
    // Already has odds
    if (m.odds) continue;

    // Check live map first
    const liveOdds = liveMap.get(String(fid));
    if (liveOdds?.odds) {
      m.odds = liveOdds.odds;
      console.log(`✅ LIVE ODDS: Attached for match ${fid}`);
      continue;
    }

    // Fallback to fixture endpoint (with concurrency control)
    tasks.push(
      semaphore(async () => {
        const payload = await fetchFixtureOdds(String(fid));
        if (payload) {
          m.odds = payload;
        }
      })
    );
  }

  if (tasks.length > 0) {
    console.log(`🔄 ODDS HYDRATION: Processing ${tasks.length} fixture fallback requests`);
    await Promise.all(tasks);
  }
}

function createSemaphore(limit: number) {
  let running = 0;
  const queue: (() => void)[] = [];

  return async <T>(fn: () => Promise<T>): Promise<T> => {
    while (running >= limit) {
      await new Promise<void>(resolve => queue.push(resolve));
    }
    running++;
    try {
      return await fn();
    } finally {
      running--;
      const next = queue.shift();
      if (next) next();
    }
  };
}
