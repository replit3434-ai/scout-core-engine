import { 
  type Match, 
  type Signal, 
  type SystemMetrics, 
  type RlAgentStats,
  type MarketSettings,
  type SystemConfig,
  type SupportedLeague,
  type SignalPerformance,
  type MarketPerformance,
  type DailyAnalytics,
  type InsertMatch, 
  type InsertSignal, 
  type InsertSystemMetrics, 
  type InsertRlAgentStats,
  type InsertMarketSettings,
  type InsertSystemConfig,
  type InsertSupportedLeague,
  type InsertSignalPerformance,
  type InsertMarketPerformance,
  type InsertDailyAnalytics,
  matches,
  signals,
  systemMetrics,
  rlAgentStats,
  marketSettings,
  systemConfig,
  supportedLeagues,
  signalPerformance,
  marketPerformance,
  dailyAnalytics
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, sql } from "drizzle-orm";

export interface IStorage {
  // Matches
  getMatch(id: string): Promise<Match | undefined>;
  getMatchByExternalId(externalId: string): Promise<Match | undefined>;
  createMatch(match: InsertMatch): Promise<Match>;
  updateMatch(id: string, match: Partial<Match>): Promise<Match | undefined>;
  getLiveMatches(): Promise<Match[]>;
  
  // Signals
  getSignal(id: string): Promise<Signal | undefined>;
  createSignal(signal: InsertSignal): Promise<Signal>;
  updateSignal(id: string, signal: Partial<Signal>): Promise<Signal | undefined>;
  getActiveSignals(): Promise<Signal[]>;
  getSignalHistory(limit?: number): Promise<Signal[]>;
  getSignalsByMatch(matchId: string): Promise<Signal[]>;
  
  // System Metrics
  createSystemMetrics(metrics: InsertSystemMetrics): Promise<SystemMetrics>;
  getLatestSystemMetrics(): Promise<SystemMetrics | undefined>;
  
  // RL Agent Stats
  createRlAgentStats(stats: InsertRlAgentStats): Promise<RlAgentStats>;
  getLatestRlAgentStats(): Promise<RlAgentStats | undefined>;
  updateRlAgentStats(id: string, stats: Partial<RlAgentStats>): Promise<RlAgentStats | undefined>;
  
  // Market Settings
  getMarketSettings(): Promise<MarketSettings[]>;
  getMarketSetting(market: string): Promise<MarketSettings | undefined>;
  createMarketSetting(setting: InsertMarketSettings): Promise<MarketSettings>;
  updateMarketSetting(market: string, setting: Partial<MarketSettings>): Promise<MarketSettings | undefined>;
  
  // System Config
  getSystemConfig(): Promise<SystemConfig[]>;
  getConfigValue(key: string): Promise<string | undefined>;
  setConfigValue(key: string, value: string): Promise<void>;
  
  // Supported Leagues
  getSupportedLeagues(): Promise<SupportedLeague[]>;
  getSupportedLeague(leagueId: number): Promise<SupportedLeague | undefined>;
  createSupportedLeague(league: InsertSupportedLeague): Promise<SupportedLeague>;
  updateSupportedLeague(leagueId: number, league: Partial<SupportedLeague>): Promise<SupportedLeague | undefined>;
  
  // Signal Performance Tracking
  createSignalPerformance(performance: InsertSignalPerformance): Promise<SignalPerformance>;
  getSignalPerformance(signalId: string): Promise<SignalPerformance | undefined>;
  updateSignalPerformance(id: string, performance: Partial<SignalPerformance>): Promise<SignalPerformance | undefined>;
  getPerformanceByMarket(market: string, limit?: number): Promise<SignalPerformance[]>;
  
  // Market Performance Analytics
  createMarketPerformance(performance: InsertMarketPerformance): Promise<MarketPerformance>;
  getMarketPerformance(market: string, timeframe: string): Promise<MarketPerformance | undefined>;
  updateMarketPerformance(market: string, timeframe: string, performance: Partial<MarketPerformance>): Promise<MarketPerformance | undefined>;
  getAllMarketPerformance(timeframe: string): Promise<MarketPerformance[]>;
  
  // Daily Analytics
  createDailyAnalytics(analytics: InsertDailyAnalytics): Promise<DailyAnalytics>;
  getDailyAnalytics(date: Date): Promise<DailyAnalytics | undefined>;
  updateDailyAnalytics(date: Date, analytics: Partial<DailyAnalytics>): Promise<DailyAnalytics | undefined>;
  getAnalyticsHistory(days: number): Promise<DailyAnalytics[]>;
  
