import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { CoreEngine } from "./services/core-engine";
import { initializeDatabase } from "./init-data";
import { 
  insertMarketSettingsSchema, 
  insertSystemConfigSchema,
  insertSupportedLeagueSchema 
} from "@shared/schema";

let coreEngine: CoreEngine;

export async function registerRoutes(app: Express): Promise<Server> {
  const httpServer = createServer(app);

  // Initialize database with default data
  await initializeDatabase();

  // Initialize WebSocket server
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  // Initialize Core Engine
  const sportMonksApiKey = process.env.SPORTMONKS_API_KEY;
  const footyStatsApiKey = process.env.FOOTYSTATS_API_KEY;

  if (!sportMonksApiKey || !footyStatsApiKey) {
    console.error('Missing required API keys. Please set SPORTMONKS_API_KEY and FOOTYSTATS_API_KEY environment variables.');
  } else {
    coreEngine = new CoreEngine(sportMonksApiKey, footyStatsApiKey, wss);
    
    // Start the engine after a brief delay to allow server to fully initialize
    setTimeout(() => {
      coreEngine.startEngine().catch(console.error);
    }, 2000);
  }

  // WebSocket connection handling
  wss.on('connection', (ws: WebSocket) => {
    console.log('WebSocket client connected');
    
    ws.on('message', (message: string) => {
      try {
        const data = JSON.parse(message);
        console.log('WebSocket message received:', data);
        
        // Handle different message types
        switch (data.type) {
          case 'get_active_signals':
            handleGetActiveSignals(ws);
            break;
          case 'get_system_status':
            handleGetSystemStatus(ws);
            break;
          default:
            console.log('Unknown WebSocket message type:', data.type);
        }
      } catch (error) {
        console.error('Error handling WebSocket message:', error);
      }
    });

    ws.on('close', () => {
      console.log('WebSocket client disconnected');
    });

    // Send initial data
    handleGetActiveSignals(ws);
    handleGetSystemStatus(ws);
  });

  // REST API Routes

  // Get active signals (using ActiveSignalService)
  app.get("/api/signals/active", async (req, res) => {
    try {
      if (!coreEngine) {
        // Fallback to database if core engine not available
        const signals = await storage.getActiveSignals();
        const signalsWithMatches = await Promise.all(
          signals.map(async (signal) => {
            const match = await storage.getMatch(signal.matchId);
            return { ...signal, match };
          })
        );
        return res.json(signalsWithMatches);
      }

      // Use ActiveSignalService for real-time active signals
      const activeSignalService = coreEngine.getActiveSignalService();
      const snapshot = activeSignalService.getSnapshot();
      
      // Enhanced response with both active signals and stats
      res.json({
        active: snapshot.active,
        counts: snapshot.counts,
        stats: activeSignalService.getStats(),
        timestamp: Date.now()
      });
    } catch (error) {
      console.error('Error fetching active signals:', error);
      res.status(500).json({ error: 'Failed to fetch active signals' });
    }
  });

  // Get signal history
  app.get("/api/signals/history", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const signals = await storage.getSignalHistory(limit);
      const signalsWithMatches = await Promise.all(
        signals.map(async (signal) => {
          const match = await storage.getMatch(signal.matchId);
          return { ...signal, match };
        })
      );
      res.json(signalsWithMatches);
    } catch (error) {
      console.error('Error fetching signal history:', error);
      res.status(500).json({ error: 'Failed to fetch signal history' });
    }
  });

  // Get system metrics
  app.get("/api/system/metrics", async (req, res) => {
    try {
      const metrics = await storage.getLatestSystemMetrics();
      res.json(metrics);
    } catch (error) {
      console.error('Error fetching system metrics:', error);
      res.status(500).json({ error: 'Failed to fetch system metrics' });
    }
  });

  // Get RL agent stats
  app.get("/api/rl-agent/stats", async (req, res) => {
    try {
      // Get enhanced metrics directly from the RL agent if available
      if (coreEngine && typeof coreEngine.getRLAgent === 'function') {
        try {
          const rlAgent = coreEngine.getRLAgent();
          if (rlAgent && typeof rlAgent.getPerformanceMetrics === 'function') {
            const enhancedMetrics = rlAgent.getPerformanceMetrics();
            // Also include basic database stats for compatibility
            const dbStats = await storage.getLatestRlAgentStats();
            res.json({
              ...dbStats,
              enhancedMetrics
            });
            return;
          }
        } catch (rlError) {
          console.error('Error getting enhanced RL metrics:', rlError);
          // Continue to fallback
        }
      }
      
      // Fallback to database stats if RL agent not available
      const stats = await storage.getLatestRlAgentStats();
      res.json(stats);
    } catch (error) {
      console.error('Error fetching RL agent stats:', error);
      res.status(500).json({ error: 'Failed to fetch RL agent stats' });
    }
  });

  // Get market settings
  app.get("/api/settings/markets", async (req, res) => {
    try {
      const settings = await storage.getMarketSettings();
      res.json(settings);
    } catch (error) {
      console.error('Error fetching market settings:', error);
      res.status(500).json({ error: 'Failed to fetch market settings' });
    }
  });

  // Update market setting
  app.patch("/api/settings/markets/:market", async (req, res) => {
    try {
      const { market } = req.params;
      const updateData = req.body;
      
      const updatedSetting = await storage.updateMarketSetting(market, updateData);
      if (!updatedSetting) {
        return res.status(404).json({ error: 'Market setting not found' });
      }
      
      res.json(updatedSetting);
    } catch (error) {
      console.error('Error updating market setting:', error);
      res.status(500).json({ error: 'Failed to update market setting' });
    }
  });

  // Get system configuration
  app.get("/api/settings/system", async (req, res) => {
    try {
      const config = await storage.getSystemConfig();
      res.json(config);
    } catch (error) {
      console.error('Error fetching system config:', error);
      res.status(500).json({ error: 'Failed to fetch system config' });
    }
  });

  // Update system configuration
  app.patch("/api/settings/system/:key", async (req, res) => {
    try {
      const { key } = req.params;
      const { value } = req.body;
      
      await storage.setConfigValue(key, value);
      res.json({ success: true });
    } catch (error) {
      console.error('Error updating system config:', error);
      res.status(500).json({ error: 'Failed to update system config' });
    }
  });

  // Get supported leagues
  app.get("/api/leagues", async (req, res) => {
    try {
      const leagues = await storage.getSupportedLeagues();
      res.json(leagues);
    } catch (error) {
      console.error('Error fetching supported leagues:', error);
      res.status(500).json({ error: 'Failed to fetch supported leagues' });
    }
  });

  // Update league settings
  app.patch("/api/leagues/:leagueId", async (req, res) => {
    try {
      const leagueId = parseInt(req.params.leagueId);
      const updateData = req.body;
      
      const updatedLeague = await storage.updateSupportedLeague(leagueId, updateData);
      if (!updatedLeague) {
        return res.status(404).json({ error: 'League not found' });
      }
      
      res.json(updatedLeague);
    } catch (error) {
      console.error('Error updating league:', error);
      res.status(500).json({ error: 'Failed to update league' });
    }
  });

  // Performance Analytics Routes
  
  // Get market performance analytics
  app.get("/api/analytics/market-performance", async (req, res) => {
    try {
      const { timeframe = 'daily' } = req.query;
      const marketPerformance = await storage.getAllMarketPerformance(timeframe as string);
      res.json(marketPerformance);
    } catch (error) {
      console.error('Error fetching market performance:', error);
      res.status(500).json({ error: 'Failed to fetch market performance' });
    }
  });

  // Get signal performance history for a specific market
  app.get("/api/analytics/performance/:market", async (req, res) => {
    try {
      const { market } = req.params;
      const { limit = 50 } = req.query;
      const performance = await storage.getPerformanceByMarket(market, parseInt(limit as string));
      res.json(performance);
    } catch (error) {
      console.error('Error fetching signal performance:', error);
      res.status(500).json({ error: 'Failed to fetch signal performance' });
    }
  });

  // Get overall performance statistics
  app.get("/api/analytics/stats", async (req, res) => {
    try {
      const stats = await storage.getPerformanceStats();
      res.json(stats);
    } catch (error) {
      console.error('Error fetching performance stats:', error);
      res.status(500).json({ error: 'Failed to fetch performance stats' });
    }
  });

  // Get best performing markets
  app.get("/api/analytics/best-markets", async (req, res) => {
    try {
      const { limit = 5 } = req.query;
      const bestMarkets = await storage.getBestPerformingMarkets(parseInt(limit as string));
      res.json(bestMarkets);
    } catch (error) {
      console.error('Error fetching best markets:', error);
      res.status(500).json({ error: 'Failed to fetch best markets' });
    }
  });

  // Get daily analytics history
  app.get("/api/analytics/daily", async (req, res) => {
    try {
      const { days = 30 } = req.query;
      const analytics = await storage.getAnalyticsHistory(parseInt(days as string));
      res.json(analytics);
    } catch (error) {
      console.error('Error fetching daily analytics:', error);
      res.status(500).json({ error: 'Failed to fetch daily analytics' });
    }
  });

  // Calculate win rate for specific market or overall
  app.get("/api/analytics/win-rate", async (req, res) => {
    try {
      const { market, days } = req.query;
      const winRate = await storage.calculateWinRate(
        market as string, 
        days ? parseInt(days as string) : undefined
      );
      res.json({ winRate });
    } catch (error) {
      console.error('Error calculating win rate:', error);
      res.status(500).json({ error: 'Failed to calculate win rate' });
    }
  });

  // Calculate total profit for specific market or overall
  app.get("/api/analytics/profit", async (req, res) => {
    try {
      const { market, days } = req.query;
      const totalProfit = await storage.calculateTotalProfit(
        market as string, 
        days ? parseInt(days as string) : undefined
      );
      res.json({ totalProfit });
    } catch (error) {
      console.error('Error calculating total profit:', error);
      res.status(500).json({ error: 'Failed to calculate total profit' });
    }
  });

  // Get live matches
  app.get("/api/matches/live", async (req, res) => {
    try {
      const matches = await storage.getLiveMatches();
      res.json(matches);
    } catch (error) {
      console.error('Error fetching live matches:', error);
      res.status(500).json({ error: 'Failed to fetch live matches' });
    }
  });

  // Manual signal generation
  app.post("/api/matches/:matchId/generate-signals", async (req, res) => {
    try {
      if (!coreEngine) {
        return res.status(503).json({ error: 'Core engine not initialized' });
      }

      const { matchId } = req.params;
      const signals = await coreEngine.generateSignalForMatch(matchId);
      res.json(signals);
    } catch (error) {
      console.error('Error generating manual signals:', error);
      res.status(500).json({ error: 'Failed to generate signals' });
    }
  });

  // Get engine status
  app.get("/api/engine/status", async (req, res) => {
    try {
      if (!coreEngine) {
        return res.json({ status: 'not_initialized' });
      }

      const status = coreEngine.getEngineStatus();
      res.json(status);
    } catch (error) {
      console.error('Error fetching engine status:', error);
      res.status(500).json({ error: 'Failed to fetch engine status' });
    }
  });

  // Market performance analytics
  app.get("/api/analytics/market-performance", async (req, res) => {
    try {
      const signals = await storage.getSignalHistory(1000); // Get larger sample
      
      const marketPerformance = signals.reduce((acc: any, signal) => {
        if (!acc[signal.market]) {
          acc[signal.market] = {
            market: signal.market,
            totalSignals: 0,
            wonSignals: 0,
            lostSignals: 0,
            totalProfit: 0
          };
        }
        
        acc[signal.market].totalSignals++;
        
        if (signal.status === 'won') {
          acc[signal.market].wonSignals++;
          acc[signal.market].totalProfit += parseFloat(signal.profit || '0');
        } else if (signal.status === 'lost') {
          acc[signal.market].lostSignals++;
          acc[signal.market].totalProfit += parseFloat(signal.profit || '0');
        }
        
        return acc;
      }, {});

      // Calculate win rates and format data
      const performanceData = Object.values(marketPerformance).map((market: any) => {
        const completedSignals = market.wonSignals + market.lostSignals;
        const winRate = completedSignals > 0 ? (market.wonSignals / completedSignals) * 100 : 0;
        
        return {
          ...market,
          winRate: winRate.toFixed(1),
          profit: market.totalProfit.toFixed(2)
        };
      });

      res.json(performanceData);
    } catch (error) {
      console.error('Error fetching market performance:', error);
      res.status(500).json({ error: 'Failed to fetch market performance' });
    }
  });

  return httpServer;
}

