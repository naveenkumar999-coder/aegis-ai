export interface MemoryRecord {
  stateKey: string;
  action: string;
  qValue: number;
  rewardSum: number;
  occurrences: number;
  lastUpdated: string;
}

export interface LearningStats {
  totalInteractions: number;
  learnedPatterns: number;
  averageReward: number;
  lastReflection: string;
}

class ReinforcementLearningBrain {
  private memoryMap: Map<string, MemoryRecord> = new Map();
  private alpha = 0.2; // Learning rate
  private gamma = 0.8; // Discount factor

  constructor() {
    this.loadMemory();
  }

  private loadMemory() {
    if (typeof window !== "undefined") {
      try {
        const raw = localStorage.getItem("monday_rl_memory");
        if (raw) {
          const list: MemoryRecord[] = JSON.parse(raw);
          list.forEach((rec) => this.memoryMap.set(rec.stateKey, rec));
        }
      } catch (err) {
        console.warn("Failed to load MONDAY RL memory from localStorage:", err);
      }
    }
  }

  private saveMemory() {
    if (typeof window !== "undefined") {
      try {
        const list = Array.from(this.memoryMap.values());
        localStorage.setItem("monday_rl_memory", JSON.stringify(list));
      } catch (err) {
        console.warn("Failed to save MONDAY RL memory to localStorage:", err);
      }
    }
  }

  /**
   * Generates a normalized state key from a raw user query string.
   */
  public extractStateKey(query: string): string {
    return query
      .toLowerCase()
      .trim()
      .replace(/['"!?.,]/g, "")
      .replace(/\s+/g, "_");
  }

  /**
   * Self-Reflective Internal Thinking Loop:
   * Analyzes query state, checks past rewards, and optimizes execution strategy.
   */
  public reflectAndOptimize(query: string): {
    stateKey: string;
    recommendedAction?: string;
    confidence: number;
    thoughtSummary: string;
  } {
    const stateKey = this.extractStateKey(query);
    const existing = this.memoryMap.get(stateKey);

    if (existing && existing.occurrences > 0) {
      const confidence = Math.min(0.99, 0.5 + existing.qValue * 0.1);
      return {
        stateKey,
        recommendedAction: existing.action,
        confidence,
        thoughtSummary: `[AUTONOMOUS REFLECTION]: Recognized pattern '${stateKey}' with Q-value ${existing.qValue.toFixed(
          2
        )} (Confidence: ${(confidence * 100).toFixed(0)}%). Optimizing strategy for Boss.`,
      };
    }

    // Default self-reflection for new patterns
    return {
      stateKey,
      confidence: 0.5,
      thoughtSummary: `[AUTONOMOUS REFLECTION]: New pattern '${stateKey}' registered. Initializing baseline policy & active listening.`,
    };
  }

  /**
   * Reinforcement Learning Reward Update:
   * Applies Bellman Equation Q(s,a) = Q(s,a) + alpha * [Reward + gamma * MaxQ(s') - Q(s,a)]
   */
  public recordReward(query: string, action: string, reward: number) {
    const stateKey = this.extractStateKey(query);
    const existing = this.memoryMap.get(stateKey);

    let oldQ = 0;
    let occurrences = 0;
    let rewardSum = 0;

    if (existing) {
      oldQ = existing.qValue;
      occurrences = existing.occurrences;
      rewardSum = existing.rewardSum;
    }

    const newOccurrences = occurrences + 1;
    const newRewardSum = rewardSum + reward;
    // Bellman update step
    const newQ = oldQ + this.alpha * (reward + this.gamma * oldQ - oldQ);

    const record: MemoryRecord = {
      stateKey,
      action,
      qValue: newQ,
      rewardSum: newRewardSum,
      occurrences: newOccurrences,
      lastUpdated: new Date().toISOString(),
    };

    this.memoryMap.set(stateKey, record);
    this.saveMemory();
  }

  /**
   * Returns current Reinforcement Learning Statistics for diagnostics.
   */
  public getStats(): LearningStats {
    const list = Array.from(this.memoryMap.values());
    const totalInteractions = list.reduce((acc, curr) => acc + curr.occurrences, 0);
    const totalReward = list.reduce((acc, curr) => acc + curr.rewardSum, 0);
    const averageReward = list.length > 0 ? totalReward / list.length : 0;

    return {
      totalInteractions,
      learnedPatterns: list.length,
      averageReward: Number(averageReward.toFixed(2)),
      lastReflection: new Date().toLocaleTimeString(),
    };
  }
}

export const learningBrain = new ReinforcementLearningBrain();
