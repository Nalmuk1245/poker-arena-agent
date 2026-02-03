import { Card } from "./cards";

export enum GamePhase {
  WAITING = "WAITING",
  PREFLOP = "PREFLOP",
  FLOP = "FLOP",
  TURN = "TURN",
  RIVER = "RIVER",
  SHOWDOWN = "SHOWDOWN",
  COMPLETE = "COMPLETE",
}

export enum PlayerAction {
  FOLD = "FOLD",
  CHECK = "CHECK",
  CALL = "CALL",
  RAISE = "RAISE",
  ALL_IN = "ALL_IN",
}

export interface ActionRecord {
  player: string;
  action: PlayerAction;
  amount: number;
  phase: GamePhase;
  timestamp: number;
}

export interface GameState {
  gameId: number;
  phase: GamePhase;
  myAddress: string;
  opponentAddress: string;
  myHoleCards: Card[];
  communityCards: Card[];
  potSize: number;
  myStack: number;
  opponentStack: number;
  currentBet: number;
  myBetThisRound: number;
  opponentBetThisRound: number;
  isMyTurn: boolean;
  actionHistory: ActionRecord[];
  wagerAmount: number;
}

export interface GameResult {
  gameId: number;
  winner: string;
  payout: number;
  myFinalHand: Card[];
  opponentFinalHand: Card[];
  totalPot: number;
}

export interface Decision {
  action: PlayerAction;
  amount: number;
  reasoning: string;
}
