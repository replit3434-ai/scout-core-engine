import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TrendingUp, Star, Zap, CornerDownRight, AlertTriangle } from "lucide-react";
import { useState, useEffect } from "react";

interface MarketPerformanceData {
  market: string;
  totalSignals: number;
  wonSignals: number;
  lostSignals: number;
  winRate: string;
  profit: string;
}

export function MarketPerformance() {
  const [performanceData, setPerformanceData] = useState<MarketPerformanceData[]>([]);
  const [timeFilter, setTimeFilter] = useState("last_7_days");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMarketPerformance();
  }, [timeFilter]);

  const fetchMarketPerformance = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/analytics/market-performance');
      if (response.ok) {
        const data = await response.json();
        setPerformanceData(data);
      }
    } catch (error) {
      console.error('Error fetching market performance:', error);
    } finally {
      setLoading(false);
    }
  };

  const getMarketIcon = (market: string) => {
    switch (market) {
      case 'over_under':
        return TrendingUp;
      case 'btts':
        return Star;
      case 'next_goal':
        return Zap;
      case 'corners':
        return CornerDownRight;
      case 'cards':
        return AlertTriangle;
      default:
        return TrendingUp;
    }
  };

  const getMarketDisplayName = (market: string) => {
    switch (market) {
      case 'over_under':
        return 'Over/Under';
      case 'btts':
        return 'BTTS';
      case 'next_goal':
        return 'Next Goal';
      case 'corners':
        return 'Corners';
      case 'cards':
        return 'Cards';
      default:
        return market;
    }
  };

  const getPerformanceColor = (winRate: string) => {
    const rate = parseFloat(winRate);
    if (rate >= 70) return 'text-primary';
    if (rate >= 60) return 'text-yellow-500';
    return 'text-secondary-foreground';
  };

  if (loading) {
    return (
      <Card className="bg-card rounded-lg border border-border p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-muted rounded w-32"></div>
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 bg-muted rounded-lg"></div>
                <div>
                  <div className="h-4 bg-muted rounded w-20 mb-1"></div>
                  <div className="h-3 bg-muted rounded w-16"></div>
                </div>
              </div>
              <div>
                <div className="h-4 bg-muted rounded w-12 mb-1"></div>
                <div className="h-3 bg-muted rounded w-16"></div>
              </div>
            </div>
          ))}
        </div>
      </Card>
    );
  }

  return (
    <Card className="bg-card rounded-lg border border-border p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-foreground">Market Performance</h3>
        <Select value={timeFilter} onValueChange={setTimeFilter}>
          <SelectTrigger className="w-32" data-testid="time-filter-select">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="last_7_days">Last 7 Days</SelectItem>
            <SelectItem value="last_30_days">Last 30 Days</SelectItem>
            <SelectItem value="last_3_months">Last 3 Months</SelectItem>
          </SelectContent>
        </Select>
      </div>
      
      <div className="space-y-4">
        {performanceData.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No market performance data available
          </div>
        ) : (
          performanceData.map((market) => {
            const Icon = getMarketIcon(market.market);
            const winRateColor = getPerformanceColor(market.winRate);
            
            return (
              <div 
                key={market.market} 
                className="flex items-center justify-between p-3 bg-muted/30 rounded-lg hover:bg-muted/50 transition-colors"
                data-testid={`market-performance-${market.market}`}
              >
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center">
                    <Icon className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium text-foreground" data-testid={`market-name-${market.market}`}>
                      {getMarketDisplayName(market.market)}
                    </p>
                    <p className="text-sm text-muted-foreground" data-testid={`market-signals-${market.market}`}>
                      {market.totalSignals} signals
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className={`font-semibold ${winRateColor}`} data-testid={`market-winrate-${market.market}`}>
                    {market.winRate}%
                  </p>
                  <p className="text-sm text-muted-foreground" data-testid={`market-profit-${market.market}`}>
                    €{market.profit}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>
    </Card>
  );
}
