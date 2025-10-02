import { storage } from '../storage';
import type { Signal } from '@shared/schema';

export class PerformanceTracker {
  private analyticsTimer?: NodeJS.Timeout;
  private coreEngine?: any; // Reference to core engine for RL agent access

  constructor(coreEngine?: any) {
    this.coreEngine = coreEngine;
    // Start daily analytics calculation
    this.startDailyAnalytics();
  }

  // Track signal performance when outcome is determined
  async trackSignalOutcome(signalId: string, actualResult: 'won' | 'lost' | 'void', odds?: number): Promise<void> {
    try {
      const signal = await storage.getSignal(signalId);
      if (!signal) {
        console.error(`Signal ${signalId} not found for performance tracking`);
        return;
      }

      // Calculate profit/loss based on outcome and odds
      const stake = 10.00; // Standard stake
      let profitLoss = 0;

      if (actualResult === 'won' && odds) {
        profitLoss = stake * (odds - 1); // Profit = stake * (odds - 1)
      } else if (actualResult === 'lost') {
        profitLoss = -stake; // Loss = -stake
      }
      // For 'void', profitLoss remains 0

      // Create performance record
      await storage.createSignalPerformance({
        signalId,
        market: signal.market,
        confidence: signal.confidence,
        actualResult,
        profitLoss: profitLoss.toString(),
        stake: stake.toString(),
        odds: odds ? odds.toString() : null,
        settlementTime: new Date()
      });

      // Update the signal status
      await storage.updateSignal(signalId, {
        status: actualResult === 'void' ? 'expired' : actualResult,
        result: actualResult,
        profit: profitLoss.toString()
      });

      // Update market performance aggregates
      await this.updateMarketPerformance(signal.market, 'daily');

      // Update RL agent with actual signal outcome if RL signal ID is available
      if (signal.metadata?.rlSignalId && this.coreEngine) {
        const rlAgent = this.coreEngine.getRLAgent();
        if (rlAgent) {
          rlAgent.updateFromResult(signal.metadata.rlSignalId, actualResult, profitLoss);
        }
      }

      console.log(`📈 Tracked signal outcome: ${signal.market} ${actualResult} (P&L: ${profitLoss > 0 ? '+' : ''}${profitLoss.toFixed(2)})`);

    } catch (error) {
      console.error('Error tracking signal outcome:', error);
    }
  }

  // Simulate signal outcomes for demonstration (since we don't have real match data)
  async simulateSignalOutcomes(): Promise<void> {
    try {
      const activeSignals = await storage.getActiveSignals();
      
      for (const signal of activeSignals) {
        // Check if signal has expired
        if (new Date() > new Date(signal.expiresAt)) {
          // Simulate random outcome based on confidence
          const confidence = parseFloat(signal.confidence);
          const random = Math.random() * 100;
          
          // Higher confidence = higher win probability
          const winProbability = Math.min(85, confidence + Math.random() * 20 - 10);
          const outcome = random < winProbability ? 'won' : 'lost';
          
          // Simulate realistic odds based on confidence
          const odds = confidence > 80 ? 1.5 + Math.random() * 0.5 :
                      confidence > 70 ? 1.8 + Math.random() * 0.7 :
                      2.0 + Math.random() * 1.0;

          await this.trackSignalOutcome(signal.id, outcome, odds);
        }
      }
    } catch (error) {
      console.error('Error simulating signal outcomes:', error);
    }
  }

  // Update market performance aggregates
  private async updateMarketPerformance(market: string, timeframe: string): Promise<void> {
    try {
      const now = new Date();
      const periodStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const periodEnd = new Date(periodStart.getTime() + 24 * 60 * 60 * 1000);

      // Get all performance records for this market today
      const performances = await storage.getPerformanceByMarket(market, 1000);
      const todayPerformances = performances.filter(p => 
        p.createdAt && new Date(p.createdAt) >= periodStart && new Date(p.createdAt) < periodEnd
      );

      if (todayPerformances.length === 0) return;

      const totalSignals = todayPerformances.length;
      const wonSignals = todayPerformances.filter(p => p.actualResult === 'won').length;
      const lostSignals = todayPerformances.filter(p => p.actualResult === 'lost').length;
      const voidSignals = todayPerformances.filter(p => p.actualResult === 'void').length;
      const winRate = totalSignals > 0 ? (wonSignals / totalSignals) * 100 : 0;
      const totalProfit = todayPerformances.reduce((sum, p) => sum + parseFloat(p.profitLoss || '0'), 0);
      const avgConfidence = todayPerformances.reduce((sum, p) => sum + parseFloat(p.confidence), 0) / totalSignals;

      // Calculate streaks
      const sortedPerformances = todayPerformances.sort((a, b) => 
        (a.createdAt ? new Date(a.createdAt).getTime() : 0) - (b.createdAt ? new Date(b.createdAt).getTime() : 0)
      );
      
      let currentStreak = 0;
      let bestStreak = 0;
      let tempStreak = 0;

      for (const perf of sortedPerformances) {
        if (perf.actualResult === 'won') {
          tempStreak++;
          bestStreak = Math.max(bestStreak, tempStreak);
        } else {
          tempStreak = 0;
        }
      }

      // Current streak is from the end
      for (let i = sortedPerformances.length - 1; i >= 0; i--) {
        if (sortedPerformances[i].actualResult === 'won') {
          currentStreak++;
        } else {
          break;
        }
      }

      // Update or create market performance record
      const existing = await storage.getMarketPerformance(market, timeframe);
      if (existing) {
        await storage.updateMarketPerformance(market, timeframe, {
          totalSignals,
          wonSignals,
          lostSignals,
          voidSignals,
          winRate: winRate.toString(),
          totalProfit: totalProfit.toString(),
          avgConfidence: avgConfidence.toString(),
          bestStreak,
          currentStreak,
          periodEnd
        });
      } else {
        await storage.createMarketPerformance({
          market,
          timeframe,
          totalSignals,
          wonSignals,
          lostSignals,
          voidSignals,
          winRate: winRate.toString(),
          totalProfit: totalProfit.toString(),
          avgConfidence: avgConfidence.toString(),
          bestStreak,
          currentStreak,
          periodStart,
          periodEnd
        });
      }

    } catch (error) {
      console.error('Error updating market performance:', error);
    }
  }

