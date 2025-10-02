import { SportMonksClient } from './sportmonks-client';
import { FootyStatsClient } from './footystats-client';
import { MarketSelector } from './market-selector';
import { RLAgent } from './rl-agent';
import { PerformanceTracker } from './performance-tracker';
import { ActiveSignalService } from './active-signal-service';
import { normalizeSmMatch } from './providers/sportmonks-adapter';
import { storage } from '../storage';
import { WebSocketServer } from 'ws';
import { SignalCandidate } from '@shared/schema';
import { 
  selectBestOdds, 
  meetsMinimumOdds, 
  calculateValueBet,
  OddsConfig 
} from './odds-utils';

interface CoreEngineConfig {
  updateInterval: number;
  signalTTL: number;
  maxConcurrentMatches: number;
  supportedLeagues: number[];
}

export class CoreEngine {
  private sportMonksClient: SportMonksClient;
  private footyStatsClient: FootyStatsClient;
  private marketSelector: MarketSelector;
  private rlAgent: RLAgent;
  private performanceTracker: PerformanceTracker;
  private activeSignalService: ActiveSignalService;
  private config: CoreEngineConfig;
  private isRunning = false;
  private intervalId?: NodeJS.Timeout;
  private wss?: WebSocketServer;
  
  // 🛡️ Broadcast Guard: Track last broadcast minute by match ID
  private lastBroadcastMinute = new Map<string, number>();

  constructor(sportMonksApiKey: string, footyStatsApiKey: string, wss?: WebSocketServer) {
    this.sportMonksClient = new SportMonksClient(sportMonksApiKey);
    this.footyStatsClient = new FootyStatsClient(footyStatsApiKey);
    this.marketSelector = new MarketSelector();
    this.rlAgent = new RLAgent();
    this.performanceTracker = new PerformanceTracker(this);
    this.activeSignalService = new ActiveSignalService({
      confidenceActive: 40,       // 40% confidence for ACTIVE state (lowered for demo)
      maxActive: 10,              // Max 10 active signals in UI
      cooldownSeconds: 300,       // 5 minutes cooldown
      maturationWindow: 30,       // 30 seconds maturation window (faster for demo)
      markets: {
        over_under: {
          enabled: true,
          minConfidence: 40,      // Lowered to 40% for demo
          maxSignalsPerMatch: 2
        },
        btts: {
          enabled: true, 
          minConfidence: 40,      // Lowered to 40% for demo
          maxSignalsPerMatch: 2
        },
        next_goal: {
          enabled: true,
          minConfidence: 50,      // Lowered to 50% for demo
          maxSignalsPerMatch: 1
        }
      }
    });
    this.wss = wss;

    this.config = {
      updateInterval: 30000, // 30 seconds
      signalTTL: 15, // 15 minutes
      maxConcurrentMatches: 20,
      supportedLeagues: [82, 444, 384, 600, 648, 968, 8, 564, 301, 143, 181, 556, 208, 5, 462, 9, 11]
    };

    this.loadConfiguration();
  }

  private async loadConfiguration(): Promise<void> {
    try {
      const updateInterval = await storage.getConfigValue('update_interval');
      const signalTTL = await storage.getConfigValue('signal_ttl');
      const maxConcurrentMatches = await storage.getConfigValue('max_concurrent_matches');

      if (updateInterval) this.config.updateInterval = parseInt(updateInterval) * 1000;
      if (signalTTL) this.config.signalTTL = parseInt(signalTTL);
      if (maxConcurrentMatches) this.config.maxConcurrentMatches = parseInt(maxConcurrentMatches);

      // Load supported leagues from database
      const supportedLeagues = await storage.getSupportedLeagues();
      this.config.supportedLeagues = supportedLeagues
        .filter(league => league.enabled)
        .map(league => league.leagueId);
      
      console.log(`📋 Loaded ${this.config.supportedLeagues.length} supported leagues from database`);
    } catch (error) {
      console.error('Error loading configuration:', error);
    }
  }

