interface SportMonksMatch {
  id: number;
  league_id: number;
  league?: { data?: { id: number }; id?: number }; // 🔥 NEW: nested league structure
  localteam: { data: { name: string } };
  visitorteam: { data: { name: string } };
  time: {
    status: string;
    minute: number;
    added_time?: number;
    extra_minute?: number;
  };
  scores: { data: any[] };
  statistics?: { data: any[] };
  events?: { data: any[] };
  odds?: { data: any[] };
  starting_at: string;
}

interface SportMonksApiResponse {
  data: SportMonksMatch[];
}

export class SportMonksClient {
  private apiKey: string;
  private baseUrl: string = "https://api.sportmonks.com/v3/football";
  private requestTimestamps: Date[] = [];
  private requestsPerMinute: number = 3000;
  
  // 🔥 MINUTE EXTRACTION CACHE: Prevent sudden drops to 0 + inflate with elapsed time
  private lastMinuteCache = new Map<string, { minute: number; timestamp: number }>();
  private lastChangeCache = new Map<string, { minute: number; timestamp: number }>(); // Track when minute actually changed
  private readonly USE_STARTING_AT_FALLBACK: boolean;
  private readonly USE_PERIODS_EVENTS_FALLBACK: boolean;
  private readonly USE_FIXTURE_FALLBACK: boolean;
  private readonly LAST_MINUTE_CACHE_SEC: number;
  private readonly STALE_MINUTE_THRESHOLD_SEC: number;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    // 🔥 Default to ENABLED (opt-out with =0) for all fallback mechanisms
    this.USE_STARTING_AT_FALLBACK = process.env.USE_STARTING_AT_FALLBACK !== '0';
    this.USE_PERIODS_EVENTS_FALLBACK = process.env.USE_PERIODS_EVENTS_FALLBACK !== '0';
    this.USE_FIXTURE_FALLBACK = process.env.USE_FIXTURE_FALLBACK !== '0';
    this.LAST_MINUTE_CACHE_SEC = Number(process.env.LAST_MINUTE_CACHE_SEC || 90);
    this.STALE_MINUTE_THRESHOLD_SEC = Number(process.env.STALE_MINUTE_THRESHOLD_SEC || 120);
    
