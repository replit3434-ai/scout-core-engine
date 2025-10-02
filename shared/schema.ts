import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, decimal, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const matches = pgTable("matches", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  externalId: varchar("external_id").notNull().unique(),
  homeTeam: text("home_team").notNull(),
  awayTeam: text("away_team").notNull(),
  league: text("league").notNull(),
  leagueId: integer("league_id").notNull(),
  status: text("status").notNull(), // "live", "finished", "upcoming"
  minute: integer("minute"),
  homeScore: integer("home_score").default(0),
  awayScore: integer("away_score").default(0),
  startTime: timestamp("start_time").notNull(),
  statistics: jsonb("statistics"), // JSON object with match stats
  events: jsonb("events"), // JSON array of match events
  odds: jsonb("odds"), // JSON object with betting odds
  createdAt: timestamp("created_at").default(sql`now()`),
  updatedAt: timestamp("updated_at").default(sql`now()`)
});

export const signals = pgTable("signals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  matchId: varchar("match_id").references(() => matches.id).notNull(),
  market: text("market").notNull(), // "over_under", "btts", "next_goal", "corners", "cards"
  selection: text("selection").notNull(), // "over", "under", "yes", "no", "home", "away"
  confidence: decimal("confidence", { precision: 5, scale: 2 }).notNull(),
  reasoning: text("reasoning").notNull(),
  status: text("status").notNull(), // "active", "won", "lost", "expired"
  result: text("result"), // actual outcome
  profit: decimal("profit", { precision: 10, scale: 2 }),
  odds: decimal("odds", { precision: 8, scale: 2 }),
  bookmaker: text("bookmaker"),
  isValueBet: boolean("is_value_bet").default(false),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").default(sql`now()`),
  updatedAt: timestamp("updated_at").default(sql`now()`)
});

export const systemMetrics = pgTable("system_metrics", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  apiResponseTime: integer("api_response_time").notNull(),
  memoryUsage: text("memory_usage").notNull(),
  successRate: decimal("success_rate", { precision: 5, scale: 2 }).notNull(),
  totalProfit: decimal("total_profit", { precision: 10, scale: 2 }).notNull(),
  activeMatches: integer("active_matches").notNull(),
  signalsToday: integer("signals_today").notNull(),
  createdAt: timestamp("created_at").default(sql`now()`)
});

export const rlAgentStats = pgTable("rl_agent_stats", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  learningRate: decimal("learning_rate", { precision: 5, scale: 4 }).notNull(),
  epsilon: decimal("epsilon", { precision: 5, scale: 4 }).notNull(),
  bufferSize: integer("buffer_size").notNull(),
  bufferCapacity: integer("buffer_capacity").notNull(),
  recentPerformance: decimal("recent_performance", { precision: 5, scale: 2 }).notNull(),
  status: text("status").notNull(), // "learning", "training", "idle"
  lastUpdate: timestamp("last_update").default(sql`now()`),
  createdAt: timestamp("created_at").default(sql`now()`)
});

export const marketSettings = pgTable("market_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  market: text("market").notNull().unique(),
  enabled: boolean("enabled").default(true),
  minConfidence: decimal("min_confidence", { precision: 5, scale: 2 }).notNull(),
  maxSignalsPerMatch: integer("max_signals_per_match").default(2),
  description: text("description"),
  createdAt: timestamp("created_at").default(sql`now()`)
});

export const systemConfig = pgTable("system_config", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  key: text("key").notNull().unique(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at").default(sql`now()`)
});

export const supportedLeagues = pgTable("supported_leagues", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  leagueId: integer("league_id").notNull().unique(),
  name: text("name").notNull(),
  country: text("country").notNull(),
  flag: text("flag").notNull(),
  enabled: boolean("enabled").default(true),
  activeMatches: integer("active_matches").default(0),
  createdAt: timestamp("created_at").default(sql`now()`)
});

export const signalPerformance = pgTable("signal_performance", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  signalId: varchar("signal_id").references(() => signals.id).notNull(),
  market: text("market").notNull(),
  confidence: decimal("confidence", { precision: 5, scale: 2 }).notNull(),
  actualResult: text("actual_result"), // "won", "lost", "void"
  profitLoss: decimal("profit_loss", { precision: 10, scale: 2 }),
  stake: decimal("stake", { precision: 10, scale: 2 }).default("10.00"),
  odds: decimal("odds", { precision: 8, scale: 2 }),
  settlementTime: timestamp("settlement_time"),
  evaluatedAt: timestamp("evaluated_at").default(sql`now()`),
  createdAt: timestamp("created_at").default(sql`now()`)
});

export const marketPerformance = pgTable("market_performance", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  market: text("market").notNull(),
  timeframe: text("timeframe").notNull(), // "daily", "weekly", "monthly"
  totalSignals: integer("total_signals").default(0),
  wonSignals: integer("won_signals").default(0),
  lostSignals: integer("lost_signals").default(0),
  voidSignals: integer("void_signals").default(0),
  winRate: decimal("win_rate", { precision: 5, scale: 2 }).default("0.00"),
  totalProfit: decimal("total_profit", { precision: 10, scale: 2 }).default("0.00"),
  avgConfidence: decimal("avg_confidence", { precision: 5, scale: 2 }).default("0.00"),
  bestStreak: integer("best_streak").default(0),
  currentStreak: integer("current_streak").default(0),
  periodStart: timestamp("period_start").notNull(),
  periodEnd: timestamp("period_end").notNull(),
  updatedAt: timestamp("updated_at").default(sql`now()`),
  createdAt: timestamp("created_at").default(sql`now()`)
});