  async startEngine(): Promise<void> {
    if (this.isRunning) {
      console.log('Core Engine is already running');
      return;
    }

    console.log('🚀 Starting Scout Core Engine v6.0');
    this.isRunning = true;

    // Initialize with first run
    await this.mainLoop();

    // Set up interval for subsequent runs
    this.intervalId = setInterval(async () => {
      await this.mainLoop();
    }, this.config.updateInterval);

    console.log(`✅ Core Engine started with ${this.config.updateInterval / 1000}s update interval`);
  }

  async stopEngine(): Promise<void> {
    console.log('🛑 Stopping Scout Core Engine');
    this.isRunning = false;
    
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
  }

  private async mainLoop(): Promise<void> {
    try {
      console.log('🔄 Core Engine main loop starting...');
      console.log('BASIC_DEBUG_TEST_123456');
      const startTime = Date.now();

      // 1. Get live matches from SportMonks
      const liveMatches = await this.sportMonksClient.getLiveMatches();
      console.log(`📊 Found ${liveMatches.length} live matches`);

      // 2. Normalize matches and filter (minute=0 maçları ASLA almeyelim)
      const normalizedMatches = liveMatches.map(normalizeSmMatch);
      
      // 🔥 DEBUG: Her maçın minute verisini logla
      for (const m of normalizedMatches) {
        console.log(`🔥 RAW MINUTE DEBUG: ${m.home_team} vs ${m.away_team} | minute=${m.minute} | status=${m.status} | raw_time=${JSON.stringify(m.raw_time)}`);
      }
      
      const relevantMatches = normalizedMatches
        .filter((m) =>
          this.config.supportedLeagues.includes(Number(m.league_id)) &&
          this.isLiveMatch(m) // 🎯 STATUS-AWARE: SportMonks minute sorunu için status fallback
        )
        .slice(0, this.config.maxConcurrentMatches);
      
      console.log(`🎯 Relevant matches after filtering: ${relevantMatches.length}/${liveMatches.length}`);
      
      // Debug: Show actual league IDs in live matches
      const actualLeagueIds = Array.from(new Set(liveMatches.map(match => match.league_id)));
      console.log(`🔍 Actual league IDs in live matches: ${actualLeagueIds.join(', ')}`);
      console.log(`📋 Supported league IDs: ${this.config.supportedLeagues.join(', ')}`);

      // 3. Update system metrics
      await this.updateSystemMetrics(liveMatches.length, startTime);

      // 4. Collect signal candidates from all matches
      const signalCandidates: SignalCandidate[] = [];
      for (const match of relevantMatches) {
        try {
          // Debug log raw_time için
          console.log(
            `🔥 BEFORE MS: ${match.home_team} vs ${match.away_team} | minute=${match.minute} | raw_time=${JSON.stringify(match.raw_time)}`
          );
          
          const candidates = await this.processMatchForCandidates(match);
          if (candidates && Array.isArray(candidates)) {
            signalCandidates.push(...candidates);
          }
        } catch (error) {
          console.error(`Error processing match ${match.match_id}:`, error);
        }
      }

      // 5. Process candidates through Active Signal Service
      console.log(`🎯 Processing ${signalCandidates.length} signal candidates`);
      const activeSignalSummaries = this.activeSignalService.update(signalCandidates);
      
      // 🛡️ Check if any match minute has progressed (force broadcast)
      let shouldForceBroadcast = false;
      for (const candidate of signalCandidates) {
        const prevMinute = this.lastBroadcastMinute.get(candidate.matchId) || 0;
        if (candidate.minute > prevMinute) {
          this.lastBroadcastMinute.set(candidate.matchId, candidate.minute);
          shouldForceBroadcast = true;
          console.log(`📡 BROADCAST TRIGGER: ${candidate.homeTeam} vs ${candidate.awayTeam} | minute=${candidate.minute} (prev=${prevMinute})`);
        }
      }
      
      // 6. Save ACTIVE signals to database (only newly active ones)
      await this.saveActiveSignalsToDatabase(activeSignalSummaries);

      // 7. Clean up expired signals
      await this.cleanupExpiredSignals();

      // 8. Update RL agent with experience replay
      this.rlAgent.replayExperience();

      // 9. Update RL agent stats
      await this.updateRLAgentStats();

      // 10. Broadcast active signals via WebSocket (forced if minute progressed)
      this.broadcastActiveSignals(shouldForceBroadcast);

      const duration = Date.now() - startTime;
      console.log(`✅ Main loop completed in ${duration}ms`);
      console.log(`📊 Active Signal Service stats:`, this.activeSignalService.getStats());

    } catch (error) {
      console.error('❌ Error in main loop:', error);
    }
  }

