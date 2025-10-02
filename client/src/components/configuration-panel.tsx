import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { MarketSettings, SystemConfig, SupportedLeague } from "@shared/schema";
import { X } from "lucide-react";

interface ConfigurationPanelProps {
  onClose: () => void;
}

export function ConfigurationPanel({ onClose }: ConfigurationPanelProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch configuration data
  const { data: marketSettings } = useQuery<MarketSettings[]>({
    queryKey: ['/api/settings/markets']
  });

  const { data: systemConfig } = useQuery<SystemConfig[]>({
    queryKey: ['/api/settings/system']
  });

  const { data: supportedLeagues } = useQuery<SupportedLeague[]>({
    queryKey: ['/api/leagues']
  });

  // Mutations for updating settings
  const updateMarketMutation = useMutation({
    mutationFn: async ({ market, data }: { market: string; data: Partial<MarketSettings> }) => {
      const response = await fetch(`/api/settings/markets/${market}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (!response.ok) throw new Error('Failed to update market setting');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/settings/markets'] });
      toast({ title: "Market setting updated successfully" });
    },
    onError: () => {
      toast({ title: "Failed to update market setting", variant: "destructive" });
    }
  });

  const updateSystemConfigMutation = useMutation({
    mutationFn: async ({ key, value }: { key: string; value: string }) => {
      const response = await fetch(`/api/settings/system/${key}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value })
      });
      if (!response.ok) throw new Error('Failed to update system config');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/settings/system'] });
      toast({ title: "System configuration updated successfully" });
    },
    onError: () => {
      toast({ title: "Failed to update system configuration", variant: "destructive" });
    }
  });

  const updateLeagueMutation = useMutation({
    mutationFn: async ({ leagueId, data }: { leagueId: number; data: Partial<SupportedLeague> }) => {
      const response = await fetch(`/api/leagues/${leagueId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (!response.ok) throw new Error('Failed to update league setting');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/leagues'] });
      toast({ title: "League setting updated successfully" });
    },
    onError: () => {
      toast({ title: "Failed to update league setting", variant: "destructive" });
    }
  });

  // Get config value helper
  const getConfigValue = (key: string): string => {
    const config = systemConfig?.find(c => c.key === key);
    return config?.value || '';
  };

  const handleMarketToggle = (market: string, enabled: boolean) => {
    updateMarketMutation.mutate({ market, data: { enabled } });
  };

  const handleLeagueToggle = (leagueId: number, enabled: boolean) => {
    updateLeagueMutation.mutate({ leagueId, data: { enabled } });
  };

  const handleSystemConfigChange = (key: string, value: string) => {
    updateSystemConfigMutation.mutate({ key, value });
  };

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-border">
          <h2 className="text-2xl font-bold text-foreground">System Configuration</h2>
          <Button variant="ghost" size="sm" onClick={onClose} data-testid="close-config-button">
            <X className="w-4 h-4" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Active Leagues */}
            <Card className="p-6">
              <h3 className="text-lg font-semibold text-foreground mb-4">Active Leagues</h3>
              <div className="space-y-3 max-h-80 overflow-y-auto">
                {supportedLeagues?.map((league) => (
                  <div key={league.id} className="flex items-center justify-between p-2 hover:bg-muted/30 rounded-lg transition-colors">
                    <div className="flex items-center space-x-3">
                      <div className="w-6 h-6 bg-primary/10 rounded flex items-center justify-center">
                        <span className="text-xs font-medium text-primary">{league.flag}</span>
                      </div>
                      <div>
                        <span className="text-sm font-medium text-foreground">{league.name}</span>
                        <p className="text-xs text-muted-foreground">{league.activeMatches} active</p>
                      </div>
                    </div>
                    <Switch 
                      checked={league.enabled || false} 
                      onCheckedChange={(enabled) => handleLeagueToggle(league.leagueId, enabled)}
                      data-testid={`league-toggle-${league.leagueId}`}
                    />
                  </div>
                ))}
              </div>
            </Card>
            
            {/* Market Settings */}
            <Card className="p-6">
              <h3 className="text-lg font-semibold text-foreground mb-4">Market Settings</h3>
              <div className="space-y-4">
                {marketSettings?.map((setting) => (
                  <div key={setting.id} className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-foreground capitalize">
                        {setting.market.replace('_', ' ')}
                      </p>
                      <p className="text-xs text-muted-foreground">{setting.description}</p>
                    </div>
                    <Switch 
                      checked={setting.enabled || false} 
                      onCheckedChange={(enabled) => handleMarketToggle(setting.market, enabled)}
                      data-testid={`market-toggle-${setting.market}`}
                    />
                  </div>
                ))}
              </div>
            </Card>
            
            {/* System Configuration */}
            <Card className="p-6">
              <h3 className="text-lg font-semibold text-foreground mb-4">System Configuration</h3>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="update-interval" className="text-sm font-medium text-foreground">
                    Update Interval
                  </Label>
                  <Select 
                    value={getConfigValue('update_interval')} 
                    onValueChange={(value) => handleSystemConfigChange('update_interval', value)}
                  >
                    <SelectTrigger className="w-full mt-1" data-testid="update-interval-select">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="30">30 seconds</SelectItem>
                      <SelectItem value="60">60 seconds</SelectItem>
                      <SelectItem value="120">2 minutes</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div>
                  <Label htmlFor="signal-ttl" className="text-sm font-medium text-foreground">
                    Signal TTL
                  </Label>
                  <Select 
                    value={getConfigValue('signal_ttl')} 
                    onValueChange={(value) => handleSystemConfigChange('signal_ttl', value)}
                  >
                    <SelectTrigger className="w-full mt-1" data-testid="signal-ttl-select">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="10">10 minutes</SelectItem>
                      <SelectItem value="15">15 minutes</SelectItem>
                      <SelectItem value="20">20 minutes</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div>
                  <Label htmlFor="max-concurrent" className="text-sm font-medium text-foreground">
                    Max Concurrent Matches
                  </Label>
                  <Input 
                    id="max-concurrent"
                    type="number" 
                    value={getConfigValue('max_concurrent_matches')} 
                    onChange={(e) => handleSystemConfigChange('max_concurrent_matches', e.target.value)}
                    className="w-full mt-1"
                    data-testid="max-concurrent-input"
                  />
                </div>
                
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-foreground">Notifications</p>
                    <p className="text-xs text-muted-foreground">High confidence alerts</p>
                  </div>
                  <Switch 
                    checked={getConfigValue('notifications_enabled') === 'true'} 
                    onCheckedChange={(enabled) => handleSystemConfigChange('notifications_enabled', enabled.toString())}
                    data-testid="notifications-toggle"
                  />
                </div>
              </div>
            </Card>
          </div>
        </div>

        <div className="p-6 border-t border-border flex justify-end space-x-3">
          <Button variant="outline" onClick={onClose} data-testid="cancel-config-button">
            Cancel
          </Button>
          <Button onClick={onClose} data-testid="save-config-button">
            Save Changes
          </Button>
        </div>
      </Card>
    </div>
  );
}