export const dailyAnalytics = pgTable("daily_analytics", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  date: timestamp("date").notNull(),
  totalMatches: integer("total_matches").default(0),
  totalSignals: integer("total_signals").default(0),
  wonSignals: integer("won_signals").default(0),
  lostSignals: integer("lost_signals").default(0),
  winRate: decimal("win_rate", { precision: 5, scale: 2 }).default("0.00"),
  totalProfit: decimal("total_profit", { precision: 10, scale: 2 }).default("0.00"),
  bestMarket: text("best_market"),
  avgResponseTime: integer("avg_response_time").default(0),
  apiCallsCount: integer("api_calls_count").default(0),
  errorCount: integer("error_count").default(0),
  createdAt: timestamp("created_at").default(sql`now()`)
});

// Insert schemas
export const insertMatchSchema = createInsertSchema(matches).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});

export const insertSignalSchema = createInsertSchema(signals).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});

export const insertSystemMetricsSchema = createInsertSchema(systemMetrics).omit({
  id: true,
  createdAt: true
});

export const insertRlAgentStatsSchema = createInsertSchema(rlAgentStats).omit({
  id: true,
  createdAt: true
});

export const insertMarketSettingsSchema = createInsertSchema(marketSettings).omit({
  id: true,
  createdAt: true
});

export const insertSystemConfigSchema = createInsertSchema(systemConfig).omit({
  id: true,
  updatedAt: true
});

export const insertSupportedLeagueSchema = createInsertSchema(supportedLeagues).omit({
  id: true,
  createdAt: true
});

export const insertSignalPerformanceSchema = createInsertSchema(signalPerformance).omit({
  id: true,
  createdAt: true
});

export const insertMarketPerformanceSchema = createInsertSchema(marketPerformance).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});

export const insertDailyAnalyticsSchema = createInsertSchema(dailyAnalytics).omit({
  id: true,
  createdAt: true
});

// Relations
export const matchesRelations = relations(matches, ({ many }) => ({
  signals: many(signals),
}));

export const signalsRelations = relations(signals, ({ one, many }) => ({
  match: one(matches, {
    fields: [signals.matchId],
    references: [matches.id],
  }),
  performance: many(signalPerformance),
}));

export const signalPerformanceRelations = relations(signalPerformance, ({ one }) => ({
  signal: one(signals, {
    fields: [signalPerformance.signalId],
    references: [signals.id],
  }),
}));

// Active Signal Service Types
export type SignalState = 'PRE' | 'CANDIDATE' | 'ACTIVE' | 'EXPIRED';

export interface SignalCandidate {
  id: string;                    // unique: f"{match_id}:{market}"
  matchId: string;
  market: string;                // e.g., "over_under", "btts", "next_goal"
  selection: string;             // e.g., "over", "under", "yes", "no"
  homeTeam: string;
  awayTeam: string;
  league: string;
  confidence: number;            // 0-100
  minute: number;
  liquidityOk: boolean;
  ttlSeconds: number;            // Time to live in seconds
  state: SignalState;
  reasoning: string;
  createdTs: number;             // Unix timestamp
  lastUpdateTs: number;          // Unix timestamp
  odds?: number;                 // Betting odds from best bookmaker
  bookmaker?: string;            // Bookmaker name
  isValueBet?: boolean;          // True if model probability > implied probability with margin
  impliedProbability?: number;   // Implied probability from odds
  valueScore?: number;           // Difference between model and implied probability
  meta: Record<string, any>;     // Additional metadata
}

export interface ActiveSignalSnapshot {
  active: ActiveSignalSummary[];
  counts: {
    PRE: number;
    CANDIDATE: number;
    ACTIVE: number;
  };
}

export interface ActiveSignalSummary {
  id: string;
  matchId: string;
  market: string;
  selection: string;
  homeTeam: string;
  awayTeam: string;
  league: string;
  confidence: number;
  minute: number;
  ttlLeft: number;               // Time left in seconds
  state: SignalState;
  reasoning: string;
}

// Database Types
export type Match = typeof matches.$inferSelect;
export type Signal = typeof signals.$inferSelect;
export type SystemMetrics = typeof systemMetrics.$inferSelect;
export type RlAgentStats = typeof rlAgentStats.$inferSelect;
export type MarketSettings = typeof marketSettings.$inferSelect;
export type SystemConfig = typeof systemConfig.$inferSelect;
export type SupportedLeague = typeof supportedLeagues.$inferSelect;
export type SignalPerformance = typeof signalPerformance.$inferSelect;
export type MarketPerformance = typeof marketPerformance.$inferSelect;
export type DailyAnalytics = typeof dailyAnalytics.$inferSelect;

export type InsertMatch = z.infer<typeof insertMatchSchema>;
export type InsertSignal = z.infer<typeof insertSignalSchema>;
export type InsertSystemMetrics = z.infer<typeof insertSystemMetricsSchema>;
export type InsertRlAgentStats = z.infer<typeof insertRlAgentStatsSchema>;
export type InsertMarketSettings = z.infer<typeof insertMarketSettingsSchema>;
export type InsertSystemConfig = z.infer<typeof insertSystemConfigSchema>;
export type InsertSupportedLeague = z.infer<typeof insertSupportedLeagueSchema>;
export type InsertSignalPerformance = z.infer<typeof insertSignalPerformanceSchema>;
export type InsertMarketPerformance = z.infer<typeof insertMarketPerformanceSchema>;
export type InsertDailyAnalytics = z.infer<typeof insertDailyAnalyticsSchema>;
