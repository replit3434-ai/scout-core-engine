import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SystemMetrics } from "@/components/system-metrics";
import { SafeActiveSignalsList } from "@/components/ui/safe-active-signals-list";
import { MarketPerformance } from "@/components/market-performance";
import { RlAgentStatus } from "@/components/rl-agent-status";
import { SignalHistory } from "@/components/signal-history";
import { useWebSocket } from "@/hooks/use-websocket";
import { SystemMetrics as SystemMetricsType, RlAgentStats } from "@shared/schema";
import { ActiveSignal, ActiveSnapshot } from "@/types/active-signals";
import { normalizeSnapshot } from "@/utils/signal-normalizer";
import { Settings } from "lucide-react";

export default function Dashboard() {
  const queryClient = useQueryClient();
  const [activeSnapshot, setActiveSnapshot] = useState<ActiveSnapshot>({ active: [], counts: { PRE: 0, CANDIDATE: 0, ACTIVE: 0 } });
  const [systemMetrics, setSystemMetrics] = useState<SystemMetricsType | null>(null);
  const [rlAgentStats, setRlAgentStats] = useState<RlAgentStats | null>(null);

  // Fetch initial data
  const { data: initialSignals, isLoading: signalsLoading } = useQuery({
    queryKey: ['/api/signals/active'],
    refetchInterval: 30000, // Fallback polling every 30 seconds
  });

  const { data: initialMetrics } = useQuery({
    queryKey: ['/api/system/metrics'],
    refetchInterval: 30000,
  });

  const { data: initialRlStats } = useQuery({
    queryKey: ['/api/rl-agent/stats'],
    refetchInterval: 30000,
  });

  // WebSocket connection for real-time updates with query cache invalidation
  const { isConnected, connectionError } = useWebSocket({
    onMessage: (message) => {
      try {
        switch (message.type) {
          case 'active_signals_update':
            // New ActiveSignalService format
            if (message.data) {
              const normalized = normalizeSnapshot(message.data);
              
              // ✅ Update query cache directly (React Query will re-render)
              queryClient.setQueryData(['/api/signals/active'], message.data);
              
              // Also update local state for immediate UI update
              setActiveSnapshot(normalized);
              
              console.debug('📡 WS: Active signals updated', normalized.active?.length || 0);
            }
            break;
          case 'active_signals':
            // Fallback for old format
            if (message.data) {
              const normalized = normalizeSnapshot({ active: message.data, counts: {} });
              queryClient.setQueryData(['/api/signals/active'], { active: message.data, counts: {} });
              setActiveSnapshot(normalized);
            }
            break;
          case 'system_status':
            if (message.data?.metrics) {
              queryClient.setQueryData(['/api/system/metrics'], message.data.metrics);
              setSystemMetrics(message.data.metrics);
            }
            if (message.data?.rlStats) {
              queryClient.setQueryData(['/api/rl-agent/stats'], message.data.rlStats);
              setRlAgentStats(message.data.rlStats);
            }
            break;
          case 'system_update':
            // Trigger a refetch of data
            break;
        }
      } catch (error) {
        console.error('Error processing WebSocket message:', error);
      }
    },
    onConnect: () => {
      console.log('Connected to real-time updates');
    },
    onDisconnect: () => {
      console.log('Disconnected from real-time updates');
    }
  });

  // Use WebSocket data when available, fallback to REST API data
  useEffect(() => {
    if (initialSignals && activeSnapshot.active.length === 0) {
      try {
        const normalized = normalizeSnapshot(initialSignals);
        setActiveSnapshot(normalized);
      } catch (error) {
        console.error('Error normalizing initial signals:', error);
        // Fallback to empty state
        setActiveSnapshot({ active: [], counts: { PRE: 0, CANDIDATE: 0, ACTIVE: 0 } });
      }
    }
  }, [initialSignals, activeSnapshot.active.length]);

  useEffect(() => {
    if (initialMetrics && !systemMetrics) {
      setSystemMetrics(initialMetrics as SystemMetricsType);
    }
  }, [initialMetrics, systemMetrics]);

  useEffect(() => {
    if (initialRlStats && !rlAgentStats) {
      setRlAgentStats(initialRlStats as RlAgentStats);
    }
  }, [initialRlStats, rlAgentStats]);

  const currentMetrics = systemMetrics || initialMetrics;
  const currentRlStats = rlAgentStats || initialRlStats;

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                  <svg className="w-5 h-5 text-primary-foreground" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/>
                  </svg>
                </div>
                <div>
                  <h1 className="text-xl font-bold text-foreground">Scout Core Engine</h1>
                  <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                    <span>v6.0</span>
                    <div className="w-1 h-1 bg-muted-foreground rounded-full"></div>
                    <div className="flex items-center space-x-1">
                      <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-primary animate-pulse' : 'bg-red-500'}`}></div>
                      <span data-testid="connection-status">
                        {isConnected ? 'Production' : 'Disconnected'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-3 text-sm">
                <div className="flex items-center space-x-1">
                  <svg className="w-4 h-4 text-primary" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"/>
                  </svg>
                  <span className="font-medium text-primary" data-testid="active-matches-count">
                    {(currentMetrics as SystemMetricsType)?.activeMatches || 0} Active
                  </span>
                </div>
                <div className="flex items-center space-x-1">
                  <svg className="w-4 h-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"/>
                  </svg>
                  <span className="font-medium" data-testid="signals-today-count">
                    {activeSnapshot.counts.ACTIVE} Active
                  </span>
                </div>
                <div className="flex items-center space-x-1">
                  <svg className="w-4 h-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1"/>
                  </svg>
                  <span className="font-medium text-primary" data-testid="win-rate">
                    {currentMetrics ? `${parseFloat((currentMetrics as SystemMetricsType).successRate).toFixed(1)}%` : '0%'}
                  </span>
                </div>
              </div>
              
              <Link href="/analytics">
                <Button variant="ghost" size="sm" data-testid="nav-analytics">
                  Analytics
                </Button>
              </Link>
              <Link href="/signals">
                <Button variant="ghost" size="sm" data-testid="nav-signals">
                  Signals
                </Button>
              </Link>
              <Link href="/settings">
                <Button variant="secondary" size="sm" data-testid="nav-settings">
                  <Settings className="w-4 h-4 mr-2" />
                  Settings
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-6 py-6 space-y-6">
        {/* Connection Error Alert */}
        {connectionError && (
          <Card className="p-4 border-destructive bg-destructive/10">
            <div className="flex items-center space-x-2 text-destructive">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"/>
              </svg>
              <span className="text-sm font-medium">
                Real-time connection lost. Using cached data with 30s refresh.
              </span>
            </div>
          </Card>
        )}

        {/* System Metrics */}
        <SystemMetrics metrics={currentMetrics as SystemMetricsType} />

        {/* Active Signals with Safe Components */}
        {signalsLoading ? (
          <Card className="p-8 text-center">
            <div className="animate-pulse space-y-4">
              <div className="h-4 bg-muted rounded w-32 mx-auto"></div>
              <div className="h-16 bg-muted rounded"></div>
              <div className="grid grid-cols-3 gap-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-20 bg-muted rounded"></div>
                ))}
              </div>
            </div>
          </Card>
        ) : (
          <SafeActiveSignalsList 
            signals={activeSnapshot.active}
            maxDisplay={10}
            showCounts={true}
            counts={activeSnapshot.counts}
          />
        )}

        {/* Market Performance and RL Agent Status */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <MarketPerformance />
          <RlAgentStatus stats={currentRlStats as RlAgentStats} />
        </div>


        {/* Signal History */}
        <SignalHistory />
      </div>
    </div>
  );
}