  private async processMatchForCandidates(normalizedMatch: any): Promise<SignalCandidate[]> {
    const candidates: SignalCandidate[] = [];
    try {
      console.log(`🔍 NORMALIZED MATCH: id=${normalizedMatch.match_id}, home=${normalizedMatch.home_team}, away=${normalizedMatch.away_team}, minute=${normalizedMatch.minute}`);
      
      // 2. Get league information from database
      const leagueInfo = await storage.getSupportedLeague(normalizedMatch.league_id);
      const leagueName = leagueInfo?.name || 'Unknown League';

      // 3. Update or create match in storage
      let match = await storage.getMatchByExternalId(normalizedMatch.match_id.toString());
      if (!match) {
        match = await storage.createMatch({
          externalId: normalizedMatch.match_id.toString(),
          homeTeam: normalizedMatch.home_team,
          awayTeam: normalizedMatch.away_team,
          league: leagueName,
          leagueId: normalizedMatch.league_id,
          status: 'live',
          minute: normalizedMatch.minute,
          homeScore: normalizedMatch.score_home,
          awayScore: normalizedMatch.score_away,
          startTime: new Date(),  // normalized format doesn't have starting_at
          statistics: {},  // will be added later if needed
          events: {},      // will be added later if needed
          odds: {}         // will be added later if needed
        });
      } else {
        // Update existing match
        await storage.updateMatch(match.id, {
          minute: normalizedMatch.minute,
          homeScore: normalizedMatch.score_home,
          awayScore: normalizedMatch.score_away,
          status: normalizedMatch.status || 'live'
        });
        // 🔥 UPDATE: Sync local match object with normalized minute (cache-inflated value)
        match.minute = normalizedMatch.minute;
        match.homeScore = normalizedMatch.score_home;
        match.awayScore = normalizedMatch.score_away;
      }

      // 3. Get FootyStats data for additional insights
      const footyStatsData = await this.footyStatsClient.getPreMatchTrends(
        normalizedMatch.home_team,
        normalizedMatch.away_team
      );

      // 3.5. 🔧 Update match with correct team names and league name (fixes Unknown vs Unknown issue)
      if (footyStatsData && normalizedMatch.home_team && normalizedMatch.away_team) {
        await storage.updateMatch(match.id, {
          homeTeam: normalizedMatch.home_team,
          awayTeam: normalizedMatch.away_team,
          league: leagueName
        });
        // Update local match object for signal creation
        match.homeTeam = normalizedMatch.home_team;
        match.awayTeam = normalizedMatch.away_team;
        match.league = leagueName;
      }

      // 4. Analyze markets with FootyStats
      console.log(`🔍 Processing FootyStats for ${normalizedMatch.home_team} vs ${normalizedMatch.away_team}`);
      
      console.log(`🔥 BEFORE MARKET SELECTOR: homeTeam=${normalizedMatch.home_team}, awayTeam=${normalizedMatch.away_team}, minute=${normalizedMatch.minute}`);
      console.log(`🔥 MARKET SELECTOR DATA: sportMonks=${!!normalizedMatch}, footyStats=${!!footyStatsData}, matchScore=${match.homeScore}-${match.awayScore}`);
      
      const marketAnalyses = this.marketSelector.analyzeMatch({
        sportMonksData: normalizedMatch,
        footyStatsData: footyStatsData,
        matchInfo: {
          homeTeam: normalizedMatch.home_team,
          awayTeam: normalizedMatch.away_team,
          homeScore: match.homeScore,
          awayScore: match.awayScore,
          minute: normalizedMatch.minute
        }
      });
      
      console.log(`🔥 AFTER MARKET SELECTOR: returned ${marketAnalyses.length} analyses`);
      console.log(`📊 Market analyses found: ${marketAnalyses.length}`);

      // 5. Process each market analysis through RL agent to create candidates
      for (const analysis of marketAnalyses) {
        console.log(`🎯 Processing market: ${analysis.market} with confidence: ${analysis.confidence}%`);
        const candidate = await this.createSignalCandidate(analysis, match, footyStatsData);
        if (candidate) {
          candidates.push(candidate);
        }
      }

    } catch (error) {
      console.error(`Error processing match ${normalizedMatch.match_id}:`, error);
    }
    
    return candidates;
  }

