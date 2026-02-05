import { Card } from "../../types/cards";
import { PlayerAction } from "../../types/game";

// ============ Enums ============

export enum Position {
  BTN = "BTN",
  SB = "SB",
  BB = "BB",
  UTG = "UTG",
  UTG1 = "UTG1",
  CO = "CO",
}

export enum SeatStatus {
  EMPTY = "EMPTY",
  WAITING = "WAITING",
  ACTIVE = "ACTIVE",
  FOLDED = "FOLDED",
  ALL_IN = "ALL_IN",
  SITTING_OUT = "SITTING_OUT",
}

export enum ArenaGamePhase {
  WAITING = "WAITING",
  PREFLOP = "PREFLOP",
  FLOP = "FLOP",
  TURN = "TURN",
  RIVER = "RIVER",
  SHOWDOWN = "SHOWDOWN",
  COMPLETE = "COMPLETE",
}

// ============ Core Interfaces ============

export interface Seat {
  index: number;           // 0-5
  playerId: string | null;
  playerName: string | null;
  stack: number;
  status: SeatStatus;
  position: Position | null;
  holeCards: Card[];
  betThisRound: number;
  betThisHand: number;     // side pot calculation
  hasActed: boolean;
}

export interface SidePot {
  amount: number;
  eligiblePlayerIds: string[];
}

export interface TableConfig {
  tableId: string;
  tableName: string;
  maxPlayers: number;      // 2-6
  smallBlind: number;
  bigBlind: number;
  startingStack: number;
  actionTimeoutMs: number; // default 30000
}

export interface MultiActionRecord {
  playerId: string;
  playerName: string;
  action: PlayerAction;
  amount: number;
  phase: ArenaGamePhase;
  seatIndex: number;
  timestamp: number;
}

export interface PlayerPublicInfo {
  playerId: string;
  playerName: string;
  seatIndex: number;
  position: Position | null;
  stack: number;
  status: SeatStatus;
  betThisRound: number;
  isDealer: boolean;
  holeCards?: Card[];      // only visible at showdown
}

export interface TableState {
  config: TableConfig;
  seats: Seat[];
  dealerButtonIndex: number;
  phase: ArenaGamePhase;
  communityCards: Card[];
  pots: SidePot[];
  currentBet: number;
  minRaise: number;
  activePlayerIndex: number;
  handNumber: number;
  actionHistory: MultiActionRecord[];
}

// ============ Player View (private info hidden) ============

export interface PlayerView {
  tableId: string;
  handNumber: number;
  phase: ArenaGamePhase;
  myPlayerId: string;
  mySeatIndex: number;
  myPosition: Position;
  myHoleCards: Card[];
  myStack: number;
  myBetThisRound: number;
  communityCards: Card[];
  pots: SidePot[];
  totalPot: number;
  currentBet: number;
  minRaise: number;
  players: PlayerPublicInfo[];
  activePlayerId: string | null;
  isMyTurn: boolean;
  validActions: PlayerAction[];
  callAmount: number;
  minRaiseAmount: number;
  maxRaiseAmount: number;
  actionHistory: MultiActionRecord[];
}

// ============ Hand Result ============

export interface PotDistribution {
  potIndex: number;
  potAmount: number;
  winnerIds: string[];
  amountPerWinner: number;
}

export interface ShowdownPlayerInfo {
  playerId: string;
  holeCards: Card[];
  handDescription: string;
}

export interface HandResult {
  handNumber: number;
  winners: Array<{
    playerId: string;
    amount: number;
    handDescription: string;
    holeCards: Card[];
  }>;
  potDistributions: PotDistribution[];
  boardCards: Card[];
  showdownPlayers: ShowdownPlayerInfo[];
}

// ============ Position assignment helpers ============

/**
 * Get position labels for N active players (2-6).
 * Positions are assigned clockwise from the dealer button.
 */
export function getPositionsForPlayerCount(count: number): Position[] {
  switch (count) {
    case 2:
      return [Position.BTN, Position.BB]; // BTN is also SB in heads-up
    case 3:
      return [Position.BTN, Position.SB, Position.BB];
    case 4:
      return [Position.BTN, Position.SB, Position.BB, Position.CO];
    case 5:
      return [Position.BTN, Position.SB, Position.BB, Position.UTG, Position.CO];
    case 6:
      return [Position.BTN, Position.SB, Position.BB, Position.UTG, Position.UTG1, Position.CO];
    default:
      throw new Error(`Invalid player count: ${count}. Must be 2-6.`);
  }
}

/**
 * Convert ArenaGamePhase to a phase number (1-4) for bot compatibility.
 */
export function phaseToNumber(phase: ArenaGamePhase): number {
  switch (phase) {
    case ArenaGamePhase.PREFLOP: return 1;
    case ArenaGamePhase.FLOP: return 2;
    case ArenaGamePhase.TURN: return 3;
    case ArenaGamePhase.RIVER: return 4;
    default: return 0;
  }
}