    console.log(`⚙️ SportMonks Minute Fallback Config:`);
    console.log(`   - USE_STARTING_AT_FALLBACK: ${this.USE_STARTING_AT_FALLBACK}`);
    console.log(`   - USE_PERIODS_EVENTS_FALLBACK: ${this.USE_PERIODS_EVENTS_FALLBACK}`);
    console.log(`   - USE_FIXTURE_FALLBACK: ${this.USE_FIXTURE_FALLBACK}`);
    console.log(`   - LAST_MINUTE_CACHE_SEC: ${this.LAST_MINUTE_CACHE_SEC}s`);
    console.log(`   - STALE_MINUTE_THRESHOLD_SEC: ${this.STALE_MINUTE_THRESHOLD_SEC}s`);
  }

  // 🔥 MINUTE EXTRACTION: Multi-layer fallback system
  private fallbackMinuteFromStart(rawData: any): number {
    try {
      const startingAt = rawData?.starting_at || rawData?.time?.starting_at?.timestamp;
      
      // Handle timestamp directly
      if (typeof startingAt === 'number' && startingAt > 0) {
        const now = Math.floor(Date.now() / 1000);
        const elapsed = Math.max(0, Math.floor((now - startingAt) / 60));
        return Math.min(elapsed, 130); // Cap at 130 minutes
      }
      
      // Handle ISO string
      if (typeof startingAt === 'string') {
        const base = startingAt.split('+')[0].replace('T', ' ');
        const dt = new Date(base);
        if (!isNaN(dt.getTime())) {
          const now = Date.now();
          const elapsed = Math.max(0, Math.floor((now - dt.getTime()) / 60000));
          return Math.min(elapsed, 130);
        }
      }
    } catch (error) {
      // Silent fail - return 0 to try other methods
    }
    return 0;
  }

  private minuteFromPeriodsOrEvents(rawData: any): number | null {
    // Try periods first
    const periods = rawData?.periods?.data || rawData?.periods;
    if (Array.isArray(periods) && periods[0]?.minute > 0) {
      return periods[0].minute;
    }
    
    // Try events (get max minute from recent events)
    const events = rawData?.events?.data || rawData?.events;
    if (Array.isArray(events) && events.length > 0) {
      const maxMinute = events.slice(0, 10).reduce((max, event) => {
        const minute = event?.minute;
        return typeof minute === 'number' && minute > max ? minute : max;
      }, 0);
      if (maxMinute > 0) return maxMinute;
    }
    
    return null;
  }

  private extractMinuteStrong(rawData: any): number {
    // Layer 1: Primary sources (time.minute, time.minutes, etc.)
    const time = rawData?.time || {};
    if (typeof time?.minute === 'number' && time.minute > 0) return time.minute;
    if (typeof time?.minutes === 'number' && time.minutes > 0) return time.minutes;
    if (typeof time?.current?.minute === 'number' && time.current.minute > 0) return time.current.minute;
    if (typeof rawData?.live?.minute === 'number' && rawData.live.minute > 0) return rawData.live.minute;

    // Layer 2: Periods/Events fallback
    if (this.USE_PERIODS_EVENTS_FALLBACK) {
      const periodMinute = this.minuteFromPeriodsOrEvents(rawData);
      if (typeof periodMinute === 'number' && periodMinute > 0) {
        console.log(`⚡ PERIODS/EVENTS FALLBACK: Extracted minute=${periodMinute} for match ${rawData?.id}`);
        return periodMinute;
      }
    }

    // Layer 3: starting_at timestamp fallback
    if (this.USE_STARTING_AT_FALLBACK) {
      const startMinute = this.fallbackMinuteFromStart(rawData);
      if (startMinute > 0) {
        console.log(`⚡ STARTING_AT FALLBACK: Calculated minute=${startMinute} for match ${rawData?.id}`);
        return startMinute;
      }
    }

    return 0;
  }

  private applyLastMinuteCache(matchId: string, minute: number): { minute: number; usedCache: boolean } {
    const now = Date.now();
    
    // If we have a valid minute, cache it and track changes
    if (minute > 0) {
      const prevChange = this.lastChangeCache.get(matchId);
      // Only update change cache if minute actually changed
      if (!prevChange || minute !== prevChange.minute) {
        this.lastChangeCache.set(matchId, { minute, timestamp: now });
      }
      this.lastMinuteCache.set(matchId, { minute, timestamp: now });
      return { minute, usedCache: false };
    }
    
    // If minute is 0, check cache for recent value with elapsed time inflation
    const cached = this.lastMinuteCache.get(matchId);
    if (!cached) return { minute: 0, usedCache: false };
    
    const ageSeconds = (now - cached.timestamp) / 1000;
    
    // Calculate elapsed minutes and inflate cached minute
    const elapsedMinutes = Math.floor(ageSeconds / 60);
    const inflatedMinute = Math.min(130, cached.minute + Math.max(0, elapsedMinutes));
    
    if (ageSeconds < this.LAST_MINUTE_CACHE_SEC) {
      console.log(`💾 CACHE FALLBACK: Using cached minute=${cached.minute} + ${elapsedMinutes}min elapsed = ${inflatedMinute} (age=${ageSeconds.toFixed(0)}s) for match ${matchId}`);
      return { minute: inflatedMinute, usedCache: true };
    }
    
    return { minute: 0, usedCache: false };
  }
  
  private isStaleMinute(matchId: string): boolean {
    const lastChange = this.lastChangeCache.get(matchId);
    if (!lastChange) return false;
    
    const ageSeconds = (Date.now() - lastChange.timestamp) / 1000;
    return ageSeconds > this.STALE_MINUTE_THRESHOLD_SEC;
  }
  
  private async fetchFixtureFallback(fixtureId: string): Promise<number> {
    if (!this.USE_FIXTURE_FALLBACK) return 0;
    
    try {
      console.log(`🔄 FIXTURE FALLBACK: Fetching /fixtures/${fixtureId} for minute data`);
      const params = { include: 'periods;events;participants' };
      const data = await this.makeRequest(`fixtures/${fixtureId}`, params);
      const fixture = data.data;
      
      if (fixture) {
        const extractedMinute = this.extractMinuteStrong(fixture);
        if (extractedMinute > 0) {
          console.log(`✅ FIXTURE FALLBACK: Retrieved minute=${extractedMinute} for fixture ${fixtureId}`);
          return extractedMinute;
        }
      }
    } catch (error) {
      console.warn(`⚠️ FIXTURE FALLBACK: Failed for ${fixtureId} - ${error}`);
    }
    
    return 0;
  }

  // 🔥 MULTI-FALLBACK TEAM NAME EXTRACTION (Python debug packet approach)
  private extractTeamName(rawData: any, type: 'home' | 'away'): string {
    try {
      // 1) participants fallback (v3 format)
      const participants = rawData.participants?.data || rawData.participants;
      if (Array.isArray(participants) && participants.length >= 2) {
        const team = type === 'home' ? participants[0] : participants[1];
        const name = team?.name || team?.short_code;
        if (name) return name;
      }

      // 2) localteam/visitorteam legacy fallback
      const teamKey = type === 'home' ? 'localteam' : 'visitorteam';
      const teamData = rawData[teamKey]?.data || rawData[teamKey];
      if (teamData?.name) return teamData.name;

      // 3) teams relation fallback  
      const teams = rawData.teams?.data || rawData.teams;
      if (Array.isArray(teams) && teams.length >= 2) {
        const team = type === 'home' ? teams[0] : teams[1];
        if (team?.name) return team.name;
      }

      // 4) backup with match ID
      return `Team_${rawData.id}_${type}`;
      
    } catch (error) {
      console.error(`Team extraction error for ${type}:`, error);
      return `Unknown_${type}`;
    }
  }

  private async checkRateLimit(): Promise<void> {
    const now = new Date();
    const oneMinuteAgo = new Date(now.getTime() - 60000);
    
    this.requestTimestamps = this.requestTimestamps.filter(ts => ts > oneMinuteAgo);
    
    if (this.requestTimestamps.length >= this.requestsPerMinute) {
      const sleepTime = 60000 - (now.getTime() - this.requestTimestamps[0].getTime());
      if (sleepTime > 0) {
        await new Promise(resolve => setTimeout(resolve, sleepTime));
      }
    }
    
    this.requestTimestamps.push(now);
  }

  private async makeRequest(endpoint: string, params: Record<string, any> = {}): Promise<any> {
    await this.checkRateLimit();
    
    const url = new URL(`${this.baseUrl}/${endpoint}`);
    url.searchParams.append('api_token', this.apiKey);
    
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.append(key, value.toString());
    });

    // 🔥 DEBUG: Log the actual URL being called
    console.log(`🌐 DEBUG: SportMonks API URL: ${url.toString()}`);

    try {
      const response = await fetch(url.toString());
      
      if (!response.ok) {
        console.error(`🌐 DEBUG: Response status: ${response.status} ${response.statusText}`);
        console.error(`🌐 DEBUG: Response headers:`, Object.fromEntries(response.headers.entries()));
        throw new Error(`SportMonks API error: ${response.status} - ${response.statusText}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('SportMonks API request failed:', error);
      throw error;
    }
  }

  // 🚨 INPLAY FALLBACK - Fetch detailed match data for minute recovery
  private async fetchInplayMatches(): Promise<Record<string, any>> {
    try {
      // 🚨 SIMPLIFIED: Use minimal includes to avoid 422 errors
      const response = await this.makeRequest('fixtures/inplay', {
        include: 'periods'
      });
      
      const inplayMap: Record<string, any> = {};
      const items = response?.data || [];
      
      for (const match of items) {
        const matchId = match?.id || match?.fixture_id || match?.uuid;
        if (matchId) {
          inplayMap[String(matchId)] = match;
        }
      }
      
      console.log(`🎯 INPLAY FALLBACK: Fetched ${Object.keys(inplayMap).length} inplay matches`);
      return inplayMap;
    } catch (error) {
      console.warn('⚠️ INPLAY FALLBACK: Failed to fetch inplay data:', error);
      return {};
    }
  }

  // Extract minute from inplay data specifically  
  private extractInplayMinute(inplayMatch: any): number | null {
    // Try periods first
    const periods = inplayMatch?.periods;
    if (periods?.data?.[0]?.minute && typeof periods.data[0].minute === 'number') {
      return periods.data[0].minute;
    }
    
    // Try events
    const events = inplayMatch?.events?.data || inplayMatch?.events;
    if (Array.isArray(events) && events.length > 0) {
      for (const event of events.slice(0, 3)) {
        if (typeof event?.minute === 'number' && event.minute > 0) {
          return event.minute;
        }
      }
    }
    
    return null;
  }

  async getLiveMatches(): Promise<SportMonksMatch[]> {
    try {
          // 🔥 SPORTMONKS COMPATIBLE PARAMETERS - Clean format that works
      const supportedLeagues = [181, 82, 9, 453, 444, 72, 968, 1034, 564, 567, 462, 4, 8, 501, 944, 208, 384, 648, 591, 600];
      // 🔥 ENHANCED: Include periods, events for minute fallback + odds for betting
      const includeBase = 'participants;statistics;scores;league';
      const includeExtended = this.USE_PERIODS_EVENTS_FALLBACK 
        ? `${includeBase};periods;events` 
        : includeBase;
      const includeWithOdds = `${includeExtended};odds`; // 💰 Add odds data
      const include = includeWithOdds;
      
      console.log(`🔍 Livescores include params: ${include}`);
      
      // Variant 1: Comma-separated leagues
      let bestResult = await this.tryVariant('comma', {
        'leagues': supportedLeagues.join(','),
        'include': include
        // 🔥 REMOVED: limit parameter (not needed for livescores)
      });
      
      // Variant 2: Semicolon-separated leagues (if variant 1 failed)
      if (bestResult.uniqueLeagues.size <= 1) {
        console.log(`🔄 Trying variant 2 (semicolon) - variant 1 only found ${bestResult.uniqueLeagues.size} league(s)`);
        const variant2 = await this.tryVariant('semicolon', {
          'leagues': supportedLeagues.join(';'),
          'include': include
        });
        if (variant2.uniqueLeagues.size > bestResult.uniqueLeagues.size) {
          bestResult = variant2;
        }
      }
      
      // Variant 3: No leagues param (if still limited)
      if (bestResult.uniqueLeagues.size <= 1) {
        console.log(`🔄 Trying variant 3 (no leagues param) - previous variants only found ${bestResult.uniqueLeagues.size} league(s)`);
        const variant3 = await this.tryVariant('no-param', {
          'include': include
          // 🔥 CLEAN: Only include parameter (gets all active leagues)
        });
        if (variant3.uniqueLeagues.size > bestResult.uniqueLeagues.size) {
          bestResult = variant3;
        }
      }
      
      // Final result analysis
      console.log(`🎯 FINAL: Using best variant with ${bestResult.matches.length} matches from leagues: ${Array.from(bestResult.uniqueLeagues).join(', ')}`);
      
      // Warning if still limited
      if (bestResult.uniqueLeagues.size <= 1) {
        console.warn(`⚠️ WARNING: SportMonks returned limited leagues: ${Array.from(bestResult.uniqueLeagues).join(', ')}. This likely indicates plan/authorization limitation. Please verify subscribed/active leagues in SportMonks dashboard.`);
      }
      
      // 🚨 INPLAY FALLBACK: Check for missing minute data and try to recover
      const USE_INPLAY_FALLBACK = process.env.USE_INPLAY_FALLBACK !== '0';
      let processedMatches = bestResult.matches;
      
      if (USE_INPLAY_FALLBACK) {
        console.log(`🚀 INPLAY FALLBACK: Starting check (enabled=${USE_INPLAY_FALLBACK})`);
        
        // Count matches with missing time data
        let missingTimeCount = 0;
        for (const match of processedMatches) {
          console.log(`🔍 DEBUG MATCH: ${match.id} | time=${JSON.stringify(match.time)} | minute=${match.time?.minute}`);
          
          // Check both null time and minute=0 (SportMonks issue)
          if (!match.time || !match.time.minute || match.time.minute === 0) {
            missingTimeCount++;
            console.log(`❌ MISSING TIME: Match ${match.id} has no valid minute data`);
          }
        }
        
        console.log(`🔍 INPLAY CHECK: ${missingTimeCount}/${processedMatches.length} matches missing time data`);
        
        // If significant portion has missing time data, fetch inplay fallback
        if (missingTimeCount > 0 && missingTimeCount / processedMatches.length >= 0.3) {
          console.warn(`🚨 LIVESCORES weak feed: ${missingTimeCount}/${processedMatches.length} matches missing time data, attempting inplay fallback...`);
          
          const inplayMap = await this.fetchInplayMatches();
          let recoveredCount = 0;
          
          // Enrich matches with inplay data using extractMinuteStrong
          processedMatches = processedMatches.map(match => {
            const matchId = String(match.id);
            const inplayMatch = inplayMap[matchId];
            
            if (inplayMatch && (!match.time || !match.time.minute || match.time.minute === 0)) {
              // 🔥 Use extractMinuteStrong for consistent minute extraction
              const recoveredMinute = this.extractMinuteStrong(inplayMatch);
              if (recoveredMinute > 0) {
                match.time = {
                  ...match.time,
                  minute: recoveredMinute,
                  status: inplayMatch.status?.name || match.time?.status || 'LIVE'
                };
                // Add inplay data (cast to any to avoid interface conflicts)
                (match as any).periods = inplayMatch.periods;
                (match as any).events = inplayMatch.events;
                recoveredCount++;
              }
            }
            
            return match;
          });
          
          console.log(`🎯 INPLAY RECOVERY: Recovered minute data for ${recoveredCount}/${missingTimeCount} matches`);
        }
      }
      
      // 💰 ODDS HYDRATION: Fetch real odds from /odds/live or fixtures/{id}
      const ODDS_HYDRATION_ENABLED = process.env.ODDS_HYDRATION_ENABLED !== '0';
      if (ODDS_HYDRATION_ENABLED && processedMatches.length > 0) {
        try {
          const { hydrateOddsForMatches } = await import('./odds-client');
          console.log(`💰 ODDS HYDRATION: Starting for ${processedMatches.length} matches`);
          await hydrateOddsForMatches(processedMatches);
          console.log(`✅ ODDS HYDRATION: Completed`);
        } catch (error) {
          console.warn(`⚠️ ODDS HYDRATION: Failed - ${error}`);
        }
      }
      
      return processedMatches;
    } catch (error) {
      console.error('Failed to get live matches:', error);
      return [];
    }
  }

  private async tryVariant(variant: string, params: Record<string, string>): Promise<{matches: SportMonksMatch[], uniqueLeagues: Set<number>}> {
    try {
      const data: SportMonksApiResponse = await this.makeRequest('livescores', params); // 🔥 CHANGED: fixtures → livescores
      
      // Normalize league IDs
      const normalizedMatches = (data.data || []).map(match => {
        const normalizedLeagueId = match.league_id ?? match.league?.data?.id ?? match.league?.id;
        return {
          ...match,
          league_id: Number(normalizedLeagueId) || 0
        };
      });
      
      const uniqueLeagues = new Set(normalizedMatches.map(match => match.league_id).filter(id => id > 0));
      
      console.log(`🐛 Variant ${variant}: ${normalizedMatches.length} matches from leagues: ${Array.from(uniqueLeagues).join(', ')}`);
      
      return {
        matches: normalizedMatches,
        uniqueLeagues
      };
    } catch (error) {
      console.error(`Variant ${variant} failed:`, error);
      return {
        matches: [],
        uniqueLeagues: new Set()
      };
    }
  }

  async getMatchDetails(matchId: number): Promise<SportMonksMatch | null> {
    try {
      const params = {};
      
      const data = await this.makeRequest(`fixtures/${matchId}`, params);
      return data.data || null;
    } catch (error) {
      console.error(`Failed to get match details for ${matchId}:`, error);
      return null;
    }
  }

  async getHistoricalData(teamId: number, days: number = 30): Promise<SportMonksMatch[]> {
    try {
      const fromDate = new Date();
      fromDate.setDate(fromDate.getDate() - days);
      
      const params = {
        'team_id': teamId,
        'from': fromDate.toISOString().split('T')[0],
        'limit': '50'
      };
      
      const data: SportMonksApiResponse = await this.makeRequest('fixtures', params);
      return data.data || [];
    } catch (error) {
      console.error(`Failed to get historical data for team ${teamId}:`, error);
      return [];
    }
  }

  async processMatchData(rawData: SportMonksMatch): Promise<any> {
    try {
      // 🔥 ENHANCED TEAM NAME EXTRACTION (Python debug packet approach)
      const homeTeam = this.extractTeamName(rawData, 'home');
      const awayTeam = this.extractTeamName(rawData, 'away');
      
      // 🔥 ENHANCED MINUTE EXTRACTION: Multi-layer fallback + cache + stale detection
      const matchId = String(rawData.id);
      let rawMinute = this.extractMinuteStrong(rawData);
      const cacheResult = this.applyLastMinuteCache(matchId, rawMinute);
      let finalMinute = cacheResult.minute;
      
      // 🔥 STALE MINUTE DETECTION: If minute hasn't changed in 120+ seconds, try fixture fallback
      const isStale = this.isStaleMinute(matchId);
      if ((finalMinute === 0 || isStale) && this.USE_FIXTURE_FALLBACK) {
        if (isStale) {
          console.warn(`⚠️ STALE MINUTE DETECTED: ${homeTeam} vs ${awayTeam} (${matchId}) - minute hasn't changed in ${this.STALE_MINUTE_THRESHOLD_SEC}s, attempting fixture fallback`);
        }
        const fallbackMinute = await this.fetchFixtureFallback(matchId);
        if (fallbackMinute > 0) {
          finalMinute = fallbackMinute;
          // Update cache with fallback result
          this.applyLastMinuteCache(matchId, fallbackMinute);
        }
      }
      
      // 🔥 DEBUG: Log minute extraction results
      console.log(`⏱️ MINUTE EXTRACT: ${homeTeam} vs ${awayTeam} | raw=${rawData.time?.minute} | final=${finalMinute} | cached=${cacheResult.usedCache} | stale=${isStale}`);
      
      return {
        id: rawData.id,
        league_id: rawData.league_id,
        home_team: homeTeam,
        away_team: awayTeam,
        scores: rawData.scores?.data || [],
        time: {
          status: rawData.time?.status,
          minute: finalMinute, // 🔥 USE FINAL MINUTE (with cache inflation + fallback)
          added_time: rawData.time?.added_time,
          extra_minute: rawData.time?.extra_minute
        },
        statistics: this.processStatistics(rawData.statistics?.data || []),
        events: this.processEvents(rawData.events?.data || []),
        odds: this.processOdds(rawData.odds?.data || []),
        starting_at: rawData.starting_at
      };
    } catch (error) {
      console.error('Failed to process match data:', error);
      return rawData;
    }
  }

  private processStatistics(statsData: any[]): any {
    const stats = { home: {}, away: {} };
    
    try {
      for (const stat of statsData) {
        const teamType = stat.team_id === stat.fixture?.localteam_id ? 'home' : 'away';
        
        stats[teamType] = {
          shots_total: stat.shots?.total,
          shots_on_goal: stat.shots?.ongoal,
          possession: stat.possessiontime,
          corners: stat.corners,
          fouls: stat.fouls,
          cards_yellow: stat.yellowcards,
          cards_red: stat.redcards,
          attacks: stat.attacks,
          dangerous_attacks: stat.dangerous_attacks
        };
      }
    } catch (error) {
      console.error('Failed to process statistics:', error);
    }
    
    return stats;
  }

  private processEvents(eventsData: any[]): any[] {
    const processedEvents: any[] = [];
    
    try {
      for (const event of eventsData) {
        processedEvents.push({
          id: event.id,
          type: event.type,
          minute: event.minute,
          extra_minute: event.extra_minute,
          team_id: event.team_id,
          player_id: event.player_id,
          player_name: event.player_name,
          result: event.result,
          reason: event.reason
        });
      }
    } catch (error) {
      console.error('Failed to process events:', error);
    }
    
    return processedEvents;
  }

  private processOdds(oddsData: any[]): any {
    const odds: any = {};
    
    try {
      for (const bookmaker of oddsData) {
        const bookmakerName = bookmaker.name || 'unknown';
        odds[bookmakerName] = {};
        
        for (const market of bookmaker.odds?.data || []) {
          const marketName = market.label;
          odds[bookmakerName][marketName] = {
            values: market.values || [],
            suspended: market.suspended || false
          };
        }
      }
    } catch (error) {
      console.error('Failed to process odds:', error);
    }
    
    return odds;
  }
}