  // Calculate and store daily analytics
  private async calculateDailyAnalytics(): Promise<void> {
    try {
      const today = new Date();
      const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());

      // Get today's signals
      const allSignals = await storage.getSignalHistory(1000);
      const todaySignals = allSignals.filter(s => 
        s.createdAt && new Date(s.createdAt) >= startOfDay
      );

      // Get today's matches (need to get all matches, not just live ones)
      // For now, we'll use a placeholder count since we need a method to get all matches
      // This should be replaced with a proper getAllMatches method in the storage layer
      const todayMatches: any[] = []; // Placeholder - fix this by adding proper match counting

      // Get today's performance data
      const performances = await storage.getPerformanceByMarket('', 1000);
      const todayPerformances = performances.filter(p => 
        p.createdAt && new Date(p.createdAt) >= startOfDay
      );

      const totalSignals = todaySignals.length;
      const wonSignals = todayPerformances.filter(p => p.actualResult === 'won').length;
      const lostSignals = todayPerformances.filter(p => p.actualResult === 'lost').length;
      const winRate = totalSignals > 0 ? (wonSignals / totalSignals) * 100 : 0;
      const totalProfit = todayPerformances.reduce((sum, p) => sum + parseFloat(p.profitLoss || '0'), 0);

      // Find best performing market today
      const marketStats = await storage.getBestPerformingMarkets(1);
      const bestMarket = marketStats.length > 0 ? marketStats[0].market : 'N/A';

      // Get system metrics
      const latestMetrics = await storage.getLatestSystemMetrics();
      const avgResponseTime = latestMetrics?.apiResponseTime || 0;

      // Update or create daily analytics
      const existing = await storage.getDailyAnalytics(today);
      if (existing) {
        await storage.updateDailyAnalytics(today, {
          totalMatches: todayMatches.length,
          totalSignals,
          wonSignals,
          lostSignals,
          winRate: winRate.toString(),
          totalProfit: totalProfit.toString(),
          bestMarket,
          avgResponseTime,
          apiCallsCount: (existing.apiCallsCount || 0) + 1,
          errorCount: existing.errorCount || 0
        });
      } else {
        await storage.createDailyAnalytics({
          date: today,
          totalMatches: todayMatches.length,
          totalSignals,
          wonSignals,
          lostSignals,
          winRate: winRate.toString(),
          totalProfit: totalProfit.toString(),
          bestMarket,
          avgResponseTime,
          apiCallsCount: 1,
          errorCount: 0
        });
      }

      console.log(`📊 Daily analytics updated: ${totalSignals} signals, ${winRate.toFixed(1)}% win rate, ${totalProfit > 0 ? '+' : ''}${totalProfit.toFixed(2)} profit`);

    } catch (error) {
      console.error('Error calculating daily analytics:', error);
    }
  }

  // Start daily analytics calculation timer
  private startDailyAnalytics(): void {
    // Calculate analytics every hour
    this.analyticsTimer = setInterval(() => {
      this.calculateDailyAnalytics();
      this.simulateSignalOutcomes(); // Simulate outcomes for demo
    }, 60 * 60 * 1000); // 1 hour

    // Initial calculation
    setTimeout(() => {
      this.calculateDailyAnalytics();
      this.simulateSignalOutcomes();
    }, 5000); // 5 seconds after startup
  }

  // Stop the performance tracking
  stopTracking(): void {
    if (this.analyticsTimer) {
      clearInterval(this.analyticsTimer);
      this.analyticsTimer = undefined;
    }
  }
}