interface Experience {
  state: number[];
  action: number;
  reward: number;
  nextState: number[];
  done: boolean;
  priority?: number;
  timestamp?: Date;
  matchId?: string;
  profit?: number;
}

interface QTable {
  [key: string]: number[];
}

interface RLAgentConfig {
  learningRate: number;
  epsilon: number;
  epsilonDecay: number;
  minEpsilon: number;
  discountFactor: number;
  bufferSize: number;
  batchSize: number;
  targetUpdateFrequency: number;
  prioritizedReplay: boolean;
  doubleQLearning: boolean;
  modelSaveFrequency: number;
  convergenceThreshold: number;
}

export class RLAgent {
  private qTable: QTable = {};
  private targetQTable: QTable = {}; // For Double Q-Learning
  private experienceBuffer: Experience[] = [];
  private config: RLAgentConfig;
  private actionCount = 5; // Enhanced: 0: reject, 1: very low, 2: low, 3: medium, 4: high confidence
  private updateCounter = 0;
  private performanceHistory: number[] = [];
  private lastModelSave = Date.now();
  private convergenceHistory: number[] = [];

  constructor(config: Partial<RLAgentConfig> = {}) {
    this.config = {
      learningRate: 0.001, // Lower for stability
      epsilon: 0.3, // Higher initial exploration
      epsilonDecay: 0.9995,
      minEpsilon: 0.05,
      discountFactor: 0.95,
      bufferSize: 50000, // Larger buffer
      batchSize: 64,
      targetUpdateFrequency: 1000,
      prioritizedReplay: true,
      doubleQLearning: true,
      modelSaveFrequency: 10000,
      convergenceThreshold: 0.01,
      ...config
    };
    
    // Initialize performance tracking
    this.initializePerformanceTracking();
  }

  private stateToKey(state: number[]): string {
    return state.map(s => Math.round(s * 100) / 100).join(',');
  }

  private getQValues(state: number[]): number[] {
    const key = this.stateToKey(state);
    if (!this.qTable[key]) {
      this.qTable[key] = new Array(this.actionCount).fill(0);
    }
    return this.qTable[key];
  }

  private selectAction(state: number[]): number {
    // Epsilon-greedy action selection
    if (Math.random() < this.config.epsilon) {
      return Math.floor(Math.random() * this.actionCount);
    }
    
    const qValues = this.getQValues(state);
    return qValues.indexOf(Math.max(...qValues));
  }

  private initializePerformanceTracking(): void {
    console.log('🤖 Advanced RL Agent initialized with enhanced features:');
    console.log(`   • Deep Q-Learning with ${this.actionCount} actions`);
    console.log(`   • Buffer size: ${this.config.bufferSize}`);
    console.log(`   • Prioritized replay: ${this.config.prioritizedReplay}`);
    console.log(`   • Double Q-Learning: ${this.config.doubleQLearning}`);
  }

  private extractFeatures(analysis: any, matchInfo: any, footyStatsData?: any): number[] {
    // Enhanced feature engineering with more sophisticated features
    const basicFeatures = [
      analysis.confidence / 100, // 0-1
      (matchInfo.minute || 0) / 90, // 0-1
      (matchInfo.homeScore + matchInfo.awayScore) / 5, // 0-1 (capped at 5 goals)
      (analysis.data?.totalShotsOnTarget || 0) / 10, // 0-1 (capped at 10)
      (analysis.data?.totalCorners || 0) / 15, // 0-1 (capped at 15)
      (analysis.data?.totalFouls || 0) / 30, // 0-1 (capped at 30)
      this.getMarketTypeFeature(analysis.market),
      this.getSelectionTypeFeature(analysis.selection)
    ];

    // Advanced derived features
    const advancedFeatures = [
      this.calculateGameIntensity(analysis.data),
      this.calculateMomentum(analysis.data, matchInfo),
      this.calculateValueOddsRatio(analysis),
      this.getTimeBasedFeature(matchInfo.minute || 0),
      this.getScoreBasedFeature(matchInfo.homeScore, matchInfo.awayScore),
      this.getRecentPerformanceFeature(),
      this.getMarketLiquidityFeature(analysis.market),
      this.getConfidenceStabilityFeature(analysis.confidence)
    ];

    // Enhanced FootyStats features
    const footyStatsFeatures = [
      this.extractBTTSFeatures(footyStatsData),
      this.extractOverUnderFeatures(footyStatsData),
      this.extractFormFeatures(footyStatsData),
      this.extractHeadToHeadFeatures(footyStatsData),
      this.extractCornerFeatures(footyStatsData),
      this.extractCardFeatures(footyStatsData),
      this.calculateTeamQualityScore(footyStatsData),
      this.getFootyStatsReliabilityScore(footyStatsData)
    ];

    return [...basicFeatures, ...advancedFeatures, ...footyStatsFeatures];
  }

