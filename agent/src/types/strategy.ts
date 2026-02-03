export enum PlayerArchetype {
  ROCK = "ROCK",               // Tight-Passive
  TAG = "TAG",                 // Tight-Aggressive
  CALLING_STATION = "STATION", // Loose-Passive
  LAG = "LAG",                 // Loose-Aggressive
  UNKNOWN = "UNKNOWN",
}

export interface OpponentProfile {
  address: string;
  handsPlayed: number;
  vpip: number;                // Voluntarily Put $ In Pot %
  pfr: number;                 // Pre-Flop Raise %
  aggression: number;          // (bets + raises) / total actions
  foldToRaise: number;         // Fold to raise %
  foldToCBet: number;          // Fold to continuation bet %
  showdownFreq: number;        // How often they go to showdown
  avgBetSize: number;          // Average bet as fraction of pot
  bluffFrequency: number;      // Estimated bluff rate from showdowns
  archetype: PlayerArchetype;
  // Per-phase stats
  preflopAggression: number;
  postflopAggression: number;
}

export interface BluffDecision {
  shouldBluff: boolean;
  raiseSize: number;
  confidence: number;
  reasoning: string;
}

export interface EquityResult {
  equity: number;           // Win probability 0-1
  wins: number;
  ties: number;
  losses: number;
  simulations: number;
}

export interface EVResult {
  evFold: number;
  evCall: number;
  evRaise: number;
  bestAction: string;
}

export interface BankrollAdvice {
  maxWager: number;
  optimalWager: number;
  riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  shouldPlay: boolean;
}