  // Performance Aggregation
  calculateWinRate(market?: string, days?: number): Promise<number>;
  calculateTotalProfit(market?: string, days?: number): Promise<number>;
  getBestPerformingMarkets(limit?: number): Promise<{ market: string; winRate: number; totalProfit: number }[]>;
  getPerformanceStats(): Promise<{
    totalSignals: number;
    wonSignals: number;
    totalProfit: number;
    winRate: number;
    bestMarket: string;
  }>;
}

export class DatabaseStorage implements IStorage {
  // Matches
  async getMatch(id: string): Promise<Match | undefined> {
    const [match] = await db.select().from(matches).where(eq(matches.id, id));
    return match || undefined;
  }

  async getMatchByExternalId(externalId: string): Promise<Match | undefined> {
    const [match] = await db.select().from(matches).where(eq(matches.externalId, externalId));
    return match || undefined;
  }

  async createMatch(insertMatch: InsertMatch): Promise<Match> {
    const [match] = await db
      .insert(matches)
      .values(insertMatch)
      .returning();
    return match;
  }

  async updateMatch(id: string, updateData: Partial<Match>): Promise<Match | undefined> {
    const [match] = await db
      .update(matches)
      .set({ ...updateData, updatedAt: new Date() })
      .where(eq(matches.id, id))
      .returning();
    return match || undefined;
  }

  async getLiveMatches(): Promise<Match[]> {
    return await db
      .select()
      .from(matches)
      .where(eq(matches.status, 'live'))
      .orderBy(desc(matches.createdAt));
  }

  // Signals
  async getSignal(id: string): Promise<Signal | undefined> {
    const [signal] = await db.select().from(signals).where(eq(signals.id, id));
    return signal || undefined;
  }

  async createSignal(insertSignal: InsertSignal): Promise<Signal> {
    const [signal] = await db
      .insert(signals)
      .values(insertSignal)
      .returning();
    return signal;
  }

  async updateSignal(id: string, updateData: Partial<Signal>): Promise<Signal | undefined> {
    const [signal] = await db
      .update(signals)
      .set({ ...updateData, updatedAt: new Date() })
      .where(eq(signals.id, id))
      .returning();
    return signal || undefined;
  }

  async getActiveSignals(): Promise<Signal[]> {
    return await db
      .select()
      .from(signals)
      .where(and(
        eq(signals.status, 'active'),
        sql`${signals.expiresAt} > now()`
      ))
      .orderBy(desc(signals.createdAt));
  }

  async getSignalHistory(limit: number = 50): Promise<Signal[]> {
    return await db
      .select()
      .from(signals)
      .orderBy(desc(signals.createdAt))
      .limit(limit);
  }

  async getSignalsByMatch(matchId: string): Promise<Signal[]> {
    return await db
      .select()
      .from(signals)
      .where(eq(signals.matchId, matchId))
      .orderBy(desc(signals.createdAt));
  }

  // System Metrics
  async createSystemMetrics(insertMetrics: InsertSystemMetrics): Promise<SystemMetrics> {
    const [metrics] = await db
      .insert(systemMetrics)
      .values(insertMetrics)
      .returning();
    return metrics;
  }

  async getLatestSystemMetrics(): Promise<SystemMetrics | undefined> {
    const [metrics] = await db
      .select()
      .from(systemMetrics)
      .orderBy(desc(systemMetrics.createdAt))
      .limit(1);
    return metrics || undefined;
  }

  // RL Agent Stats
  async createRlAgentStats(insertStats: InsertRlAgentStats): Promise<RlAgentStats> {
    const [stats] = await db
      .insert(rlAgentStats)
      .values(insertStats)
      .returning();
    return stats;
  }

  async getLatestRlAgentStats(): Promise<RlAgentStats | undefined> {
    const [stats] = await db
      .select()
      .from(rlAgentStats)
      .orderBy(desc(rlAgentStats.createdAt))
      .limit(1);
    return stats || undefined;
  }

  async updateRlAgentStats(id: string, updateData: Partial<RlAgentStats>): Promise<RlAgentStats | undefined> {
    const [stats] = await db
      .update(rlAgentStats)
      .set(updateData)
      .where(eq(rlAgentStats.id, id))
      .returning();
    return stats || undefined;
  }

  // Market Settings
  async getMarketSettings(): Promise<MarketSettings[]> {
    return await db
      .select()
      .from(marketSettings)
      .orderBy(marketSettings.market);
  }

  async getMarketSetting(market: string): Promise<MarketSettings | undefined> {
    const [setting] = await db
      .select()
      .from(marketSettings)
      .where(eq(marketSettings.market, market));
    return setting || undefined;
  }

  async createMarketSetting(insertSetting: InsertMarketSettings): Promise<MarketSettings> {
    const [setting] = await db
      .insert(marketSettings)
      .values(insertSetting)
      .returning();
    return setting;
  }

