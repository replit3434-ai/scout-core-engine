import { useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { ConfigurationPanel } from "@/components/configuration-panel";
import { ArrowLeft } from "lucide-react";

export default function Settings() {
  const [showConfigPanel, setShowConfigPanel] = useState(false);

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
                <h1 className="text-xl font-bold text-foreground" data-testid="settings-title">Settings</h1>
                <p className="text-sm text-muted-foreground">Market configuration and system settings</p>
              </div>
            </div>
            <Button 
              variant="default" 
              size="sm"
              onClick={() => setShowConfigPanel(true)}
              data-testid="open-settings-modal"
            >
              Configure Markets
            </Button>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-6 py-6">
        {/* Settings Content */}
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-4">
              <h2 className="text-lg font-semibold">System Configuration</h2>
              <div className="space-y-3">
                <div className="flex justify-between items-center p-3 border rounded">
                  <span>API Rate Limit</span>
                  <span className="font-mono text-sm">60 req/min</span>
                </div>
                <div className="flex justify-between items-center p-3 border rounded">
                  <span>Update Interval</span>
                  <span className="font-mono text-sm">30 seconds</span>
                </div>
                <div className="flex justify-between items-center p-3 border rounded">
                  <span>Confidence Threshold</span>
                  <span className="font-mono text-sm">60%</span>
                </div>
              </div>
            </div>
            
            <div className="space-y-4">
              <h2 className="text-lg font-semibold">Active Leagues</h2>
              <div className="space-y-3">
                <div className="flex justify-between items-center p-3 border rounded">
                  <span>🇩🇪 Germany Bundesliga</span>
                  <span className="text-green-500 text-sm">Active</span>
                </div>
                <div className="flex justify-between items-center p-3 border rounded">
                  <span>🇳🇴 Norway Eliteserien</span>
                  <span className="text-green-500 text-sm">Active</span>
                </div>
                <div className="flex justify-between items-center p-3 border rounded">
                  <span>🇮🇹 Italy Serie A</span>
                  <span className="text-green-500 text-sm">Active</span>
                </div>
                <div className="flex justify-between items-center p-3 border rounded">
                  <span>🇹🇷 Turkey Super Lig</span>
                  <span className="text-green-500 text-sm">Active</span>
                </div>
                <div className="flex justify-between items-center p-3 border rounded">
                  <span>🇧🇷 Brazil Serie A</span>
                  <span className="text-green-500 text-sm">Active</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Configuration Panel Modal */}
        {showConfigPanel && (
          <ConfigurationPanel onClose={() => setShowConfigPanel(false)} />
        )}
      </div>
    </div>
  );
}