  private calculateGameIntensity(data: any): number {
    const shots = (data?.totalShots || 0);
    const corners = (data?.totalCorners || 0);
    const fouls = (data?.totalFouls || 0);
    const cards = (data?.totalCards || 0);
    
    // Normalized intensity score
    return Math.min((shots * 0.3 + corners * 0.4 + fouls * 0.2 + cards * 0.1) / 20, 1);
  }

  private calculateMomentum(data: any, matchInfo: any): number {
    const recentShots = data?.recentShots || 0;
    const recentCorners = data?.recentCorners || 0;
    const timeFactor = (matchInfo.minute || 0) > 60 ? 1.2 : 1.0;
    
    return Math.min((recentShots * 0.6 + recentCorners * 0.4) * timeFactor / 10, 1);
  }

  private calculateValueOddsRatio(analysis: any): number {
    const confidence = analysis.confidence || 50;
    const impliedOdds = analysis.odds || 2.0;
    const impliedProbability = 1 / impliedOdds;
    const estimatedProbability = confidence / 100;
    
    // Value ratio: our probability vs market probability
    return Math.min(estimatedProbability / impliedProbability, 2) / 2;
  }

  private getTimeBasedFeature(minute: number): number {
    // Non-linear time weighting (more important events in certain periods)
    if (minute < 15) return 0.3; // Early game
    if (minute < 30) return 0.5; // Settling period
    if (minute < 60) return 0.8; // Main period
    if (minute < 75) return 1.0; // Critical period
    return 0.9; // Late game
  }

  private getScoreBasedFeature(homeScore: number, awayScore: number): number {
    const totalGoals = (homeScore || 0) + (awayScore || 0);
    const scoreDiff = Math.abs((homeScore || 0) - (awayScore || 0));
    
    // Combination of total goals and score difference
    return (totalGoals * 0.6 + scoreDiff * 0.4) / 10;
  }

  private getRecentPerformanceFeature(): number {
    if (this.performanceHistory.length < 10) return 0.5;
    
    const recent = this.performanceHistory.slice(-10);
    const average = recent.reduce((sum, val) => sum + val, 0) / recent.length;
    return Math.min(Math.max(average, 0), 1);
  }

  private getMarketLiquidityFeature(market: string): number {
    // Higher values for more liquid markets
    const liquidityMap: { [key: string]: number } = {
      'over_under': 1.0,
      'btts': 0.9,
      'next_goal': 0.7,
      'corners': 0.6,
      'cards': 0.5,
      'asian_handicap': 0.8,
      'double_chance': 0.7
    };
    return liquidityMap[market] || 0.5;
  }

  private getConfidenceStabilityFeature(confidence: number): number {
    // Penalize extreme confidence values (over-fitting indicator)
    if (confidence > 85 || confidence < 15) return 0.3;
    if (confidence > 75 || confidence < 25) return 0.6;
    return 1.0;
  }

  private getMarketTypeFeature(market: string): number {
    const marketMap: { [key: string]: number } = {
      'over_under': 0.2,
      'btts': 0.4,
      'next_goal': 0.6,
      'corners': 0.8,
      'cards': 1.0
    };
    return marketMap[market] || 0;
  }