  async updateMarketSetting(market: string, updateData: Partial<MarketSettings>): Promise<MarketSettings | undefined> {
    const [setting] = await db
      .update(marketSettings)
      .set(updateData)
      .where(eq(marketSettings.market, market))
      .returning();
    return setting || undefined;
  }

  // System Config
  async getSystemConfig(): Promise<SystemConfig[]> {
    return await db
      .select()
      .from(systemConfig)
      .orderBy(systemConfig.key);
  }

  async getConfigValue(key: string): Promise<string | undefined> {
    const [config] = await db
      .select()
      .from(systemConfig)
      .where(eq(systemConfig.key, key));
    return config?.value || undefined;
  }

  async setConfigValue(key: string, value: string): Promise<void> {
    await db
      .insert(systemConfig)
      .values({ key, value })
      .onConflictDoUpdate({
        target: systemConfig.key,
        set: { value, updatedAt: new Date() }
      });
  }

  // Supported Leagues
  async getSupportedLeagues(): Promise<SupportedLeague[]> {
    return await db
      .select()
      .from(supportedLeagues)
      .orderBy(supportedLeagues.name);
  }

  async getSupportedLeague(leagueId: number): Promise<SupportedLeague | undefined> {
    const [league] = await db
      .select()
      .from(supportedLeagues)
      .where(eq(supportedLeagues.leagueId, leagueId));
    return league || undefined;
  }

  async createSupportedLeague(insertLeague: InsertSupportedLeague): Promise<SupportedLeague> {
    const [league] = await db
      .insert(supportedLeagues)
      .values(insertLeague)
      .returning();
    return league;
  }

  async updateSupportedLeague(leagueId: number, updateData: Partial<SupportedLeague>): Promise<SupportedLeague | undefined> {
    const [league] = await db
      .update(supportedLeagues)
      .set(updateData)
      .where(eq(supportedLeagues.leagueId, leagueId))
      .returning();
    return league || undefined;
  }

  // Signal Performance Tracking
  async createSignalPerformance(insertPerformance: InsertSignalPerformance): Promise<SignalPerformance> {
    const [performance] = await db
      .insert(signalPerformance)
      .values(insertPerformance)
      .returning();
    return performance;
  }

  async getSignalPerformance(signalId: string): Promise<SignalPerformance | undefined> {
    const [performance] = await db
      .select()
      .from(signalPerformance)
      .where(eq(signalPerformance.signalId, signalId));
    return performance || undefined;
  }

  async updateSignalPerformance(id: string, updateData: Partial<SignalPerformance>): Promise<SignalPerformance | undefined> {
    const [performance] = await db
      .update(signalPerformance)
      .set(updateData)
      .where(eq(signalPerformance.id, id))
      .returning();
    return performance || undefined;
  }

  async getPerformanceByMarket(market: string, limit: number = 50): Promise<SignalPerformance[]> {
    return await db
      .select()
      .from(signalPerformance)
      .where(eq(signalPerformance.market, market))
      .orderBy(desc(signalPerformance.createdAt))
      .limit(limit);
  }

  // Market Performance Analytics
  async createMarketPerformance(insertPerformance: InsertMarketPerformance): Promise<MarketPerformance> {
    const [performance] = await db
      .insert(marketPerformance)
      .values(insertPerformance)
      .returning();
    return performance;
  }

  async getMarketPerformance(market: string, timeframe: string): Promise<MarketPerformance | undefined> {
    const [performance] = await db
      .select()
      .from(marketPerformance)
      .where(and(
        eq(marketPerformance.market, market),
        eq(marketPerformance.timeframe, timeframe)
      ))
      .orderBy(desc(marketPerformance.createdAt))
      .limit(1);
    return performance || undefined;
  }

  async updateMarketPerformance(market: string, timeframe: string, updateData: Partial<MarketPerformance>): Promise<MarketPerformance | undefined> {
    const [performance] = await db
      .update(marketPerformance)
      .set({ ...updateData, updatedAt: new Date() })
      .where(and(
        eq(marketPerformance.market, market),
        eq(marketPerformance.timeframe, timeframe)
      ))
      .returning();
    return performance || undefined;
  }

  async getAllMarketPerformance(timeframe: string): Promise<MarketPerformance[]> {
    return await db
      .select()
      .from(marketPerformance)
      .where(eq(marketPerformance.timeframe, timeframe))
      .orderBy(desc(marketPerformance.winRate));
  }

  // Daily Analytics
  async createDailyAnalytics(insertAnalytics: InsertDailyAnalytics): Promise<DailyAnalytics> {
    const [analytics] = await db
      .insert(dailyAnalytics)
      .values(insertAnalytics)
      .returning();
    return analytics;
  }