  private async createSignalCandidate(analysis: any, match: any, footyStatsData?: any): Promise<SignalCandidate | null> {
    try {
      console.log(`🤖 RL AGENT ENTRY: ${match.homeTeam} vs ${match.awayTeam} - ${analysis.market} (${analysis.confidence}%)`);      // 🎯 ODDS CONFIGURATION (default values, can be loaded from database)
      const oddsConfig: OddsConfig = {
        minOddsDefault: 1.80,
        minOddsPerMarket: {
          'over_under': 1.80,
          'btts': 1.70,
          'next_goal': 2.10
        },
        bookmakerWhitelist: ['Pinnacle', 'Bet365', 'Marathon', '1xBet'],
        valueMargin: 0.10,
        movementWindowSecs: 300,
        movementMinChange: 0.10
      };
      
      // 1. Check market settings
      const marketSetting = await storage.getMarketSetting(analysis.market);
      console.log(`🔧 Market setting for ${analysis.market}: enabled=${marketSetting?.enabled}, minConf=${marketSetting?.minConfidence}`);
      if (!marketSetting || !marketSetting.enabled) {
        console.log(`❌ REJECTED: Market ${analysis.market} not enabled or not found`);
        return null;
      }

      // 2. Check if confidence meets minimum threshold
      if (analysis.confidence < parseFloat(marketSetting.minConfidence)) {
        console.log(`❌ REJECTED: Confidence ${analysis.confidence}% < required ${marketSetting.minConfidence}%`);
        return null;
      }

      // 3. Check if we already have enough signals for this match/market
      const existingSignals = await storage.getSignalsByMatch(match.id);
      const marketSignals = existingSignals.filter(s => s.market === analysis.market && s.status === 'active');
      console.log(`🔢 Existing signals for ${analysis.market}: ${marketSignals.length}/${marketSetting.maxSignalsPerMatch || 2}`);
      if (marketSignals.length >= (marketSetting.maxSignalsPerMatch || 2)) {
        console.log(`❌ REJECTED: Too many signals for market ${analysis.market}`);
        return null;
      }

      // 4. Evaluate through RL agent with FootyStats data
      console.log(`🎲 RL Agent evaluating signal...`);
      const rlEvaluation = this.rlAgent.evaluateSignal(analysis, {
        homeTeam: match.homeTeam,
        awayTeam: match.awayTeam,
        homeScore: match.homeScore,
        awayScore: match.awayScore,
        minute: match.minute
      }, footyStatsData);

      console.log(`🎯 RL Agent decision: shouldGenerate=${rlEvaluation.shouldGenerate}, adjustedConf=${rlEvaluation.adjustedConfidence}%`);
      if (!rlEvaluation.shouldGenerate) {
        console.log(`❌ REJECTED: RL Agent decided not to generate signal`);
        return null;
      }

      // 5. 💰 ODDS ENRICHMENT: Select best odds from bookmakers
      let bestOdds = null;
      let oddsValue: number | undefined = undefined;
      let bookmakerName: string | undefined = undefined;
      
      // 🐛 DEBUG: Check odds data availability and structure
      const hasMatchOdds = !!(match.odds && (Array.isArray(match.odds?.data) ? match.odds.data.length > 0 : match.odds));
      const hasAnalysisOdds = !!(analysis.data?.odds && (Array.isArray(analysis.data.odds?.data) ? analysis.data.odds.data.length > 0 : analysis.data.odds));
      console.log(`🔍 ODDS DEBUG: match.odds=${hasMatchOdds}, analysis.data.odds=${hasAnalysisOdds}`);
      
      if (match.odds) {
        console.log(`🔍 ODDS STRUCTURE: type=${Array.isArray(match.odds) ? 'array' : typeof match.odds}, keys=${Object.keys(match.odds).join(',')}`);
        if (Array.isArray(match.odds) && match.odds.length > 0) {
          console.log(`🔍 FIRST ODDS ITEM: ${JSON.stringify(match.odds[0]).substring(0, 300)}`);
        } else if (match.odds.data) {
          console.log(`🔍 ODDS.DATA: type=${Array.isArray(match.odds.data) ? 'array' : typeof match.odds.data}, length=${Array.isArray(match.odds.data) ? match.odds.data.length : 'N/A'}`);
          if (Array.isArray(match.odds.data) && match.odds.data.length > 0) {
            console.log(`🔍 FIRST ODDS.DATA ITEM: ${JSON.stringify(match.odds.data[0]).substring(0, 300)}`);
          }
        } else {
          console.log(`🔍 ODDS RAW: ${JSON.stringify(match.odds).substring(0, 500)}`);
        }
      }
      
      if (match.odds || analysis.data?.odds) {
        const oddsPayload = match.odds || analysis.data.odds;
        bestOdds = selectBestOdds(
          oddsPayload,
          analysis.market,
          oddsConfig.bookmakerWhitelist
        );
        
        if (bestOdds) {
          oddsValue = bestOdds.odds;
          bookmakerName = bestOdds.bookmaker;
          console.log(`💰 Best odds found: ${oddsValue} from ${bookmakerName}`);
        }
      }

      // 6. 🚫 MINIMUM ODDS FILTER: Reject if odds too low
      const minOddsFilterDisabled = process.env.MIN_ODDS_FILTER_DISABLED === '1';
      
      if (oddsValue !== undefined && !minOddsFilterDisabled) {
        if (!meetsMinimumOdds(oddsValue, oddsConfig, analysis.market)) {
          const minRequired = oddsConfig.minOddsPerMarket[analysis.market] || oddsConfig.minOddsDefault;
          console.log(`❌ REJECTED: Odds ${oddsValue} < minimum ${minRequired} for ${analysis.market}`);
          return null;
        }
      } else if (oddsValue === undefined) {
        // No odds available - in oddsless mode, this is expected
        console.log(`⚠️ WARNING: No odds data available for ${analysis.market}`);
      }

      // 7. 📊 VALUE BET DETECTION
      let isValueBet = false;
      let valueScore: number | undefined = undefined;
      let impliedProb: number | undefined = undefined;
      
      if (oddsValue) {
        const modelProbability = rlEvaluation.adjustedConfidence / 100;
        const valueBetResult = calculateValueBet(
          modelProbability,
          oddsValue,
          oddsConfig.valueMargin
        );
        
        isValueBet = valueBetResult.isValueBet;
        valueScore = valueBetResult.valueScore;
        impliedProb = valueBetResult.impliedProbability;
        
        if (isValueBet) {
          console.log(`🎯 VALUE BET: Model ${(modelProbability * 100).toFixed(1)}% > Implied ${(impliedProb * 100).toFixed(1)}% (margin: ${(valueScore * 100).toFixed(1)}%)`);
        }
      }

      // 8. Create signal candidate (not database signal)
      const candidate: SignalCandidate = {
        id: `${match.id}:${analysis.market}`,
        matchId: match.id,
        market: analysis.market,
        selection: analysis.selection,
        homeTeam: match.homeTeam || 'Unknown',
        awayTeam: match.awayTeam || 'Unknown', 
        league: match.league || 'Unknown League',
        confidence: rlEvaluation.adjustedConfidence,
        minute: match.minute || 0,
        liquidityOk: true, // Assume OK, could be enhanced with real liquidity checks
        ttlSeconds: this.config.signalTTL * 60, // Convert minutes to seconds
        state: 'PRE',
        reasoning: rlEvaluation.reasoning,
        createdTs: Date.now(),
        lastUpdateTs: Date.now(),
        odds: oddsValue,
        bookmaker: bookmakerName,
        isValueBet,
        impliedProbability: impliedProb,
        valueScore,
        meta: {
          footyStatsData: footyStatsData ? { btts: footyStatsData.btts, over25: footyStatsData.over25 } : {},
          marketSetting: { minConfidence: marketSetting.minConfidence, maxSignalsPerMatch: marketSetting.maxSignalsPerMatch },
          oddsData: bestOdds ? { bookmaker: bookmakerName, odds: oddsValue, isValueBet } : null
        }
      };

      console.log(`🌟 Created signal candidate: ${match.homeTeam} vs ${match.awayTeam} - ${analysis.market} ${analysis.selection} (${rlEvaluation.adjustedConfidence.toFixed(1)}%)`);
      return candidate;

    } catch (error) {
      console.error('Error creating signal candidate:', error);
      return null;
    }
  }