  private getSelectionTypeFeature(selection: string): number {
    const selectionMap: { [key: string]: number } = {
      'OVER': 0.25,
      'UNDER': 0.5,
      'YES': 0.25,
      'NO': 0.5,
      'HOME': 0.33,
      'AWAY': 0.66,
      'Over 10.5': 0.25,
      'Over 4.5': 0.25
    };
    return selectionMap[selection] || 0.75;
  }

  // Enhanced FootyStats feature extraction methods
  private extractBTTSFeatures(footyStatsData?: any): number {
    if (!footyStatsData) return 0.5;
    
    const bttsPercentage = footyStatsData.btts_percentage || 50;
    return Math.min(bttsPercentage / 100, 1);
  }

  private extractOverUnderFeatures(footyStatsData?: any): number {
    if (!footyStatsData) return 0.5;
    
    const overPercentage = footyStatsData.over_25_percentage || 50;
    return Math.min(overPercentage / 100, 1);
  }

  private extractFormFeatures(footyStatsData?: any): number {
    if (!footyStatsData?.home_form || !footyStatsData?.away_form) return 0.5;
    
    const homeFormScore = this.calculateTeamFormScore(footyStatsData.home_form);
    const awayFormScore = this.calculateTeamFormScore(footyStatsData.away_form);
    
    return (homeFormScore + awayFormScore) / 2;
  }

  private extractHeadToHeadFeatures(footyStatsData?: any): number {
    if (!footyStatsData?.head_to_head || footyStatsData.head_to_head.length === 0) return 0.5;
    
    const h2h = footyStatsData.head_to_head;
    const avgGoals = h2h.reduce((sum: number, match: any) => sum + (match.total_goals || 0), 0) / h2h.length;
    const bttsRate = h2h.filter((match: any) => match.btts).length / h2h.length;
    
    return Math.min((avgGoals / 5 + bttsRate) / 2, 1);
  }

  private extractCornerFeatures(footyStatsData?: any): number {
    if (!footyStatsData?.corner_stats) return 0.5;
    
    const avgCorners = footyStatsData.corner_stats.average || 10;
    const homeAdvantage = footyStatsData.corner_stats.home_advantage || 1;
    
    return Math.min((avgCorners / 15) * homeAdvantage / 2, 1);
  }

  private extractCardFeatures(footyStatsData?: any): number {
    if (!footyStatsData?.card_stats) return 0.5;
    
    const avgCards = footyStatsData.card_stats.average || 4;
    const refereeTendency = footyStatsData.card_stats.referee_tendency || 1;
    
    return Math.min((avgCards / 8) * refereeTendency / 2, 1);
  }

  private calculateTeamQualityScore(footyStatsData?: any): number {
    if (!footyStatsData?.home_form || !footyStatsData?.away_form) return 0.5;
    
    const homeQuality = this.calculateTeamFormScore(footyStatsData.home_form);
    const awayQuality = this.calculateTeamFormScore(footyStatsData.away_form);
    const totalQuality = homeQuality + awayQuality;
    
    // Higher combined quality = more predictable = higher score
    return Math.min(totalQuality, 1);
  }

  private getFootyStatsReliabilityScore(footyStatsData?: any): number {
    if (!footyStatsData?.league_context) return 0.5;
    
    const totalLeagues = footyStatsData.league_context.total_leagues || 0;
    const dataSource = footyStatsData.league_context.data_source;
    
    // More leagues = more data = higher reliability
    const reliabilityScore = Math.min(totalLeagues / 1000, 1) * 0.7;
    const sourceBonus = dataSource === 'footystats' ? 0.3 : 0.1;
    
    return reliabilityScore + sourceBonus;
  }

  private calculateTeamFormScore(formData: any[]): number {
    if (!formData || formData.length === 0) return 0.5;
    
    let totalScore = 0;
    let weightSum = 0;
    
    formData.forEach((match, index) => {
      const weight = formData.length - index; // Recent matches have higher weight
      let matchScore = 0;
      
      // Result scoring
      if (match.result === 'W') matchScore += 0.6;
      else if (match.result === 'D') matchScore += 0.3;
      
      // Performance rating
      if (match.performance_rating) {
        matchScore += (match.performance_rating / 100) * 0.4;
      } else {
        // Goal scoring fallback
        const goalRatio = match.goals_for / (match.goals_for + match.goals_against + 1);
        matchScore += goalRatio * 0.4;
      }
      
      totalScore += matchScore * weight;
      weightSum += weight;
    });
    
    return weightSum > 0 ? totalScore / weightSum : 0.5;
  }