  async getDailyAnalytics(date: Date): Promise<DailyAnalytics | undefined> {
    const startOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);
    
    const [analytics] = await db
      .select()
      .from(dailyAnalytics)
      .where(and(
        sql`${dailyAnalytics.date} >= ${startOfDay}`,
        sql`${dailyAnalytics.date} < ${endOfDay}`
      ));
    return analytics || undefined;
  }

  async updateDailyAnalytics(date: Date, updateData: Partial<DailyAnalytics>): Promise<DailyAnalytics | undefined> {
    const startOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);
    
    const [analytics] = await db
      .update(dailyAnalytics)
      .set(updateData)
      .where(and(
        sql`${dailyAnalytics.date} >= ${startOfDay}`,
        sql`${dailyAnalytics.date} < ${endOfDay}`
      ))
      .returning();
    return analytics || undefined;
  }

  async getAnalyticsHistory(days: number): Promise<DailyAnalytics[]> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    
    return await db
      .select()
      .from(dailyAnalytics)
      .where(sql`${dailyAnalytics.date} >= ${cutoffDate}`)
      .orderBy(desc(dailyAnalytics.date))
      .limit(days);
  }

  // Performance Aggregation
  async calculateWinRate(market?: string, days?: number): Promise<number> {
    const conditions = [];
    if (market) {
      conditions.push(eq(signalPerformance.market, market));
    }
    if (days) {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);
      conditions.push(sql`${signalPerformance.createdAt} >= ${cutoffDate}`);
    }

    let query = db.select({
      won: sql<number>`COUNT(CASE WHEN ${signalPerformance.actualResult} = 'won' THEN 1 END)`,
      total: sql<number>`COUNT(*)`,
    }).from(signalPerformance);

    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }

    const [result] = await query;
    return result.total > 0 ? (result.won / result.total) * 100 : 0;
  }

  async calculateTotalProfit(market?: string, days?: number): Promise<number> {
    const conditions = [];
    if (market) {
      conditions.push(eq(signalPerformance.market, market));
    }
    if (days) {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);
      conditions.push(sql`${signalPerformance.createdAt} >= ${cutoffDate}`);
    }

    let query = db.select({
      totalProfit: sql<number>`COALESCE(SUM(${signalPerformance.profitLoss}), 0)`,
    }).from(signalPerformance);

    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }

    const [result] = await query;
    return parseFloat(result.totalProfit.toString()) || 0;
  }

  async getBestPerformingMarkets(limit: number = 5): Promise<{ market: string; winRate: number; totalProfit: number }[]> {
    const results = await db.select({
      market: signalPerformance.market,
      winRate: sql<number>`(COUNT(CASE WHEN ${signalPerformance.actualResult} = 'won' THEN 1 END) * 100.0 / COUNT(*))`,
      totalProfit: sql<number>`COALESCE(SUM(${signalPerformance.profitLoss}), 0)`,
      totalSignals: sql<number>`COUNT(*)`,
    })
    .from(signalPerformance)
    .groupBy(signalPerformance.market)
    .having(sql`COUNT(*) >= 5`) // Minimum 5 signals for statistical relevance
    .orderBy(sql`(COUNT(CASE WHEN ${signalPerformance.actualResult} = 'won' THEN 1 END) * 100.0 / COUNT(*)) DESC`)
    .limit(limit);

    return results.map(r => ({
      market: r.market,
      winRate: parseFloat(r.winRate.toString()),
      totalProfit: parseFloat(r.totalProfit.toString())
    }));
  }

  async getPerformanceStats(): Promise<{
    totalSignals: number;
    wonSignals: number;
    totalProfit: number;
    winRate: number;
    bestMarket: string;
  }> {
    const [stats] = await db.select({
      totalSignals: sql<number>`COUNT(*)`,
      wonSignals: sql<number>`COUNT(CASE WHEN ${signalPerformance.actualResult} = 'won' THEN 1 END)`,
      totalProfit: sql<number>`COALESCE(SUM(${signalPerformance.profitLoss}), 0)`,
    }).from(signalPerformance);

    const bestMarkets = await this.getBestPerformingMarkets(1);
    const bestMarket = bestMarkets.length > 0 ? bestMarkets[0].market : 'N/A';
    
    const winRate = stats.totalSignals > 0 ? (stats.wonSignals / stats.totalSignals) * 100 : 0;

    return {
      totalSignals: stats.totalSignals,
      wonSignals: stats.wonSignals,
      totalProfit: parseFloat(stats.totalProfit.toString()),
      winRate,
      bestMarket
    };
  }
}

export const storage = new DatabaseStorage();