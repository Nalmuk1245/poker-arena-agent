import { BankrollAdvice } from "../types/strategy";

export class BankrollManager {
  private initialBankroll: number;
  private currentBankroll: number;
  private consecutiveLosses: number = 0;
  private kellyFraction: number;
  private maxRiskPerGame: number;
  private minRiskPerGame: number;
  private stopLossThreshold: number;

  constructor(
    initialBankroll: number,
    options?: {
      kellyFraction?: number;
      maxRisk?: number;
      minRisk?: number;
      stopLoss?: number;
    }
  ) {
    this.initialBankroll = initialBankroll;
    this.currentBankroll = initialBankroll;
    this.kellyFraction = options?.kellyFraction ?? 0.5; // Half-Kelly
    this.maxRiskPerGame = options?.maxRisk ?? 0.10;     // Max 10%
    this.minRiskPerGame = options?.minRisk ?? 0.01;     // Min 1%
    this.stopLossThreshold = options?.stopLoss ?? 0.5;  // Stop at 50% loss
  }

  /**
   * Calculate optimal wager using modified Kelly Criterion.
   *
   * @param winProbability - Estimated probability of winning (0-1)
   * @param potOdds - Expected return multiplier (e.g., 2.0 for doubling)
   */
  getOptimalWager(winProbability: number, potOdds: number = 2.0): BankrollAdvice {
    // Kelly formula: f* = (p * b - q) / b
    // p = win probability, q = 1 - p, b = odds
    const q = 1 - winProbability;
    const fullKelly = (winProbability * potOdds - q) / potOdds;
    const fractionalKelly = fullKelly * this.kellyFraction;

    // Risk level assessment
    const bankrollRatio = this.currentBankroll / this.initialBankroll;
    let riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
    if (bankrollRatio > 0.8) riskLevel = "LOW";
    else if (bankrollRatio > 0.6) riskLevel = "MEDIUM";
    else if (bankrollRatio > this.stopLossThreshold) riskLevel = "HIGH";
    else riskLevel = "CRITICAL";

    // Reduce wager during losing streaks
    let riskMultiplier = 1.0;
    if (this.consecutiveLosses >= 3) {
      riskMultiplier = 0.25; // Quarter-Kelly after 3 losses
    } else if (this.consecutiveLosses >= 2) {
      riskMultiplier = 0.5;
    }

    // Additional reduction when bankroll is low
    if (riskLevel === "HIGH") riskMultiplier *= 0.5;

    const minWager = this.currentBankroll * this.minRiskPerGame;
    const maxWager = this.currentBankroll * this.maxRiskPerGame;

    let optimalWager: number;
    if (fractionalKelly <= 0) {
      // Negative edge — use minimum wager
      optimalWager = minWager;
    } else {
      optimalWager = this.currentBankroll * fractionalKelly * riskMultiplier;
      optimalWager = Math.max(optimalWager, minWager);
      optimalWager = Math.min(optimalWager, maxWager);
    }

    const shouldPlay = riskLevel !== "CRITICAL" && this.consecutiveLosses < 5;

    return {
      maxWager,
      optimalWager: Math.floor(optimalWager),
      riskLevel,
      shouldPlay,
    };
  }

  /**
   * Record a game result.
   */
  recordResult(won: boolean, amount: number): void {
    if (won) {
      this.currentBankroll += amount;
      this.consecutiveLosses = 0;
    } else {
      this.currentBankroll -= amount;
      this.consecutiveLosses++;
    }
  }

  getBankroll(): number {
    return this.currentBankroll;
  }

  getConsecutiveLosses(): number {
    return this.consecutiveLosses;
  }

  getRiskLevel(): "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" {
    const ratio = this.currentBankroll / this.initialBankroll;
    if (ratio > 0.8) return "LOW";
    if (ratio > 0.6) return "MEDIUM";
    if (ratio > this.stopLossThreshold) return "HIGH";
    return "CRITICAL";
  }
}