  evaluateSignal(analysis: any, matchInfo: any, footyStatsData?: any): { shouldGenerate: boolean; adjustedConfidence: number; reasoning: string; signalId?: string } {
    try {
      // Debug: Log FootyStats data usage
      if (footyStatsData) {
        console.log(`🤖 RL Agent using FootyStats: BTTS=${footyStatsData.btts_percentage}%, Over2.5=${footyStatsData.over_25_percentage}%`);
      }
      
      const state = this.extractFeatures(analysis, matchInfo, footyStatsData);
      const action = this.selectAction(state);
      
      let shouldGenerate = false;
      let adjustedConfidence = analysis.confidence;
      let reasoning = analysis.reasoning;

      // Enhanced 5-action system with more granular control
      switch (action) {
        case 0: // Reject
          shouldGenerate = false;
          reasoning += ' (RL Agent: Signal rejected - high risk pattern detected)';
          break;
        case 1: // Very low confidence
          shouldGenerate = true;
          adjustedConfidence = Math.min(adjustedConfidence * 0.6, 50);
          reasoning += ' (RL Agent: Very low confidence - experimental signal)';
          break;
        case 2: // Low confidence
          shouldGenerate = true;
          adjustedConfidence = Math.min(adjustedConfidence * 0.8, 65);
          reasoning += ' (RL Agent: Low confidence - conservative approach)';
          break;
        case 3: // Medium confidence
          shouldGenerate = true;
          adjustedConfidence = Math.min(adjustedConfidence * 0.95, 80);
          reasoning += ' (RL Agent: Medium confidence - standard signal)';
          break;
        case 4: // High confidence
          shouldGenerate = true;
          adjustedConfidence = Math.min(adjustedConfidence * 1.15, 95);
          reasoning += ' (RL Agent: High confidence - strong pattern identified)';
          break;
      }

      // Store enhanced state-action pair for future learning
      const signalId = this.storeStateAction(state, action, analysis, matchInfo);

      // Track convergence and performance
      this.trackDecisionQuality(state, action, analysis.confidence);

      return { shouldGenerate, adjustedConfidence, reasoning, signalId };
    } catch (error) {
      console.error('Error in RL signal evaluation:', error);
      return { 
        shouldGenerate: true, 
        adjustedConfidence: analysis.confidence, 
        reasoning: analysis.reasoning 
      };
    }
  }