  /**
   * Save ACTIVE signals to database (only newly active ones)
   */
  private async saveActiveSignalsToDatabase(activeSignals: any[]): Promise<void> {
    try {
      for (const activeSignal of activeSignals) {
        // Check if signal already exists in database
        const existingSignals = await storage.getSignalsByMatch(activeSignal.matchId);
        const existingSignal = existingSignals.find(s => 
          s.market === activeSignal.market && 
          s.selection === activeSignal.selection &&
          s.status === 'active'
        );

        if (!existingSignal) {
          // Create new signal in database
          const expiresAt = new Date();
          expiresAt.setSeconds(expiresAt.getSeconds() + activeSignal.ttlLeft);

          await storage.createSignal({
            matchId: activeSignal.matchId,
            market: activeSignal.market,
            selection: activeSignal.selection,
            confidence: activeSignal.confidence.toString(),
            reasoning: activeSignal.reasoning,
            status: 'active',
            expiresAt
          });

          console.log(`💾 Saved ACTIVE signal to DB: ${activeSignal.homeTeam} vs ${activeSignal.awayTeam} - ${activeSignal.market} (${activeSignal.confidence}%)`);
        }
      }
    } catch (error) {
      console.error('Error saving active signals to database:', error);
    }
  }

  /**
   * Broadcast active signals via WebSocket
   * @param forced - If true, forces broadcast even if no changes detected
   */
  private broadcastActiveSignals(forced: boolean = false): void {
    try {
      if (!this.wss) return;

      const snapshot = this.activeSignalService.getSnapshot();
      const message = JSON.stringify({
        type: 'active_signals_update',
        data: snapshot,
        forced // Include forced flag for debugging
      });

      // Broadcast to all connected WebSocket clients
      this.wss.clients.forEach(client => {
        if (client.readyState === 1) { // WebSocket.OPEN
          try {
            client.send(message);
          } catch (error) {
            console.error('Error sending WebSocket message:', error);
          }
        }
      });

      const broadcastType = forced ? 'FORCED' : 'normal';
      console.log(`📡 Broadcasted (${broadcastType}) active signals to ${this.wss.clients.size} clients`);
    } catch (error) {
      console.error('Error broadcasting active signals:', error);
    }
  }

