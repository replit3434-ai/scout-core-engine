import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { RlAgentStats } from "@shared/schema";
import { CheckCircle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface RlAgentStatusProps {
  stats?: RlAgentStats;
}

export function RlAgentStatus({ stats }: RlAgentStatusProps) {
  if (!stats) {
    return (
      <Card className="bg-card rounded-lg border border-border p-6">
        <div className="animate-pulse space-y-4">
          <div className="flex items-center justify-between mb-6">
            <div className="h-6 bg-muted rounded w-32"></div>
            <div className="h-4 bg-muted rounded w-20"></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-muted/30 p-3 rounded-lg">
              <div className="h-3 bg-muted rounded w-20 mb-2"></div>
              <div className="h-6 bg-muted rounded w-12"></div>
            </div>
            <div className="bg-muted/30 p-3 rounded-lg">
              <div className="h-3 bg-muted rounded w-16 mb-2"></div>
              <div className="h-6 bg-muted rounded w-12"></div>
            </div>
          </div>
        </div>
      </Card>
    );
  }

  const bufferPercentage = (stats.bufferSize / stats.bufferCapacity) * 100;
  const recentPerformance = parseFloat(stats.recentPerformance);
  const lastUpdateAgo = stats.lastUpdate ? 
    formatDistanceToNow(new Date(stats.lastUpdate), { addSuffix: true }) : 
    'Unknown';

  return (
    <Card className="bg-card rounded-lg border border-border p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-foreground">RL Agent Status</h3>
        <div className="flex items-center space-x-2">
          <div className="w-2 h-2 bg-primary rounded-full animate-pulse"></div>
          <span className="text-sm text-primary" data-testid="rl-agent-status">
            {stats.status}
          </span>
        </div>
      </div>
      
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-muted/30 p-3 rounded-lg">
            <p className="text-muted-foreground text-sm">Learning Rate</p>
            <p className="text-lg font-semibold text-foreground" data-testid="learning-rate">
              {parseFloat(stats.learningRate).toFixed(3)}
            </p>
          </div>
          <div className="bg-muted/30 p-3 rounded-lg">
            <p className="text-muted-foreground text-sm">Epsilon</p>
            <p className="text-lg font-semibold text-foreground" data-testid="epsilon">
              {parseFloat(stats.epsilon).toFixed(3)}
            </p>
          </div>
        </div>
        
        <div className="bg-muted/30 p-3 rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <p className="text-muted-foreground text-sm">Experience Buffer</p>
            <p className="text-sm font-medium text-foreground" data-testid="buffer-size">
              {stats.bufferSize.toLocaleString()} / {stats.bufferCapacity.toLocaleString()}
            </p>
          </div>
          <Progress value={bufferPercentage} className="h-2" data-testid="buffer-progress" />
        </div>
        
        <div className="bg-muted/30 p-3 rounded-lg">
          <p className="text-muted-foreground text-sm mb-2">Recent Performance</p>
          <div className="flex items-center space-x-2">
            <div className="flex-1">
              <div className="flex items-center space-x-1 text-xs text-muted-foreground mb-1">
                <span>Last 100 signals</span>
              </div>
              <Progress value={recentPerformance} className="h-2" data-testid="performance-progress" />
            </div>
            <span className="text-sm font-medium text-primary" data-testid="performance-percentage">
              {recentPerformance.toFixed(0)}%
            </span>
          </div>
        </div>
        
        <div className="bg-primary/10 p-3 rounded-lg">
          <div className="flex items-center space-x-2 mb-1">
            <CheckCircle className="w-4 h-4 text-primary" />
            <p className="text-sm font-medium text-primary">Model Updated</p>
          </div>
          <p className="text-xs text-muted-foreground" data-testid="last-update">
            {lastUpdateAgo} - Performance optimization active
          </p>
        </div>
      </div>
    </Card>
  );
}
