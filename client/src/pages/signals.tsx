import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SignalCard } from "@/components/signal-card";
import { SignalHistory } from "@/components/signal-history";
import { useWebSocket } from "@/hooks/use-websocket";
import { Signal, Match } from "@shared/schema";
import { ArrowLeft, Activity, TrendingUp } from "lucide-react";

interface SignalWithMatch extends Signal {
  match?: Match;
}

interface ActiveSignalsData {
  active: any[];
  counts: {
    pre: number;
    candidate: number;
    active: number;
    expired: number;
  };
  stats: {
    totalProcessed: number;
    activeMatches: number;
    avgConfidence: number;
    maturationRate: number;
  };
  timestamp: number;
}

export default function Signals() {
  const queryClient = useQueryClient();
  const [activeSignals, setActiveSignals] = useState<SignalWithMatch[]>([]);
  const [signalStats, setSignalStats] = useState<ActiveSignalsData['stats'] | null>(null);
  const [signalCounts, setSignalCounts] = useState<ActiveSignalsData['counts'] | null>(null);

  // Fetch initial data
  const { data: initialData, isLoading: signalsLoading } = useQuery({
    queryKey: ['/api/signals/active'],
    refetchInterval: 30000,
  });

  // WebSocket connection for real-time updates with query cache invalidation
  const { isConnected } = useWebSocket({
    onMessage: (message) => {
      if (message.type === 'active_signals_update') {
        const data = message.data as ActiveSignalsData;
        if (data) {
          // ✅ Update query cache directly (React Query will re-render)
          queryClient.setQueryData(['/api/signals/active'], data);
          
          // Also update local state for immediate UI update
          setActiveSignals(data.active || []);
          setSignalStats(data.stats);
          setSignalCounts(data.counts);
          
          console.debug('📡 WS: Active signals updated', data.active?.length || 0);
        }
      }
      // Backward compatibility with old format
      else if (message.type === 'active_signals') {
        queryClient.setQueryData(['/api/signals/active'], message.data);
        setActiveSignals(message.data || []);
      }
    },
  });

  // Use initial data (API response or WebSocket data)
  useEffect(() => {
    if (initialData) {
      // Handle new ActiveSignalService format
      if (typeof initialData === 'object' && 'active' in initialData) {
        const data = initialData as ActiveSignalsData;
        setActiveSignals(data.active || []);
        setSignalStats(data.stats);
        setSignalCounts(data.counts);
      }
      // Handle old format (fallback)
      else if (Array.isArray(initialData)) {
        setActiveSignals(initialData as SignalWithMatch[]);
      }
    }
  }, [initialData]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Link href="/">
                <Button variant="ghost" size="sm" data-testid="back-to-dashboard">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Dashboard
                </Button>
              </Link>
              <div>
                <h1 className="text-xl font-bold text-foreground" data-testid="signals-title">Signals</h1>
                <p className="text-sm text-muted-foreground">Active betting signals and history</p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-primary animate-pulse' : 'bg-red-500'}`}></div>
              <span className="text-sm text-muted-foreground" data-testid="signals-connection-status">
                {isConnected ? 'Live' : 'Offline'}
              </span>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-6 py-6 space-y-6">
        {/* Signal Pipeline Stats */}
        {(signalCounts || signalStats) && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {signalCounts && (
              <>
                <Card className="p-4">
                  <div className="flex items-center space-x-2">
                    <Activity className="w-4 h-4 text-blue-500" />
                    <span className="text-sm text-muted-foreground">Pre-Analysis</span>
                  </div>
                  <div className="text-2xl font-bold text-foreground" data-testid="signals-pre-count">
                    {signalCounts.pre}
                  </div>
                </Card>
                <Card className="p-4">
                  <div className="flex items-center space-x-2">
                    <TrendingUp className="w-4 h-4 text-yellow-500" />
                    <span className="text-sm text-muted-foreground">Candidates</span>
                  </div>
                  <div className="text-2xl font-bold text-foreground" data-testid="signals-candidate-count">
                    {signalCounts.candidate}
                  </div>
                </Card>
                <Card className="p-4">
                  <div className="flex items-center space-x-2">
                    <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                    <span className="text-sm text-muted-foreground">Active</span>
                  </div>
                  <div className="text-2xl font-bold text-primary" data-testid="signals-active-count">
                    {signalCounts.active}
                  </div>
                </Card>
                <Card className="p-4">
                  <div className="flex items-center space-x-2">
                    <div className="w-2 h-2 rounded-full bg-muted" />
                    <span className="text-sm text-muted-foreground">Expired</span>
                  </div>
                  <div className="text-2xl font-bold text-muted-foreground" data-testid="signals-expired-count">
                    {signalCounts.expired}
                  </div>
                </Card>
              </>
            )}
          </div>
        )}

        {/* Performance Stats */}
        {signalStats && (
          <Card className="p-4 mb-6">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <span className="text-sm text-muted-foreground">Processed Today</span>
                <div className="text-xl font-semibold text-foreground" data-testid="signals-processed-count">
                  {signalStats.totalProcessed}
                </div>
              </div>
              <div>
                <span className="text-sm text-muted-foreground">Active Matches</span>
                <div className="text-xl font-semibold text-foreground" data-testid="signals-active-matches">
                  {signalStats.activeMatches}
                </div>
              </div>
              <div>
                <span className="text-sm text-muted-foreground">Avg Confidence</span>
                <div className="text-xl font-semibold text-foreground" data-testid="signals-avg-confidence">
                  {signalStats.avgConfidence.toFixed(1)}%
                </div>
              </div>
              <div>
                <span className="text-sm text-muted-foreground">Maturation Rate</span>
                <div className="text-xl font-semibold text-foreground" data-testid="signals-maturation-rate">
                  {(signalStats.maturationRate * 100).toFixed(1)}%
                </div>
              </div>
            </div>
          </Card>
        )}

        {/* Active Signals Section */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-foreground">Active Signals</h2>
            <Badge variant="secondary" data-testid="active-signals-count">
              {activeSignals.length} Live
            </Badge>
          </div>

          {signalsLoading ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <Card key={i} className="p-6">
                  <div className="animate-pulse space-y-4">
                    <div className="flex justify-between">
                      <div className="h-4 bg-muted rounded w-16"></div>
                      <div className="h-6 bg-muted rounded w-12"></div>
                    </div>
                    <div className="h-6 bg-muted rounded w-3/4"></div>
                    <div className="h-16 bg-muted rounded"></div>
                    <div className="flex justify-between">
                      <div className="h-3 bg-muted rounded w-20"></div>
                      <div className="h-3 bg-muted rounded w-24"></div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          ) : activeSignals.length === 0 ? (
            <Card className="p-12 text-center">
              <div className="space-y-3">
                <div className="w-16 h-16 bg-muted rounded-full mx-auto flex items-center justify-center">
                  <svg className="w-8 h-8 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"/>
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-foreground" data-testid="no-signals-message">No Active Signals</h3>
                <p className="text-muted-foreground">
                  Waiting for live matches and market opportunities to generate new signals.
                </p>
              </div>
            </Card>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
              {activeSignals.map((signal) => (
                <SignalCard key={signal.id} signal={signal} />
              ))}
            </div>
          )}
        </div>

        {/* Signal History Section */}
        <div className="space-y-4">
          <h2 className="text-xl font-semibold text-foreground">Signal History</h2>
          <SignalHistory />
        </div>
      </div>
    </div>
  );
}