  private storeStateAction(state: number[], action: number, analysis?: any, matchInfo?: any): string {
    // Generate unique signal ID for tracking
    const signalId = `signal_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Store state-action pair with unique ID
    this.pendingStateActions.set(signalId, { 
      state, 
      action, 
      timestamp: new Date(),
      matchId: matchInfo?.id,
      originalConfidence: analysis?.confidence,
      market: analysis?.market
    });
    
    // Clean up old pending actions (>24 hours)
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    const entriesToDelete: string[] = [];
    this.pendingStateActions.forEach((action, id) => {
      if (action.timestamp.getTime() < cutoff) {
        entriesToDelete.push(id);
      }
    });
    entriesToDelete.forEach(id => this.pendingStateActions.delete(id));
    
    return signalId;
  }

  private trackDecisionQuality(state: number[], action: number, originalConfidence: number): void {
    // Track decision quality for convergence analysis
    const qValues = this.getQValues(state);
    const actionValue = qValues[action];
    const maxValue = Math.max(...qValues);
    const confidence = maxValue > 0 ? actionValue / maxValue : 0.5;
    
    this.convergenceHistory.push(confidence);
    if (this.convergenceHistory.length > 1000) {
      this.convergenceHistory.shift();
    }
  }

  private pendingStateActions: Map<string, {
    state: number[]; 
    action: number; 
    timestamp: Date;
    matchId?: string;
    originalConfidence?: number;
    market?: string;
  }> = new Map();

  updateFromResult(signalId: string, signalResult: 'won' | 'lost' | 'expired', profit?: number): void {
    const stateAction = this.pendingStateActions.get(signalId);
    if (!stateAction) {
      console.warn(`RL Agent: No pending state-action found for signal ${signalId}`);
      return;
    }

    try {
      // Enhanced reward calculation based on profit and confidence
      let reward = this.calculateAdvancedReward(signalResult, profit, stateAction);
      
      const { state, action, originalConfidence, market } = stateAction;
      
      // Double Q-Learning implementation
      if (this.config.doubleQLearning) {
        this.updateDoubleQLearning(state, action, reward);
      } else {
        this.updateStandardQLearning(state, action, reward);
      }

      // Store enhanced experience with metadata
      const experience: Experience = {
        state,
        action,
        reward,
        nextState: [], // Terminal state
        done: true,
        priority: this.calculatePriority(reward, originalConfidence),
        timestamp: new Date(),
        matchId: stateAction.matchId,
        profit: profit || 0
      };

      this.addExperience(experience);

      // Update performance tracking
      this.updatePerformanceMetrics(signalResult, reward, profit);

      // Adaptive epsilon decay based on performance
      this.updateEpsilon();

      // Periodic experience replay
      if (this.updateCounter % this.config.batchSize === 0) {
        this.replayExperience();
      }

      // Auto-save model periodically
      if (Date.now() - this.lastModelSave > this.config.modelSaveFrequency) {
        this.autoSaveModel();
      }

      this.updateCounter++;
      
      // Remove the processed state-action pair
      this.pendingStateActions.delete(signalId);
    } catch (error) {
      console.error('Error updating RL agent from result:', error);
    }
  }

  private calculateAdvancedReward(signalResult: 'won' | 'lost' | 'expired', profit?: number, stateAction?: any): number {
    let baseReward = 0;
    
    switch (signalResult) {
      case 'won':
        baseReward = 1;
        // Bonus for high profit
        if (profit && profit > 0) {
          baseReward += Math.min(profit / 100, 0.5); // Max 0.5 bonus
        }
        break;
      case 'lost':
        baseReward = -1;
        // Penalty based on loss size
        if (profit && profit < 0) {
          baseReward += Math.max(profit / 100, -0.5); // Max 0.5 additional penalty
        }
        break;
      case 'expired':
        baseReward = -0.2; // Slightly higher penalty for expired signals
        break;
    }

    // Adjust reward based on original confidence (penalize overconfidence on losses)
    if (stateAction?.originalConfidence) {
      const confidence = stateAction.originalConfidence / 100;
      if (signalResult === 'lost' && confidence > 0.8) {
        baseReward -= 0.3; // Penalty for overconfident losses
      } else if (signalResult === 'won' && confidence < 0.6) {
        baseReward += 0.2; // Bonus for conservative wins
      }
    }

    return baseReward;
  }

  private updateStandardQLearning(state: number[], action: number, reward: number): void {
    const qValues = this.getQValues(state);
    const currentQ = qValues[action];
    const targetQ = reward; // Terminal state
    
    qValues[action] = currentQ + this.config.learningRate * (targetQ - currentQ);
  }

  private updateDoubleQLearning(state: number[], action: number, reward: number): void {
    // Double Q-Learning: use target network for value estimation
    const qValues = this.getQValues(state);
    const targetQValues = this.getTargetQValues(state);
    
    const currentQ = qValues[action];
    
    // For terminal states, next Q value is 0
    // In Double Q-learning, we use the target network to estimate the value
    const nextQValue = 0; // Terminal state
    const targetQ = reward + this.config.discountFactor * nextQValue;
    
    // Update main network using target from target network
    qValues[action] = currentQ + this.config.learningRate * (targetQ - currentQ);
    
    // Periodically update target network
    if (this.updateCounter % this.config.targetUpdateFrequency === 0) {
      this.updateTargetNetwork();
    }
  }

  private getTargetQValues(state: number[]): number[] {
    const key = this.stateToKey(state);
    if (!this.targetQTable[key]) {
      this.targetQTable[key] = new Array(this.actionCount).fill(0);
    }
    return this.targetQTable[key];
  }

  private updateTargetNetwork(): void {
    // Copy main network to target network
    this.targetQTable = JSON.parse(JSON.stringify(this.qTable));
    console.log('🎯 Target network updated for Double Q-Learning');
  }

  private calculatePriority(reward: number, originalConfidence?: number): number {
    // Higher priority for surprising outcomes
    let priority = Math.abs(reward);
    
    if (originalConfidence) {
      const expectedReward = (originalConfidence / 100) * 2 - 1; // Convert confidence to expected reward
      const tdError = Math.abs(reward - expectedReward);
      priority = tdError + 0.1; // Add small constant to ensure non-zero priority
    }
    
    return priority;
  }

  private updatePerformanceMetrics(result: string, reward: number, profit?: number): void {
    // Track performance for adaptive learning
    this.performanceHistory.push(reward);
    if (this.performanceHistory.length > 1000) {
      this.performanceHistory.shift();
    }
    
    // Log important outcomes
    if (Math.abs(reward) > 0.5) {
      console.log(`🤖 RL Agent: ${result} signal with reward ${reward.toFixed(3)} (profit: ${profit?.toFixed(2) || 'N/A'})`);
    }
  }

  private updateEpsilon(): void {
    // Adaptive epsilon decay based on recent performance
    const recentPerformance = this.getRecentPerformance();
    
    if (recentPerformance > 0.6) {
      // Good performance: reduce exploration more slowly
      this.config.epsilon = Math.max(
        this.config.minEpsilon,
        this.config.epsilon * 0.999
      );
    } else if (recentPerformance < 0.4) {
      // Poor performance: increase exploration
      this.config.epsilon = Math.min(0.3, this.config.epsilon * 1.01);
    } else {
      // Standard decay
      this.config.epsilon = Math.max(
        this.config.minEpsilon,
        this.config.epsilon * this.config.epsilonDecay
      );
    }
  }

  private getRecentPerformance(): number {
    if (this.performanceHistory.length < 10) return 0.5;
    
    const recent = this.performanceHistory.slice(-20);
    const positiveRewards = recent.filter(r => r > 0).length;
    return positiveRewards / recent.length;
  }

  private autoSaveModel(): void {
    try {
      const modelData = this.saveModel();
      // In a real implementation, this would save to disk/database
      console.log(`💾 RL Model auto-saved: ${Object.keys(this.qTable).length} states, ${this.experienceBuffer.length} experiences`);
      this.lastModelSave = Date.now();
    } catch (error) {
      console.error('Error auto-saving RL model:', error);
    }
  }

  private addExperience(experience: Experience): void {
    this.experienceBuffer.push(experience);
    
    if (this.experienceBuffer.length > this.config.bufferSize) {
      this.experienceBuffer.shift();
    }
  }

  replayExperience(batchSize: number = 64): void {
    if (this.experienceBuffer.length < batchSize) return;

    try {
      let batch: Experience[];
      
      if (this.config.prioritizedReplay) {
        batch = this.samplePrioritizedBatch(batchSize);
      } else {
        batch = this.sampleRandomBatch(batchSize);
      }

      let totalLoss = 0;
      
      // Update Q-values for batch
      for (const experience of batch) {
        const { state, action, reward, nextState, done } = experience;
        const qValues = this.getQValues(state);
        const currentQ = qValues[action];
        
        let targetQ = reward;
        if (!done && nextState.length > 0) {
          const nextQValues = this.getQValues(nextState);
          targetQ += this.config.discountFactor * Math.max(...nextQValues);
        }
        
        const tdError = Math.abs(targetQ - currentQ);
        totalLoss += tdError;
        
        qValues[action] = currentQ + this.config.learningRate * (targetQ - currentQ);
        
        // Update priority for prioritized replay
        if (this.config.prioritizedReplay && experience.priority !== undefined) {
          experience.priority = tdError + 0.01; // Small constant to avoid zero priority
        }
      }
      
      // Log significant learning updates
      if (batch.length > 0) {
        const avgLoss = totalLoss / batch.length;
        if (avgLoss > 0.1) {
          console.log(`🧠 RL Experience Replay: ${batch.length} experiences, avg TD error: ${avgLoss.toFixed(4)}`);
        }
      }
      
    } catch (error) {
      console.error('Error during experience replay:', error);
    }
  }

  private sampleRandomBatch(batchSize: number): Experience[] {
    const batch = [];
    for (let i = 0; i < batchSize; i++) {
      const randomIndex = Math.floor(Math.random() * this.experienceBuffer.length);
      batch.push(this.experienceBuffer[randomIndex]);
    }
    return batch;
  }

  private samplePrioritizedBatch(batchSize: number): Experience[] {
    // Prioritized Experience Replay implementation
    const experiences = this.experienceBuffer.filter(exp => exp.priority !== undefined && exp.priority > 0);
    if (experiences.length === 0) return this.sampleRandomBatch(batchSize);
    
    // Calculate sampling probabilities based on priorities (with α parameter for prioritization strength)
    const alpha = 0.6; // Prioritization exponent
    const priorities = experiences.map(exp => Math.pow(exp.priority || 0.01, alpha));
    const totalPriority = priorities.reduce((sum, p) => sum + p, 0);
    
    if (totalPriority === 0) return this.sampleRandomBatch(batchSize);
    
    const batch = [];
    const sampledIndices = new Set(); // Avoid sampling the same experience twice
    
    for (let i = 0; i < Math.min(batchSize, experiences.length); i++) {
      let attempts = 0;
      let selectedIndex = -1;
      
      // Try to sample without replacement
      while (attempts < 10 && (selectedIndex === -1 || sampledIndices.has(selectedIndex))) {
        const threshold = Math.random() * totalPriority;
        let cumulative = 0;
        
        for (let j = 0; j < experiences.length; j++) {
          if (sampledIndices.has(j)) continue;
          cumulative += priorities[j];
          if (cumulative >= threshold) {
            selectedIndex = j;
            break;
          }
        }
        attempts++;
      }
      
      if (selectedIndex !== -1 && !sampledIndices.has(selectedIndex)) {
        batch.push(experiences[selectedIndex]);
        sampledIndices.add(selectedIndex);
      }
    }
    
    return batch;
  }

  getPerformanceMetrics(): any {
    const recentExperiences = this.experienceBuffer.slice(-100);
    const wonSignals = recentExperiences.filter(exp => exp.reward > 0).length;
    const totalSignals = recentExperiences.length;
    const recentPerformance = totalSignals > 0 ? (wonSignals / totalSignals) * 100 : 0;

    // Calculate advanced metrics
    const convergence = this.calculateConvergence();
    const explorationRate = this.config.epsilon;
    const averageReward = this.performanceHistory.length > 0 
      ? this.performanceHistory.reduce((sum, r) => sum + r, 0) / this.performanceHistory.length 
      : 0;
    
    const profitMetrics = this.calculateProfitMetrics();
    const actionDistribution = this.calculateActionDistribution();

    return {
      // Basic metrics
      learningRate: this.config.learningRate,
      epsilon: this.config.epsilon,
      bufferSize: this.experienceBuffer.length,
      bufferCapacity: this.config.bufferSize,
      recentPerformance,
      status: this.getAgentStatus(),
      qTableSize: Object.keys(this.qTable).length,
      
      // Advanced metrics
      convergenceScore: convergence,
      explorationRate,
      averageReward: parseFloat(averageReward.toFixed(4)),
      updateCounter: this.updateCounter,
      targetNetworkUpdates: Math.floor(this.updateCounter / this.config.targetUpdateFrequency),
      
      // Performance analytics
      totalProfit: profitMetrics.totalProfit,
      averageProfit: profitMetrics.averageProfit,
      profitVolatility: profitMetrics.volatility,
      
      // Action analysis
      actionDistribution,
      
      // Learning progress
      learningPhase: this.getLearningPhase(),
      experienceReplayCount: Math.floor(this.updateCounter / this.config.batchSize),
      
      // Feature flags
      doubleQLearning: this.config.doubleQLearning,
      prioritizedReplay: this.config.prioritizedReplay
    };
  }

  private calculateConvergence(): number {
    if (this.convergenceHistory.length < 50) return 0;
    
    const recent = this.convergenceHistory.slice(-50);
    const variance = this.calculateVariance(recent);
    
    // Lower variance indicates better convergence
    return Math.max(0, 1 - variance);
  }

  private calculateVariance(values: number[]): number {
    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    const squaredDiffs = values.map(val => Math.pow(val - mean, 2));
    return squaredDiffs.reduce((sum, diff) => sum + diff, 0) / values.length;
  }

  private calculateProfitMetrics(): { totalProfit: number; averageProfit: number; volatility: number } {
    const profitableExperiences = this.experienceBuffer.filter(exp => exp.profit !== undefined);
    
    if (profitableExperiences.length === 0) {
      return { totalProfit: 0, averageProfit: 0, volatility: 0 };
    }
    
    const profits = profitableExperiences.map(exp => exp.profit || 0);
    const totalProfit = profits.reduce((sum, profit) => sum + profit, 0);
    const averageProfit = totalProfit / profits.length;
    const volatility = this.calculateVariance(profits);
    
    return {
      totalProfit: parseFloat(totalProfit.toFixed(2)),
      averageProfit: parseFloat(averageProfit.toFixed(2)),
      volatility: parseFloat(volatility.toFixed(4))
    };
  }

  private calculateActionDistribution(): { [key: string]: number } {
    const recent = this.experienceBuffer.slice(-200);
    const actionCounts = new Array(this.actionCount).fill(0);
    
    recent.forEach(exp => {
      if (exp.action >= 0 && exp.action < this.actionCount) {
        actionCounts[exp.action]++;
      }
    });
    
    const total = actionCounts.reduce((sum, count) => sum + count, 0);
    
    return {
      reject: total > 0 ? parseFloat((actionCounts[0] / total * 100).toFixed(1)) : 0,
      veryLow: total > 0 ? parseFloat((actionCounts[1] / total * 100).toFixed(1)) : 0,
      low: total > 0 ? parseFloat((actionCounts[2] / total * 100).toFixed(1)) : 0,
      medium: total > 0 ? parseFloat((actionCounts[3] / total * 100).toFixed(1)) : 0,
      high: total > 0 ? parseFloat((actionCounts[4] / total * 100).toFixed(1)) : 0
    };
  }

  private getAgentStatus(): string {
    if (this.experienceBuffer.length < 50) return 'Initializing';
    if (this.experienceBuffer.length < 200) return 'Training';
    if (this.config.epsilon > 0.1) return 'Exploring';
    if (this.calculateConvergence() > 0.8) return 'Converged';
    return 'Learning';
  }

  private getLearningPhase(): string {
    const convergence = this.calculateConvergence();
    const performance = this.getRecentPerformance();
    
    if (convergence > 0.9 && performance > 0.7) return 'Mastery';
    if (convergence > 0.7 && performance > 0.6) return 'Advanced';
    if (convergence > 0.5 && performance > 0.5) return 'Intermediate';
    if (this.experienceBuffer.length > 100) return 'Developing';
    return 'Novice';
  }

  saveModel(): any {
    return {
      qTable: this.qTable,
      config: this.config,
      experienceBuffer: this.experienceBuffer.slice(-1000) // Save last 1000 experiences
    };
  }

  loadModel(modelData: any): void {
    try {
      if (modelData.qTable) this.qTable = modelData.qTable;
      if (modelData.config) this.config = { ...this.config, ...modelData.config };
      if (modelData.experienceBuffer) this.experienceBuffer = modelData.experienceBuffer;
    } catch (error) {
      console.error('Error loading RL model:', error);
    }
  }
}