  /**
   * Get Active Signal Service instance (for API access)
   */
  public getActiveSignalService(): ActiveSignalService {
    return this.activeSignalService;
  }

  private extractScore(scores: any[], team: 'home' | 'away'): number {
    try {
      const scoreData = scores.find(s => s.score_type === 'current');
      if (!scoreData) return 0;
      
      return team === 'home' ? (scoreData.localteam_score || 0) : (scoreData.visitorteam_score || 0);
    } catch (error) {
      return 0;
    }
  }

  // 🚨 STATUS-AWARE LIVE DETECTION: SportMonks minute sorunu için fallback
  private isLiveMatch(match: any): boolean {
    const status = (match.status || '').toString().toUpperCase();
    
    // ⏸️ DURAKLAMA KONTROLÜ: Devre arası, maç durumu gibi durumlarda sinyal üretme
    const pausedStatuses = [
      'HALFTIME', 'HT', 'BREAK', 'PAUSE', 'AWAITING_PENALTIES', 'AWAITING_EXTRA_TIME'
    ];
    
    if (pausedStatuses.includes(status)) {
      console.log(`⏸️ PAUSED: ${match.home_team} vs ${match.away_team} | status=${status} | SKIPPING (match paused)`);
      return false;
    }
    
    // 1) Minute data varsa ve > 0 ise kesin live
    if (match.minute && match.minute > 0) {
      return true;
    }

    // 2) Minute yoksa ama status live gösteriyorsa kabul et
    const liveStatuses = [
      'LIVE', 'INPLAY', '1ST_HALF', '2ND_HALF',
      '1H', '2H', 'ET', 'AET', 'EXTRA_TIME', 'PEN', 'PENALTIES'
    ];
    
    const isLiveByStatus = liveStatuses.includes(status);
    
    // 3) Log fallback kullanımı
    if (isLiveByStatus && (!match.minute || match.minute === 0)) {
      console.log(`⚡ STATUS FALLBACK: ${match.home_team} vs ${match.away_team} | minute=${match.minute} | status=${status} | ACCEPTING as live`);
    }
    
    // 4) 🚨 EMERGENCY FALLBACK: SportMonks livescores API tamamen bozuk
    // minute=0, status=undefined ama kullanıcı maçların live olduğunu onayladı
    const EMERGENCY_FALLBACK = process.env.SPORTMONKS_EMERGENCY_FALLBACK !== '0';
    if (EMERGENCY_FALLBACK && (!match.minute || match.minute === 0) && (!status || status === '')) {
      console.log(`🚨 EMERGENCY FALLBACK: ${match.home_team} vs ${match.away_team} | SportMonks data broken, assuming LIVE`);
      return true;
    }
    
    return isLiveByStatus;
  }

