import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SafeSignalCard } from "@/components/ui/safe-signal-card";
import { ActiveSignal } from "@/types/active-signals";
import { isValidSignal } from "@/utils/signal-normalizer";
import { Activity, AlertCircle } from "lucide-react";

interface SafeActiveSignalsListProps {
  signals: ActiveSignal[];
  maxDisplay?: number;
  showCounts?: boolean;
  counts?: {
    PRE: number;
    CANDIDATE: number;
    ACTIVE: number;
  };
}

export function SafeActiveSignalsList({ 
  signals = [], 
  maxDisplay = 10,
  showCounts = false,
  counts
}: SafeActiveSignalsListProps) {
  // Filter and validate signals
  const validSignals = signals.filter(isValidSignal);
  const displaySignals = validSignals.slice(0, maxDisplay);

  if (validSignals.length === 0) {
    return (
      <Card className="p-12 text-center" data-testid="no-active-signals">
        <div className="space-y-3">
          <div className="w-16 h-16 bg-muted rounded-full mx-auto flex items-center justify-center">
            <Activity className="w-8 h-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold text-foreground">No Active Signals</h3>
          <p className="text-muted-foreground">
            Waiting for live matches and market opportunities to generate new signals.
          </p>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Counts Header (if enabled) */}
      {showCounts && counts && (
        <div className="grid grid-cols-3 gap-4">
          <Card className="p-3">
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 rounded-full bg-blue-500" />
              <span className="text-sm text-muted-foreground">Pre-Analysis</span>
            </div>
            <div className="text-xl font-bold text-foreground" data-testid="signals-pre-count">
              {counts.PRE}
            </div>
          </Card>
          
          <Card className="p-3">
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 rounded-full bg-yellow-500" />
              <span className="text-sm text-muted-foreground">Candidates</span>
            </div>
            <div className="text-xl font-bold text-foreground" data-testid="signals-candidate-count">
              {counts.CANDIDATE}
            </div>
          </Card>
          
          <Card className="p-3">
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
              <span className="text-sm text-muted-foreground">Active</span>
            </div>
            <div className="text-xl font-bold text-primary" data-testid="signals-active-count">
              {counts.ACTIVE}
            </div>
          </Card>
        </div>
      )}

      {/* Signals Grid */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Active Signals</h3>
          <div className="flex items-center space-x-2">
            <Badge variant="secondary" data-testid="displayed-signals-count">
              {displaySignals.length} of {validSignals.length}
            </Badge>
            {validSignals.length > maxDisplay && (
              <Badge variant="outline" className="text-orange-600">
                {validSignals.length - maxDisplay} more
              </Badge>
            )}
          </div>
        </div>

        {/* Warning for invalid signals */}
        {signals.length > validSignals.length && (
          <Card className="p-3 border-orange-200 bg-orange-50 dark:bg-orange-950/20">
            <div className="flex items-center space-x-2 text-orange-700 dark:text-orange-300">
              <AlertCircle className="w-4 h-4" />
              <span className="text-sm">
                {signals.length - validSignals.length} invalid signal{signals.length - validSignals.length !== 1 ? 's' : ''} filtered out
              </span>
            </div>
          </Card>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {displaySignals.map((signal) => (
            <SafeSignalCard 
              key={signal.id} 
              signal={signal}
              data-testid={`signal-item-${signal.id}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}