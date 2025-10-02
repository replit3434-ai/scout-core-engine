import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ActiveSignal, SafeActiveSignal } from "@/types/active-signals";
import { toSafeSignal, formatConfidence, formatMinute, formatTTL } from "@/utils/signal-normalizer";
import { Clock, Target, TrendingUp } from "lucide-react";

interface SafeSignalCardProps {
  signal: ActiveSignal;
  className?: string;
}

export function SafeSignalCard({ signal, className = "" }: SafeSignalCardProps) {
  // Convert to safe signal with fallbacks
  const safeSignal: SafeActiveSignal = toSafeSignal(signal);

  // Determine confidence color
  const getConfidenceColor = (confidence: number): string => {
    if (confidence >= 75) return "bg-green-500";
    if (confidence >= 60) return "bg-yellow-500"; 
    return "bg-red-500";
  };

  // Determine state badge variant
  const getStateBadgeVariant = (state: string) => {
    switch (state) {
      case 'ACTIVE': return 'default';
      case 'CANDIDATE': return 'secondary';
      case 'PRE': return 'outline';
      default: return 'secondary';
    }
  };

  return (
    <Card className={`p-4 hover:shadow-md transition-shadow ${className}`} data-testid={`signal-card-${safeSignal.id}`}>
      <div className="space-y-3">
        {/* Header with state and confidence */}
        <div className="flex items-center justify-between">
          <Badge 
            variant={getStateBadgeVariant(safeSignal.state)}
            data-testid={`signal-state-${safeSignal.id}`}
          >
            {safeSignal.state}
          </Badge>
          <div className="flex items-center space-x-1">
            <div 
              className={`w-2 h-2 rounded-full ${getConfidenceColor(safeSignal.confidence)}`}
            />
            <span 
              className="text-sm font-medium"
              data-testid={`signal-confidence-${safeSignal.id}`}
            >
              {formatConfidence(safeSignal.confidence)}
            </span>
          </div>
        </div>

        {/* Teams */}
        <div className="text-center">
          <div 
            className="font-semibold text-foreground truncate"
            data-testid={`signal-teams-${safeSignal.id}`}
            title={`${safeSignal.homeTeam} vs ${safeSignal.awayTeam}`}
          >
            {safeSignal.homeTeam} vs {safeSignal.awayTeam}
          </div>
        </div>

        {/* Market and Selection */}
        <div className="bg-muted p-2 rounded text-center">
          <div 
            className="text-sm text-muted-foreground"
            data-testid={`signal-market-${safeSignal.id}`}
          >
            {safeSignal.market}
          </div>
          <div 
            className="font-medium"
            data-testid={`signal-selection-${safeSignal.id}`}
          >
            {safeSignal.selection}
          </div>
        </div>

        {/* Bottom info */}
        <div className="flex justify-between items-center text-xs text-muted-foreground">
          <div className="flex items-center space-x-1">
            <Clock className="w-3 h-3" />
            <span data-testid={`signal-minute-${safeSignal.id}`}>
              {formatMinute(safeSignal.minute)}
            </span>
          </div>
          
          <div className="flex items-center space-x-1">
            <Target className="w-3 h-3" />
            <span data-testid={`signal-ttl-${safeSignal.id}`}>
              {formatTTL(signal.ttl_left)}
            </span>
          </div>
        </div>

        {/* Reasoning (if available) */}
        {safeSignal.reasoning && safeSignal.reasoning !== "No reasoning provided" && (
          <div className="text-xs text-muted-foreground bg-muted/50 p-2 rounded">
            <TrendingUp className="w-3 h-3 inline mr-1" />
            <span 
              className="truncate"
              title={safeSignal.reasoning}
              data-testid={`signal-reasoning-${safeSignal.id}`}
            >
              {safeSignal.reasoning}
            </span>
          </div>
        )}
      </div>
    </Card>
  );
}