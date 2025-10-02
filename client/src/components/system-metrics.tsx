import { Card } from "@/components/ui/card";
import { SystemMetrics as SystemMetricsType } from "@shared/schema";
import { Activity, Zap, Target, TrendingUp } from "lucide-react";

interface SystemMetricsProps {
  metrics?: SystemMetricsType;
}

export function SystemMetrics({ metrics }: SystemMetricsProps) {
  if (!metrics) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i} className="p-4">
            <div className="animate-pulse">
              <div className="h-4 bg-muted rounded w-20 mb-2"></div>
              <div className="h-8 bg-muted rounded w-16"></div>
            </div>
          </Card>
        ))}
      </div>
    );
  }

  const metricsData = [
    {
      title: "API Response",
      value: `${metrics.apiResponseTime}ms`,
      icon: Activity,
      color: "text-primary",
      bgColor: "bg-primary/10",
      testId: "metric-api-response"
    },
    {
      title: "Memory Usage", 
      value: metrics.memoryUsage,
      icon: Zap,
      color: "text-accent-foreground",
      bgColor: "bg-accent/50",
      testId: "metric-memory-usage"
    },
    {
      title: "Success Rate",
      value: `${parseFloat(metrics.successRate).toFixed(1)}%`,
      icon: Target,
      color: "text-primary",
      bgColor: "bg-primary/10",
      testId: "metric-success-rate"
    },
    {
      title: "Total Profit",
      value: `+€${parseFloat(metrics.totalProfit).toFixed(0)}`,
      icon: TrendingUp,
      color: "text-primary",
      bgColor: "bg-primary/10",
      testId: "metric-total-profit"
    }
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {metricsData.map((metric) => {
        const Icon = metric.icon;
        return (
          <Card key={metric.title} className="metric-card p-4 border border-border">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-muted-foreground text-sm">{metric.title}</p>
                <p 
                  className={`text-2xl font-bold text-foreground ${metric.title === 'Success Rate' || metric.title === 'Total Profit' ? 'text-primary' : ''}`}
                  data-testid={metric.testId}
                >
                  {metric.value}
                </p>
              </div>
              <div className={`w-10 h-10 ${metric.bgColor} rounded-lg flex items-center justify-center`}>
                <Icon className={`w-5 h-5 ${metric.color}`} />
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
