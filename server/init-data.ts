import { storage } from "./storage";

// Initialize default market settings
const defaultMarketSettings = [
  {
    market: "over_under",
    enabled: true,
    minConfidence: "50.00",
    maxSignalsPerMatch: 2,
    description: "Over/Under 2.5 Goals"
  },
  {
    market: "btts",
    enabled: true,
    minConfidence: "45.00",
    maxSignalsPerMatch: 1,
    description: "Both Teams To Score"
  },
  {
    market: "next_goal",
    enabled: true,
    minConfidence: "40.00",
    maxSignalsPerMatch: 3,
    description: "Next Goal Team"
  },
  {
    market: "corners",
    enabled: false,
    minConfidence: "80.00",
    maxSignalsPerMatch: 1,
    description: "Total Corners Over/Under"
  },
  {
    market: "cards",
    enabled: false,
    minConfidence: "75.00",
    maxSignalsPerMatch: 1,
    description: "Total Cards Over/Under"
  }
];

// Initialize supported leagues
const supportedLeagues = [
  // Updated with actual live match league IDs from SportMonks API
  { leagueId: 82, name: "Germany Bundesliga", country: "Germany", flag: "🇩🇪", enabled: true },
  { leagueId: 444, name: "Norway Eliteserien", country: "Norway", flag: "🇳🇴", enabled: true },
  { leagueId: 384, name: "Italy Serie A", country: "Italy", flag: "🇮🇹", enabled: true },
  { leagueId: 600, name: "Turkey Super Lig", country: "Turkey", flag: "🇹🇷", enabled: true },
  { leagueId: 648, name: "Brazil Serie A", country: "Brazil", flag: "🇧🇷", enabled: true },
  { leagueId: 968, name: "J-League", country: "Japan", flag: "🇯🇵", enabled: true },
  // Keep some popular leagues with correct IDs
  { leagueId: 8, name: "Premier League", country: "England", flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", enabled: true },
  { leagueId: 564, name: "La Liga", country: "Spain", flag: "🇪🇸", enabled: true },
  { leagueId: 301, name: "Bundesliga (Old)", country: "Germany", flag: "🇩🇪", enabled: false },
  { leagueId: 2, name: "Serie A (Old)", country: "Italy", flag: "🇮🇹", enabled: false },
  { leagueId: 4, name: "Ligue 1", country: "France", flag: "🇫🇷", enabled: true },
  { leagueId: 6, name: "Eredivisie", country: "Netherlands", flag: "🇳🇱", enabled: false },
  { leagueId: 12, name: "Primeira Liga", country: "Portugal", flag: "🇵🇹", enabled: false },
  { leagueId: 13, name: "Primeira Divisão", country: "Belgium", flag: "🇧🇪", enabled: false },
  { leagueId: 271, name: "Championship", country: "England", flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", enabled: false },
  { leagueId: 333, name: "UEFA Europa League", country: "Europe", flag: "🏆", enabled: false },
  { leagueId: 132, name: "Süper Lig (Old)", country: "Turkey", flag: "🇹🇷", enabled: false },
  { leagueId: 197, name: "Brazilian Serie A (Old)", country: "Brazil", flag: "🇧🇷", enabled: false }
];

// Initialize system configuration
const systemConfig = [
  { key: "api_rate_limit", value: "60" },
  { key: "max_concurrent_requests", value: "5" },
  { key: "signal_expiry_minutes", value: "90" },
  { key: "engine_update_interval", value: "30" },
  { key: "max_signals_per_match", value: "5" },
  { key: "min_confidence_threshold", value: "40.00" }
];

export async function initializeDatabase() {
  console.log("🔄 Initializing database with default data...");

  try {
    // Initialize market settings
    for (const setting of defaultMarketSettings) {
      const existing = await storage.getMarketSetting(setting.market);
      if (!existing) {
        await storage.createMarketSetting(setting);
        console.log(`✅ Created market setting: ${setting.market}`);
      }
    }

    // Initialize supported leagues
    for (const league of supportedLeagues) {
      const existing = await storage.getSupportedLeague(league.leagueId);
      if (!existing) {
        await storage.createSupportedLeague(league);
        console.log(`✅ Created league: ${league.name}`);
      }
    }

    // Initialize system configuration
    for (const config of systemConfig) {
      await storage.setConfigValue(config.key, config.value);
      console.log(`✅ Set config: ${config.key} = ${config.value}`);
    }

    // Initialize initial RL agent stats
    const existingRLStats = await storage.getLatestRlAgentStats();
    if (!existingRLStats) {
      await storage.createRlAgentStats({
        learningRate: "0.01",
        epsilon: "0.1",
        bufferSize: 0,
        bufferCapacity: 10000,
        recentPerformance: "0.00",
        status: "idle"
      });
      console.log("✅ Created initial RL agent stats");
    }

    // Initialize initial system metrics
    const existingMetrics = await storage.getLatestSystemMetrics();
    if (!existingMetrics) {
      await storage.createSystemMetrics({
        apiResponseTime: 0,
        memoryUsage: "0MB",
        successRate: "0.00",
        totalProfit: "0.00",
        activeMatches: 0,
        signalsToday: 0
      });
      console.log("✅ Created initial system metrics");
    }

    console.log("✅ Database initialization completed successfully");
  } catch (error) {
    console.error("❌ Database initialization failed:", error);
    throw error;
  }
}