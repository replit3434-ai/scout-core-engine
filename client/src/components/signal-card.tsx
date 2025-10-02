import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Signal, Match } from "@shared/schema";
import { formatDistanceToNow } from "date-fns";

interface SignalCardProps {
  signal: Signal & { match?: Match };
}

export function SignalCard({ signal }: SignalCardProps) {
  const { match } = signal;
  
  if (!match) return null;

  const confidence = parseFloat(signal.confidence);
  const isLive = match.status === 'live';
  
  // Determine confidence level styling
  const getConfidenceStyle = (confidence: number) => {
    if (confidence >= 80) return {
      cardClass: "signal-card-high",
      badgeClass: "bg-green-500/20 text-green-400 border-green-500/30",
      dotClass: "bg-green-500"
    };
    if (confidence >= 65) return {
      cardClass: "signal-card-medium", 
      badgeClass: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
      dotClass: "bg-yellow-500"
    };
    return {
      cardClass: "signal-card-low",
      badgeClass: "bg-red-500/20 text-red-400 border-red-500/30", 
      dotClass: "bg-red-500"
    };
  };

  const styles = getConfidenceStyle(confidence);

  const formatMarketDisplay = (market: string, selection: string) => {
    switch (market) {
      case 'over_under':
        return { market: 'Over/Under 2.5', selection: selection };
      case 'btts':
        return { market: 'BTTS', selection: selection };
      case 'next_goal':
        return { market: 'Next Goal', selection: selection === 'HOME' ? match.homeTeam : selection === 'AWAY' ? match.awayTeam : selection };
      case 'corners':
        return { market: 'Total Corners', selection: selection };
      case 'cards':
        return { market: 'Total Cards', selection: selection };
      default:
        return { market: market, selection: selection };
    }
  };

  const { market: displayMarket, selection: displaySelection } = formatMarketDisplay(signal.market, signal.selection);

  const timeToExpiry = signal.expiresAt ? formatDistanceToNow(new Date(signal.expiresAt), { addSuffix: true }) : '';
  const createdAgo = signal.createdAt ? formatDistanceToNow(new Date(signal.createdAt), { addSuffix: true }) : '';

  return (
    <Card className={`p-6 ${styles.cardClass} hover:shadow-lg transition-all duration-200`}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-2">
          {isLive && <div className={`w-2 h-2 ${styles.dotClass} rounded-full animate-pulse`} />}
          <span className={`text-sm font-medium ${isLive ? styles.dotClass.replace('bg-', 'text-') : 'text-muted-foreground'}`}>
            {isLive ? 'LIVE' : 'INACTIVE'}
          </span>
        </div>
        <Badge className={styles.badgeClass} data-testid="confidence-badge">
          {confidence.toFixed(0)}%
        </Badge>
      </div>
      
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-foreground" data-testid="match-teams">
              {match.homeTeam} vs {match.awayTeam}
            </h3>
            <p className="text-sm text-muted-foreground" data-testid="match-league">
              {match.league}
            </p>
          </div>
          <div className="text-right">
            {match.minute && (
              <p className="text-sm text-muted-foreground" data-testid="match-minute">
                {match.minute}'
              </p>
            )}
            <p className="text-sm font-medium" data-testid="match-score">
              {match.homeScore}-{match.awayScore}
            </p>
          </div>
        </div>
        
        <div className={`p-3 rounded-lg ${styles.cardClass.replace('signal-card-', 'bg-')}/10`}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-foreground" data-testid="signal-market">
              {displayMarket}
            </span>
            <span className={`text-sm font-medium ${styles.dotClass.replace('bg-', 'text-')}`} data-testid="signal-selection">
              {displaySelection}
            </span>
          </div>
          <p className="text-xs text-muted-foreground" data-testid="signal-reasoning">
            {signal.reasoning}
          </p>
        </div>
        
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span data-testid="signal-created">
            {createdAgo}
          </span>
          <span data-testid="signal-expires">
            Expires {timeToExpiry}
          </span>
        </div>
      </div>
    </Card>
  );
}
