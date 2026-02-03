import * as fs from "fs";
import * as path from "path";
import logger from "../utils/logger";

/**
 * StrategyEvolver — Self-evolution module that auto-adjusts strategy
 * parameters when the agent detects performance degradation.
 *
 * After every N games, it analyzes recent results and tweaks:
 *   - Monte Carlo simulation depth
 *   - Bluff frequency multiplier
 *   - Value bet threshold
 *   - Aggression factor
 *   - Kelly fraction for bankroll management
 *
 * Changes are persisted to data/evolution_state.json for cross-session learning.
 */

export interface EvolutionParams {
  simulations: number;          // Monte Carlo depth (1000-8000)
  bluffMultiplier: number;      // Bluff frequency scale (0.2 - 2.0)
  valueBetThreshold: number;    // Equity needed for value raise (0.5 - 0.75)
  aggressionFactor: number;     // Raise sizing scale (0.5 - 1.5)
  kellyFraction: number;        // Bankroll risk fraction (0.2 - 0.7)
  maxRiskPerGame: number;       // Max % of bankroll per game (0.03 - 0.15)
  preflopTightness: number;     // Preflop hand range tightness (0.5 - 1.5)
}

interface MatchRecord {
  won: boolean;
  profit: number;
  opponentArchetype: string;
  timestamp: number;
}

interface EvolutionState {
  params: EvolutionParams;
  generation: number;
  matchHistory: MatchRecord[];
  bestWinRate: number;
  bestParams: EvolutionParams;
  totalEvolutions: number;
}

const DEFAULT_PARAMS: EvolutionParams = {
  simulations: 5000,
  bluffMultiplier: 1.0,
  valueBetThreshold: 0.65,
  aggressionFactor: 1.0,
  kellyFraction: 0.5,
  maxRiskPerGame: 0.10,
  preflopTightness: 1.0,
};

const PARAM_BOUNDS: Record<keyof EvolutionParams, [number, number]> = {
  simulations: [1000, 8000],
  bluffMultiplier: [0.2, 2.0],
  valueBetThreshold: [0.45, 0.75],
  aggressionFactor: [0.5, 1.5],
  kellyFraction: [0.2, 0.7],
  maxRiskPerGame: [0.03, 0.15],
  preflopTightness: [0.5, 1.5],
};

export class StrategyEvolver {
  private state: EvolutionState;
  private stateFilePath: string;
  private evolveEveryN: number;

  constructor(evolveEveryN: number = 10) {
    this.evolveEveryN = evolveEveryN;
    this.stateFilePath = path.resolve(__dirname, "../../data/evolution_state.json");
    this.state = this.loadState();
  }

  getParams(): EvolutionParams {
    return { ...this.state.params };
  }

  getGeneration(): number {
    return this.state.generation;
  }

  getTotalEvolutions(): number {
    return this.state.totalEvolutions;
  }

  /**
   * Record a match result and trigger evolution if enough data accumulated.
   */
  recordMatch(won: boolean, profit: number, opponentArchetype: string): EvolutionResult {
    this.state.matchHistory.push({
      won,
      profit,
      opponentArchetype,
      timestamp: Date.now(),
    });

    // Only keep last 100 records
    if (this.state.matchHistory.length > 100) {
      this.state.matchHistory = this.state.matchHistory.slice(-100);
    }

    this.saveState();

    // Check if it's time to evolve
    if (this.state.matchHistory.length % this.evolveEveryN === 0) {
      return this.evolve();
    }

    return { evolved: false, params: this.state.params, reason: "Not enough data yet" };
  }

