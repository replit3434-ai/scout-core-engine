import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Signal, Match } from "@shared/schema";
import { formatDistanceToNow } from "date-fns";

interface SignalWithMatch extends Signal {
  match?: Match;
}

type FilterType = 'all' | 'won' | 'lost';

export function SignalHistory() {
  const [filter, setFilter] = useState<FilterType>('all');
  const [limit, setLimit] = useState(50);

  const { data: signals = [], isLoading } = useQuery<SignalWithMatch[]>({
    queryKey: ['/api/signals/history', { limit }],
    queryFn: async () => {
      const response = await fetch(`/api/signals/history?limit=${limit}`);
      if (!response.ok) throw new Error('Failed to fetch signal history');
      return response.json();
    }
  });

  const filteredSignals = signals.filter(signal => {
    if (filter === 'all') return true;
    return signal.status === filter;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'won':
        return <Badge className="bg-green-500/10 text-green-400 border-green-500/30">Won</Badge>;
      case 'lost':
        return <Badge className="bg-red-500/10 text-red-400 border-red-500/30">Lost</Badge>;
      case 'expired':
        return <Badge className="bg-yellow-500/10 text-yellow-400 border-yellow-500/30">Expired</Badge>;
      case 'active':
        return <Badge className="bg-primary/10 text-primary border-primary/30">Active</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const getMarketBadge = (market: string, selection: string) => {
    const getMarketColor = (market: string) => {
      switch (market) {
        case 'over_under':
          return 'bg-primary/10 text-primary';
        case 'btts':
          return 'bg-yellow-500/10 text-yellow-600';
        case 'next_goal':
          return 'bg-accent/30 text-accent-foreground';
        case 'corners':
          return 'bg-purple-500/10 text-purple-400';
        case 'cards':
          return 'bg-red-500/10 text-red-400';
        default:
          return 'bg-secondary/50 text-secondary-foreground';
      }
    };

    return (
      <Badge className={`${getMarketColor(market)} font-medium`}>
        {selection}
      </Badge>
    );
  };

  const formatMarketDisplay = (market: string) => {
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
        return market.replace('_', ' ');
    }
  };

  const formatProfit = (profit: string | null) => {
    if (!profit) return '€0.00';
    const amount = parseFloat(profit);
    const sign = amount >= 0 ? '+' : '';
    const color = amount >= 0 ? 'text-primary' : 'text-red-400';
    return <span className={`font-medium ${color}`}>{sign}€{amount.toFixed(2)}</span>;
  };

  if (isLoading) {
    return (
      <Card className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="flex items-center justify-between mb-6">
            <div className="h-6 bg-muted rounded w-32"></div>
            <div className="flex space-x-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-8 bg-muted rounded w-16"></div>
              ))}
            </div>
          </div>
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-16 bg-muted rounded"></div>
            ))}
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-foreground">Recent Signal History</h3>
        <div className="flex items-center space-x-2">
          <Button 
            variant={filter === 'all' ? 'default' : 'secondary'} 
            size="sm"
            onClick={() => setFilter('all')}
            data-testid="filter-all"
          >
            All
          </Button>
          <Button 
            variant={filter === 'won' ? 'default' : 'secondary'} 
            size="sm"
            onClick={() => setFilter('won')}
            data-testid="filter-won"
          >
            Won
          </Button>
          <Button 
            variant={filter === 'lost' ? 'default' : 'secondary'} 
            size="sm"
            onClick={() => setFilter('lost')}
            data-testid="filter-lost"
          >
            Lost
          </Button>
        </div>
      </div>
      
      {filteredSignals.length === 0 ? (
        <div className="text-center py-12">
          <div className="w-16 h-16 bg-muted rounded-full mx-auto flex items-center justify-center mb-4">
            <svg className="w-8 h-8 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-foreground mb-2">No Signal History</h3>
          <p className="text-muted-foreground">
            {filter === 'all' ? 'No signals have been generated yet.' : `No ${filter} signals found.`}
          </p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-3 px-4 text-muted-foreground font-medium">Match</th>
                  <th className="text-left py-3 px-4 text-muted-foreground font-medium">Market</th>
                  <th className="text-left py-3 px-4 text-muted-foreground font-medium">Selection</th>
                  <th className="text-left py-3 px-4 text-muted-foreground font-medium">Confidence</th>
                  <th className="text-left py-3 px-4 text-muted-foreground font-medium">Result</th>
                  <th className="text-left py-3 px-4 text-muted-foreground font-medium">P&L</th>
                  <th className="text-left py-3 px-4 text-muted-foreground font-medium">Time</th>
                </tr>
              </thead>
              <tbody>
                {filteredSignals.map((signal) => (
                  <tr 
                    key={signal.id} 
                    className="border-b border-border/50 hover:bg-muted/30 transition-colors"
                    data-testid={`signal-row-${signal.id}`}
                  >
                    <td className="py-3 px-4">
                      <div>
                        <p className="font-medium text-foreground" data-testid={`signal-match-${signal.id}`}>
                          {signal.match ? `${signal.match.homeTeam} vs ${signal.match.awayTeam}` : 'Unknown Match'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {signal.match?.league || 'Unknown League'}
                        </p>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-foreground" data-testid={`signal-market-${signal.id}`}>
                      {formatMarketDisplay(signal.market)}
                    </td>
                    <td className="py-3 px-4" data-testid={`signal-selection-${signal.id}`}>
                      {getMarketBadge(signal.market, signal.selection)}
                    </td>
                    <td className="py-3 px-4" data-testid={`signal-confidence-${signal.id}`}>
                      <Badge className="bg-primary/20 text-primary border-primary/30">
                        {parseFloat(signal.confidence).toFixed(0)}%
                      </Badge>
                    </td>
                    <td className="py-3 px-4" data-testid={`signal-status-${signal.id}`}>
                      {getStatusBadge(signal.status)}
                    </td>
                    <td className="py-3 px-4" data-testid={`signal-profit-${signal.id}`}>
                      {formatProfit(signal.profit)}
                    </td>
                    <td className="py-3 px-4 text-muted-foreground text-xs" data-testid={`signal-time-${signal.id}`}>
                      {signal.createdAt ? formatDistanceToNow(new Date(signal.createdAt), { addSuffix: true }) : 'Unknown'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          {signals.length >= limit && (
            <div className="flex items-center justify-center mt-6">
              <Button 
                variant="secondary" 
                onClick={() => setLimit(limit + 50)}
                data-testid="load-more-button"
              >
                Load More
              </Button>
            </div>
          )}
        </>
      )}
    </Card>
  );
}