// WebSocket helper functions
async function handleGetActiveSignals(ws: WebSocket) {
  try {
    if (!coreEngine) {
      // Fallback to database if core engine not available
      const signals = await storage.getActiveSignals();
      const signalsWithMatches = await Promise.all(
        signals.map(async (signal) => {
          const match = await storage.getMatch(signal.matchId);
          return { ...signal, match };
        })
      );

      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'active_signals',
          data: signalsWithMatches
        }));
      }
      return;
    }

    // Use ActiveSignalService for real-time active signals
    const activeSignalService = coreEngine.getActiveSignalService();
    const snapshot = activeSignalService.getSnapshot();

    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'active_signals_update',
        data: {
          active: snapshot.active,
          counts: snapshot.counts,
          stats: activeSignalService.getStats(),
          timestamp: Date.now()
        }
      }));
    }
  } catch (error) {
    console.error('Error handling WebSocket active signals request:', error);
  }
}

async function handleGetSystemStatus(ws: WebSocket) {
  try {
    const [metrics, rlStats, leagues] = await Promise.all([
      storage.getLatestSystemMetrics(),
      storage.getLatestRlAgentStats(),
      storage.getSupportedLeagues()
    ]);

    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'system_status',
        data: { metrics, rlStats, leagues }
      }));
    }
  } catch (error) {
    console.error('Error handling WebSocket system status request:', error);
  }
}