  private async updateSystemMetrics(activeMatches: number, startTime: number): Promise<void> {
    try {
      const responseTime = Date.now() - startTime;
      const memoryUsage = process.memoryUsage();
      
      // Calculate success rate from recent signals
      const recentSignals = await storage.getSignalHistory(100);
      const wonSignals = recentSignals.filter(s => s.status === 'won').length;
      const completedSignals = recentSignals.filter(s => s.status === 'won' || s.status === 'lost').length;
      const successRate = completedSignals > 0 ? (wonSignals / completedSignals) * 100 : 0;

      // Calculate total profit
      const totalProfit = recentSignals.reduce((sum, signal) => {
        const profit = parseFloat(signal.profit || '0');
        return sum + profit;
      }, 0);

      // Count today's signals
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const signalsToday = recentSignals.filter(s => 
        s.createdAt && s.createdAt >= today
      ).length;

      await storage.createSystemMetrics({
        apiResponseTime: responseTime,
        memoryUsage: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`,
        successRate: successRate.toString(),
        totalProfit: totalProfit.toString(),
        activeMatches,
        signalsToday
      });

    } catch (error) {
      console.error('Error updating system metrics:', error);
    }
  }

  private async updateRLAgentStats(): Promise<void> {
    try {
      const metrics = this.rlAgent.getPerformanceMetrics();
      
      await storage.createRlAgentStats({
        learningRate: metrics.learningRate.toString(),
        epsilon: metrics.epsilon.toString(),
        bufferSize: metrics.bufferSize,
        bufferCapacity: metrics.bufferCapacity,
        recentPerformance: metrics.recentPerformance.toString(),
        status: metrics.status,
        lastUpdate: new Date()
      });

    } catch (error) {
      console.error('Error updating RL agent stats:', error);
    }
  }

  private async cleanupExpiredSignals(): Promise<void> {
    try {
      const activeSignals = await storage.getActiveSignals();
      const now = new Date();

      for (const signal of activeSignals) {
        if (signal.expiresAt <= now) {
          await storage.updateSignal(signal.id, { status: 'expired' });
          
          // Track signal outcome as void/expired
          await this.performanceTracker.trackSignalOutcome(signal.id, 'void');
          
          // Update RL agent with expired signal feedback using signal ID
          this.rlAgent.updateFromResult(signal.id, 'expired');
        }
      }
    } catch (error) {
      console.error('Error cleaning up expired signals:', error);
    }
  }

  private broadcastUpdates(): void {
    if (!this.wss) return;

    try {
      this.wss.clients.forEach(client => {
        if (client.readyState === 1) { // WebSocket.OPEN
          client.send(JSON.stringify({
            type: 'system_update',
            timestamp: new Date().toISOString()
          }));
        }
      });
    } catch (error) {
      console.error('Error broadcasting updates:', error);
    }
  }

  // Public methods for manual operations
  getRLAgent(): RLAgent {
    return this.rlAgent;
  }

  async generateSignalForMatch(matchId: string): Promise<any[]> {
    try {
      const match = await storage.getMatch(matchId);
      if (!match) {
        throw new Error('Match not found');
      }

      // Get fresh data from SportMonks
      const matchDetails = await this.sportMonksClient.getMatchDetails(parseInt(match.externalId));
      if (!matchDetails) {
        throw new Error('Failed to fetch match details');
      }

      const processedMatch = await this.sportMonksClient.processMatchData(matchDetails);
      
      // Get FootyStats data
      const footyStatsData = await this.footyStatsClient.getPreMatchTrends(
        match.homeTeam,
        match.awayTeam
      );

      // Analyze markets
      const marketAnalyses = this.marketSelector.analyzeMatch({
        sportMonksData: processedMatch,
        footyStatsData: this.footyStatsClient.processFootyStatsData(footyStatsData),
        matchInfo: {
          homeTeam: match.homeTeam,
          awayTeam: match.awayTeam,
          homeScore: match.homeScore,
          awayScore: match.awayScore,
          minute: processedMatch.time?.minute
        }
      });

      const generatedSignals = [];
      for (const analysis of marketAnalyses) {
        const rlEvaluation = this.rlAgent.evaluateSignal(analysis, {
          homeTeam: match.homeTeam,
          awayTeam: match.awayTeam,
          homeScore: match.homeScore,
          awayScore: match.awayScore,
          minute: match.minute
        }, footyStatsData);

        if (rlEvaluation.shouldGenerate) {
          generatedSignals.push({
            ...analysis,
            adjustedConfidence: rlEvaluation.adjustedConfidence,
            reasoning: rlEvaluation.reasoning
          });
        }
      }

      return generatedSignals;
    } catch (error) {
      console.error('Error generating manual signal:', error);
      throw error;
    }
  }

  getEngineStatus(): any {
    return {
      isRunning: this.isRunning,
      config: this.config,
      uptime: this.intervalId ? 'Running' : 'Stopped'
    };
  }
}
