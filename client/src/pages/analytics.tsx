import { Link } from "wouter";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MarketPerformance } from "@/components/market-performance";
import { ArrowLeft } from "lucide-react";

export default function Analytics() {
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
                <h1 className="text-xl font-bold text-foreground" data-testid="analytics-title">Analytics</h1>
                <p className="text-sm text-muted-foreground">Market performance and signal analysis</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-6 py-6 space-y-6">
        {/* Market Performance Section */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-foreground">Market Performance</h2>
          </div>
          <MarketPerformance />
        </div>

        {/* Additional Analytics Content */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4" data-testid="time-filter-select">Performance Metrics</h3>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Total Signals Generated</span>
                <span className="font-semibold" data-testid="total-signals">0</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Win Rate</span>
                <span className="font-semibold text-primary" data-testid="analytics-win-rate">0%</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Avg Confidence</span>
                <span className="font-semibold" data-testid="avg-confidence">0%</span>
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">Market Analysis</h3>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Active Markets</span>
                <span className="font-semibold" data-testid="active-markets">5</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Processing Matches</span>
                <span className="font-semibold text-primary" data-testid="processing-matches">20/25</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">FootyStats Integration</span>
                <span className="font-semibold text-primary" data-testid="footystats-status">Active</span>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}