// server/services/providers/sportmonks-adapter.ts

const USE_INPLAY_FALLBACK = process.env.USE_INPLAY_FALLBACK !== '0';
const LAST_MINUTE_CACHE_SEC = Number(process.env.LAST_MINUTE_CACHE_SEC || 90);
const USE_STARTING_AT_FALLBACK = process.env.USE_STARTING_AT_FALLBACK !== '0';

// 💾 Module-level cache for last known minutes
const lastMinuteCache = new Map<string, { minute: number; timestamp: number }>();

// 🛡️ Override Guard: Track last normalized minute to prevent backwards movement
const lastNormalizedMinute = new Map<string, { minute: number; timestamp: number }>();

// 🔍 Stale Detection: Track when raw minute last CHANGED (not just last seen)
const lastRawMinuteChange = new Map<string, { rawMinute: number; timestamp: number }>();
const STALE_MINUTE_THRESHOLD_MS = 30000; // 30 seconds without change = stale (reduced for testing)

console.log(`⚙️ SportMonks Adapter Config:`);
console.log(`   - USE_INPLAY_FALLBACK: ${USE_INPLAY_FALLBACK}`);
console.log(`   - USE_STARTING_AT_FALLBACK: ${USE_STARTING_AT_FALLBACK}`);
console.log(`   - LAST_MINUTE_CACHE_SEC: ${LAST_MINUTE_CACHE_SEC}s`);

// 🔥 ENHANCED minute parser with inplay fallback support
export function extractMinute(m: any): number {
  const t = m?.time ?? {};
  const home = m?.participants?.data?.[0]?.name || m?.localteam?.data?.name || 'Unknown';
  const away = m?.participants?.data?.[1]?.name || m?.visitorteam?.data?.name || 'Unknown';
  console.log(`🔍 EXTRACT MINUTE: ${home} vs ${away} | id=${m?.id} | time=${JSON.stringify(t)}`);

  // 1) En yaygın yollar
  if (typeof t?.minute === 'number') return t.minute;
  if (typeof t?.minutes === 'number') return t.minutes;

  // 2) Bazı şema varyantları
  if (typeof t?.current?.minute === 'number') return t.current.minute;
  if (typeof m?.live?.minute === 'number') return m.live.minute;

  // 3) Periods / timeline bazı feed'lerde (inplay'den gelen)
  const periods = m?.periods;
  if (periods?.data?.[0]?.minute && typeof periods.data[0].minute === 'number') {
    return periods.data[0].minute;
  }
  if (periods?.first?.minute && typeof periods.first.minute === 'number') {
    return periods.first.minute;
  }

  // 4) Events'tan minute çıkar (inplay fallback)
  const events = m?.events?.data || m?.events;
  if (Array.isArray(events) && events.length > 0) {
    for (const event of events.slice(0, 5)) { // Son 5 event'e bak
      if (typeof event?.minute === 'number' && event.minute > 0) {
        return event.minute;
      }
    }
  }

  // 5) Fallback: starting_at'tan hesapla
  if (USE_STARTING_AT_FALLBACK) {
    const status = (m?.status?.name || m?.time?.status || '').toString().toUpperCase();
    const liveStatuses = ['LIVE', 'INPLAY', '1ST_HALF', '2ND_HALF', 'ET', 'AET', 'PEN'];

    const startTs =
      t?.starting_at?.timestamp ??
      (t?.starting_at ? Math.floor(Date.parse(t.starting_at) / 1000) : undefined);

    console.log(`🔍 STARTING_AT DEBUG: match=${m?.id} | startTs=${startTs} | status='${status}' | time.starting_at=${JSON.stringify(t?.starting_at)}`);

    // 🚨 CRITICAL FIX: Status empty ise de starting_at varsa hesapla
    // EMERGENCY_FALLBACK durumunda (minute=0, status='') maçlar 0'da takılıyordu
    const shouldCalculate = startTs && (
      liveStatuses.includes(status) || // Normal: status live
      status === '' || status === 'UNDEFINED' // Emergency: status empty ama maç muhtemelen live
    );

    if (shouldCalculate) {
      const now = Math.floor(Date.now() / 1000);
      const elapsed = Math.max(0, Math.floor((now - startTs) / 60));
      const calculatedMinute = Math.min(130, elapsed);
      console.log(`⚡ STARTING_AT CALC: match=${m?.id} | startTs=${startTs} | now=${now} | elapsed=${elapsed}min | calculated=${calculatedMinute}`);
      if (calculatedMinute > 0) {
        console.log(`⚡ STARTING_AT FALLBACK: Calculated minute=${calculatedMinute} for match ${m?.id} (status='${status}')`);
        return calculatedMinute;
      }
    }
  }

  // 6) Hiçbiri yoksa 0 (başlamamış varsay)
  return 0;
}

// Takım isimleri: participants ağırlıklı + legacy fallback
export function extractTeams(m: any): { home: string; away: string } {
  const parts =
    m?.participants?.data ??
    m?.participants ??
    m?.teams?.data ??
    m?.teams;

  if (Array.isArray(parts) && parts.length >= 2) {
    const homeP =
      parts.find((p: any) => (p?.meta?.location || p?.location || p?.side) === 'home') ??
      parts[0];
    const awayP =
      parts.find((p: any) => (p?.meta?.location || p?.location || p?.side) === 'away') ??
      parts[1];

    const home = homeP?.name || homeP?.short_code || m?.localteam?.data?.name;
    const away = awayP?.name || awayP?.short_code || m?.visitorteam?.data?.name;

    return { home: home || 'Unknown', away: away || 'Unknown' };
  }

  // Legacy path'ler
  const lt = m?.localteam?.data?.name;
  const vt = m?.visitorteam?.data?.name;
  return { home: lt || 'Unknown', away: vt || 'Unknown' };
}