  /**
   * Analyze recent performance and adjust parameters.
   */
  private evolve(): EvolutionResult {
    const recent = this.state.matchHistory.slice(-this.evolveEveryN);
    const wins = recent.filter(r => r.won).length;
    const winRate = wins / recent.length;
    const totalProfit = recent.reduce((sum, r) => sum + r.profit, 0);
    const avgProfit = totalProfit / recent.length;

    // Track best performance
    if (winRate > this.state.bestWinRate) {
      this.state.bestWinRate = winRate;
      this.state.bestParams = { ...this.state.params };
    }

    // Detect patterns in losses
    const archetypeLosses: Record<string, number> = {};
    for (const record of recent) {
      if (!record.won) {
        archetypeLosses[record.opponentArchetype] =
          (archetypeLosses[record.opponentArchetype] || 0) + 1;
      }
    }

    const worstArchetype = Object.entries(archetypeLosses)
      .sort((a, b) => b[1] - a[1])[0];

    const changes: string[] = [];
    const oldParams = { ...this.state.params };

    // ═══════════════════════════════════════════════
    // EVOLUTION RULES
    // ═══════════════════════════════════════════════

    // Rule 1: Losing too much overall → reduce risk, increase analysis depth
    if (winRate < 0.4) {
      this.nudge("simulations", 500);
      this.nudge("kellyFraction", -0.05);
      this.nudge("maxRiskPerGame", -0.01);
      changes.push("Losing streak → deeper analysis, lower risk");
    }

    // Rule 2: Winning a lot → can afford to be slightly more aggressive
    if (winRate > 0.65 && avgProfit > 0) {
      this.nudge("aggressionFactor", 0.05);
      this.nudge("kellyFraction", 0.03);
      changes.push("Hot streak → slightly more aggressive");
    }

    // Rule 3: Getting exploited by LAG players → tighten up, trap more
    if (worstArchetype && worstArchetype[0] === "LAG" && worstArchetype[1] >= 3) {
      this.nudge("bluffMultiplier", -0.15);
      this.nudge("valueBetThreshold", -0.03);
      this.nudge("preflopTightness", 0.1);
      changes.push("Losing to LAG → less bluffing, tighter preflop, trap more");
    }

    // Rule 4: Getting exploited by ROCK/TAG → bluff more, steal more
    if (worstArchetype && (worstArchetype[0] === "ROCK" || worstArchetype[0] === "TAG") && worstArchetype[1] >= 3) {
      this.nudge("bluffMultiplier", 0.15);
      this.nudge("aggressionFactor", 0.08);
      changes.push("Losing to tight players → more bluffs and aggression");
    }

    // Rule 5: Getting exploited by CALLING_STATION → zero bluffs, value only
    if (worstArchetype && worstArchetype[0] === "CALLING_STATION" && worstArchetype[1] >= 3) {
      this.nudge("bluffMultiplier", -0.3);
      this.nudge("valueBetThreshold", -0.05);
      changes.push("Losing to station → pure value, no bluffs");
    }

    // Rule 6: Profit negative with high aggression → dial back
    if (avgProfit < -5 && this.state.params.aggressionFactor > 1.1) {
      this.nudge("aggressionFactor", -0.1);
      this.nudge("bluffMultiplier", -0.1);
      changes.push("Bleeding chips with high aggression → pulling back");
    }

    // Rule 7: Very bad streak (< 30% WR) → partially revert to best known params
    if (winRate < 0.3 && this.state.bestWinRate > 0.5) {
      this.blendWithBest(0.3);
      changes.push("Critical losing streak → blending with best known params");
    }

    // Increment generation
    if (changes.length > 0) {
      this.state.generation++;
      this.state.totalEvolutions++;
    }

    this.saveState();

    const reason = changes.length > 0
      ? `Gen ${this.state.generation}: ${changes.join("; ")}`
      : "No changes needed";

    logger.info(`[Evolver] Win rate: ${(winRate * 100).toFixed(1)}% | Avg profit: ${avgProfit.toFixed(2)} | ${reason}`);

    // Log parameter changes
    if (changes.length > 0) {
      const diffs = this.diffParams(oldParams, this.state.params);
      for (const diff of diffs) {
        logger.info(`[Evolver]   ${diff}`);
      }
    }

    return {
      evolved: changes.length > 0,
      params: { ...this.state.params },
      reason,
      winRate,
      avgProfit,
      generation: this.state.generation,
      changes,
    };
  }