// 💾 Apply cache fallback with elapsed time inflation to prevent sudden drops to 0
function applyLastMinuteCache(matchId: string, minute: number): number {
  const now = Date.now();
  const cached = lastMinuteCache.get(matchId);
  
  // If we have a valid minute
  if (minute > 0) {
    // Only update cache timestamp when minute INCREASES (not every loop)
    if (!cached || minute > cached.minute) {
      lastMinuteCache.set(matchId, { minute, timestamp: now });
    }
    // Return the raw minute (don't inflate when we have fresh data)
    return minute;
  }
  
  // If minute is 0/null, check cache for recent value with elapsed time inflation
  if (!cached) return 0;
  
  const ageSeconds = (now - cached.timestamp) / 1000;
  
  // Calculate elapsed minutes and inflate cached minute
  const elapsedMinutes = Math.floor(ageSeconds / 60);
  const inflatedMinute = Math.min(130, cached.minute + Math.max(0, elapsedMinutes));
  
  if (ageSeconds < LAST_MINUTE_CACHE_SEC) {
    console.log(`💾 CACHE FALLBACK: Using cached minute=${cached.minute} + ${elapsedMinutes}min elapsed = ${inflatedMinute} (age=${ageSeconds.toFixed(0)}s) for match ${matchId}`);
    return inflatedMinute;
  }
  
  // Cache expired
  return 0;
}

// Normalize edilmiş maç objesi
export function normalizeSmMatch(raw: any) {
  const { home, away } = extractTeams(raw);
  const rawMinute = extractMinute(raw);
  
  const matchId = String(raw?.id ?? raw?.fixture_id ?? raw?.uuid ?? 'unknown');
  const now = Date.now();
  
  // 🔍 Track when raw minute last CHANGED
  const lastRawChange = lastRawMinuteChange.get(matchId);
  let isStale = false;
  
  if (!lastRawChange || lastRawChange.rawMinute !== rawMinute) {
    // Raw minute changed - update tracker
    lastRawMinuteChange.set(matchId, { rawMinute, timestamp: now });
  } else if (rawMinute > 0 && now - lastRawChange.timestamp > STALE_MINUTE_THRESHOLD_MS) {
    // Raw minute hasn't changed for > 2 minutes = STALE
    isStale = true;
  }
  
  // 🔥 Apply cache fallback with elapsed inflation
  const cachedMinute = applyLastMinuteCache(matchId, rawMinute);
  
  // 🛡️ OVERRIDE GUARD: Prevent minute from going backwards OR handle stale minute
  const prevNormalized = lastNormalizedMinute.get(matchId);
  let normalizedMinute = cachedMinute;
  let guardApplied = false;
  
  // Guard activates in 2 cases:
  // 1. raw=0 but we had previous minute
  // 2. raw minute is STALE (unchanged for too long)
  if ((rawMinute === 0 || isStale) && prevNormalized && prevNormalized.minute > 0) {
    // Use previous + elapsed time since last change
    const elapsedMinutes = Math.floor((now - prevNormalized.timestamp) / 60000);
    const inflatedFromPrev = Math.min(130, prevNormalized.minute + elapsedMinutes);
    
    // Use the maximum of cache or inflated previous (never go backwards)
    normalizedMinute = Math.max(cachedMinute, inflatedFromPrev);
    guardApplied = true;
  } else if (cachedMinute > 0) {
    normalizedMinute = cachedMinute;
  } else {
    normalizedMinute = rawMinute;
  }
  
  // 🔥 Track normalized minute for next iteration (only update timestamp when minute INCREASES)
  if (normalizedMinute > 0) {
    const prev = lastNormalizedMinute.get(matchId);
    if (!prev || normalizedMinute > prev.minute) {
      // Minute increased - update both minute and timestamp
      lastNormalizedMinute.set(matchId, { minute: normalizedMinute, timestamp: now });
    } else if (normalizedMinute === prev.minute) {
      // Minute unchanged - keep old timestamp so elapsed time accumulates
      // Don't update anything
    }
  }
  
  // 🔥 DEBUG: Log with guard status and stale detection
  console.log(`⏱️ MINUTE EXTRACT: ${home} vs ${away} | raw=${rawMinute} | cached=${cachedMinute} | normalized=${normalizedMinute} | guard=${guardApplied} | stale=${isStale}`);
  
  // 🚨 DEBUG: Status extraction paths
  const statusFromStatus = raw?.status?.name;
  const statusFromTime = raw?.time?.status;
  const finalStatus = statusFromStatus ?? statusFromTime ?? '';
  
  // console.log(`🔍 STATUS DEBUG: ${home} vs ${away} | status.name=${statusFromStatus} | time.status=${statusFromTime} | final=${finalStatus}`);

  return {
    match_id: raw?.id ?? raw?.fixture_id ?? raw?.uuid,
    league_id: raw?.league?.id ?? raw?.league_id,
    home_team: home,
    away_team: away,
    minute: normalizedMinute, // 🛡️ Use normalized minute with override guard
    score_home:
      raw?.scores?.localteam_score ??
      raw?.scores?.home ??
      0,
    score_away:
      raw?.scores?.visitorteam_score ??
      raw?.scores?.away ??
      0,
    status: finalStatus,
    raw_time: raw?.time ?? null, // debug için
    odds: raw?.odds ?? null, // 💰 Odds data for betting
  };
}