  /**
   * Nudge a parameter by delta, clamping within bounds.
   */
  private nudge(param: keyof EvolutionParams, delta: number): void {
    const [min, max] = PARAM_BOUNDS[param];
    const current = this.state.params[param];
    this.state.params[param] = Math.max(min, Math.min(max, current + delta));
  }

  /**
   * Blend current params toward best known params.
   */
  private blendWithBest(factor: number): void {
    const keys = Object.keys(DEFAULT_PARAMS) as (keyof EvolutionParams)[];
    for (const key of keys) {
      const current = this.state.params[key];
      const best = this.state.bestParams[key];
      this.state.params[key] = current + factor * (best - current);
      // Clamp
      const [min, max] = PARAM_BOUNDS[key];
      this.state.params[key] = Math.max(min, Math.min(max, this.state.params[key]));
    }
  }

  /**
   * Show readable diffs between two param sets.
   */
  private diffParams(oldP: EvolutionParams, newP: EvolutionParams): string[] {
    const diffs: string[] = [];
    const keys = Object.keys(oldP) as (keyof EvolutionParams)[];
    for (const key of keys) {
      if (oldP[key] !== newP[key]) {
        const arrow = newP[key] > oldP[key] ? "↑" : "↓";
        if (key === "simulations") {
          diffs.push(`${key}: ${oldP[key]} → ${newP[key]} ${arrow}`);
        } else {
          diffs.push(`${key}: ${(oldP[key] as number).toFixed(3)} → ${(newP[key] as number).toFixed(3)} ${arrow}`);
        }
      }
    }
    return diffs;
  }

  /**
   * Get a human-readable status report.
   */
  getStatusReport(): string {
    const p = this.state.params;
    const recentN = Math.min(this.state.matchHistory.length, this.evolveEveryN);
    const recent = this.state.matchHistory.slice(-recentN);
    const wins = recent.filter(r => r.won).length;
    const winRate = recentN > 0 ? ((wins / recentN) * 100).toFixed(1) : "N/A";

    return [
      `=== Strategy Evolver Status ===`,
      `Generation: ${this.state.generation} (${this.state.totalEvolutions} total evolutions)`,
      `Recent Win Rate: ${winRate}% (last ${recentN} games)`,
      `Best Win Rate: ${(this.state.bestWinRate * 100).toFixed(1)}%`,
      ``,
      `Current Parameters:`,
      `  MC Simulations:    ${p.simulations}`,
      `  Bluff Multiplier:  ${p.bluffMultiplier.toFixed(2)}x`,
      `  Value Bet Thresh:  ${(p.valueBetThreshold * 100).toFixed(1)}%`,
      `  Aggression Factor: ${p.aggressionFactor.toFixed(2)}x`,
      `  Kelly Fraction:    ${p.kellyFraction.toFixed(2)}`,
      `  Max Risk/Game:     ${(p.maxRiskPerGame * 100).toFixed(1)}%`,
      `  Preflop Tightness: ${p.preflopTightness.toFixed(2)}x`,
    ].join("\n");
  }

  // ============ Persistence ============

  private loadState(): EvolutionState {
    try {
      if (fs.existsSync(this.stateFilePath)) {
        const data = JSON.parse(fs.readFileSync(this.stateFilePath, "utf-8"));
        return data;
      }
    } catch (err) {
      logger.warn("[Evolver] Failed to load state, using defaults");
    }

    return {
      params: { ...DEFAULT_PARAMS },
      generation: 0,
      matchHistory: [],
      bestWinRate: 0,
      bestParams: { ...DEFAULT_PARAMS },
      totalEvolutions: 0,
    };
  }

  private saveState(): void {
    try {
      const dir = path.dirname(this.stateFilePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.stateFilePath, JSON.stringify(this.state, null, 2));
    } catch (err) {
      logger.warn("[Evolver] Failed to save state");
    }
  }
}

export interface EvolutionResult {
  evolved: boolean;
  params: EvolutionParams;
  reason: string;
  winRate?: number;
  avgProfit?: number;
  generation?: number;
  changes?: string[];
}
