import { EventEmitter } from "events";
import { Card } from "../../types/cards";
import { PlayerAction } from "../../types/game";
import {
  Seat,
  SeatStatus,
  ArenaGamePhase,
  Position,
  TableConfig,
  TableState,
  SidePot,
  PlayerView,
  PlayerPublicInfo,
  MultiActionRecord,
  HandResult,
  getPositionsForPlayerCount,
} from "../types/ArenaTypes";
import { MultiDealer } from "../MultiDealer";
import { BettingRound, BettingState } from "./BettingRound";
import { SidePotCalculator } from "./SidePotCalculator";
import { Showdown } from "./Showdown";
import { TurnTimer } from "./TurnTimer";

// Table events
export const TableEvents = {
  HAND_START: "hand:start",
  PHASE_CHANGE: "phase:change",
  PLAYER_ACTION: "player:action",
  HAND_COMPLETE: "hand:complete",
  PLAYER_TURN: "player:turn",
  WAITING_FOR_PLAYERS: "waiting",
} as const;

export interface TableEventMap {
  [TableEvents.HAND_START]: { handNumber: number; seats: Seat[] };
  [TableEvents.PHASE_CHANGE]: { phase: ArenaGamePhase; communityCards: Card[] };
  [TableEvents.PLAYER_ACTION]: MultiActionRecord;
  [TableEvents.HAND_COMPLETE]: HandResult;
  [TableEvents.PLAYER_TURN]: { playerId: string; seatIndex: number; validActions: PlayerAction[] };
  [TableEvents.WAITING_FOR_PLAYERS]: { currentCount: number; needed: number };
}

/**
 * Core Table state machine for 2-6 player Texas Hold'em.
 *
 * Game loop:
 *   WAITING → dealNewHand() → PREFLOP → FLOP → TURN → RIVER → SHOWDOWN → COMPLETE → next hand
 */
export class Table extends EventEmitter {
  readonly config: TableConfig;
  private seats: Seat[];
  private dealerButtonIndex: number = 0;
  private phase: ArenaGamePhase = ArenaGamePhase.WAITING;
  private communityCards: Card[] = [];
  private pots: SidePot[] = [];
  private currentBet: number = 0;
  private minRaise: number = 0;
  private activePlayerIndex: number = -1;
  private handNumber: number = 0;
  private actionHistory: MultiActionRecord[] = [];

  // Pre-dealt cards for the current hand
  private dealResult: { playerCards: Map<string, Card[]>; flop: Card[]; turn: Card; river: Card } | null = null;

  // Components
  private dealer: MultiDealer;
  private bettingRound: BettingRound;
  private sidePotCalc: SidePotCalculator;
  private showdown: Showdown;
  private turnTimer: TurnTimer;

  constructor(config: TableConfig) {
    super();
    this.config = config;
    this.setMaxListeners(20);

    // Initialize empty seats
    this.seats = [];
    for (let i = 0; i < config.maxPlayers; i++) {
      this.seats.push(this.createEmptySeat(i));
    }

    this.dealer = new MultiDealer();
    this.bettingRound = new BettingRound();
    this.sidePotCalc = new SidePotCalculator();
    this.showdown = new Showdown();
    this.turnTimer = new TurnTimer(config.actionTimeoutMs);
  }

  // ============ Player Management ============

  /**
   * Seat a player at the table.
   * @returns seat index or -1 if table is full
   */
  seatPlayer(playerId: string, playerName: string, buyIn?: number): number {
    // Check if player is already seated
    const existing = this.seats.find((s) => s.playerId === playerId);
    if (existing) return existing.index;

    // Find first empty seat
    const emptySeat = this.seats.find((s) => s.status === SeatStatus.EMPTY);
    if (!emptySeat) return -1;

    emptySeat.playerId = playerId;
    emptySeat.playerName = playerName;
    emptySeat.stack = buyIn ?? this.config.startingStack;
    emptySeat.status = SeatStatus.WAITING;

    return emptySeat.index;
  }

  /**
   * Remove a player from the table.
   */
  removePlayer(playerId: string): boolean {
    const seat = this.seats.find((s) => s.playerId === playerId);
    if (!seat) return false;

    // If hand is in progress, mark as folded first
    if (this.phase !== ArenaGamePhase.WAITING && this.phase !== ArenaGamePhase.COMPLETE) {
      seat.status = SeatStatus.FOLDED;
    }

    // Clear seat after hand or immediately if waiting
    if (this.phase === ArenaGamePhase.WAITING || this.phase === ArenaGamePhase.COMPLETE) {
      this.resetSeat(seat);
    }

    return true;
  }

  /**
   * Get count of players ready to play.
   */
  getReadyPlayerCount(): number {
    return this.seats.filter(
      (s) => s.playerId !== null && s.stack > 0 &&
        (s.status === SeatStatus.WAITING || s.status === SeatStatus.ACTIVE)
    ).length;
  }

  /**
   * Check if enough players are ready to start a hand.
   */
  canStartHand(): boolean {
    return this.getReadyPlayerCount() >= 2 &&
      (this.phase === ArenaGamePhase.WAITING || this.phase === ArenaGamePhase.COMPLETE);
  }

  // ============ Hand Lifecycle ============

  /**
   * Start a new hand. Deals cards, posts blinds, and begins preflop betting.
   */
  dealNewHand(): boolean {
    if (!this.canStartHand()) return false;

    this.handNumber++;
    this.phase = ArenaGamePhase.PREFLOP;
    this.communityCards = [];
    this.pots = [];
    this.currentBet = 0;
    this.minRaise = this.config.bigBlind;
    this.actionHistory = [];
    this.dealResult = null;

    // Activate eligible players and reset hand state
    const activePlayers: Seat[] = [];
    for (const seat of this.seats) {
      if (seat.playerId !== null && seat.stack > 0 &&
        (seat.status === SeatStatus.WAITING || seat.status === SeatStatus.ACTIVE ||
          seat.status === SeatStatus.FOLDED || seat.status === SeatStatus.ALL_IN)) {
        seat.status = SeatStatus.ACTIVE;
        seat.holeCards = [];
        seat.betThisRound = 0;
        seat.betThisHand = 0;
        seat.hasActed = false;
        seat.position = null;
        activePlayers.push(seat);
      } else if (seat.playerId !== null && seat.stack <= 0) {
        // Player busted out
        seat.status = SeatStatus.SITTING_OUT;
        seat.position = null;
      } else if (seat.playerId !== null) {
        // Not eligible (e.g., SITTING_OUT) — clear stale position
        seat.position = null;
      }
    }

    if (activePlayers.length < 2) {
      this.phase = ArenaGamePhase.WAITING;
      return false;
    }

    // Rotate dealer button
    this.rotateDealerButton(activePlayers);

    // Assign positions
    this.assignPositions(activePlayers);

    // Deal hole cards
    const playerIds = activePlayers.map((s) => s.playerId!);
    this.dealResult = this.dealer.deal(playerIds);
    for (const seat of activePlayers) {
      seat.holeCards = this.dealResult.playerCards.get(seat.playerId!) || [];
    }

    // Post blinds
    this.postBlinds(activePlayers);

    // Set first player to act
    this.activePlayerIndex = this.bettingRound.getFirstToAct(
      this.seats,
      this.dealerButtonIndex,
      ArenaGamePhase.PREFLOP
    );

    this.emit(TableEvents.HAND_START, {
      handNumber: this.handNumber,
      seats: this.seats.map((s) => ({ ...s, holeCards: [...s.holeCards] })),
    });

    this.emit(TableEvents.PHASE_CHANGE, {
      phase: ArenaGamePhase.PREFLOP,
      communityCards: [],
    });

    this.emitPlayerTurn();
    return true;
  }

  /**
   * Process a player's action.
   */
  processAction(playerId: string, action: PlayerAction, amount: number = 0): boolean {
    if (this.phase === ArenaGamePhase.WAITING || this.phase === ArenaGamePhase.COMPLETE || this.phase === ArenaGamePhase.SHOWDOWN) {
      return false;
    }

    const seatIndex = this.seats.findIndex((s) => s.playerId === playerId);
    if (seatIndex === -1 || seatIndex !== this.activePlayerIndex) return false;

    this.turnTimer.cancel();

    const bettingState: BettingState = {
      seats: this.seats,
      currentBet: this.currentBet,
      minRaise: this.minRaise,
      activePlayerIndex: this.activePlayerIndex,
      phase: this.phase,
      dealerButtonIndex: this.dealerButtonIndex,
    };

    const success = this.bettingRound.processAction(bettingState, playerId, action, amount);
    if (!success) return false;

    // Sync state back
    this.currentBet = bettingState.currentBet;
    this.minRaise = bettingState.minRaise;

    // Record action
    const seat = this.seats[seatIndex];
    const record: MultiActionRecord = {
      playerId,
      playerName: seat.playerName || playerId,
      action,
      amount: action === PlayerAction.CALL ? this.bettingRound.getCallAmount(seat, this.currentBet) :
        action === PlayerAction.ALL_IN ? seat.betThisHand :
          amount,
      phase: this.phase,
      seatIndex,
      timestamp: Date.now(),
    };
    this.actionHistory.push(record);
    this.emit(TableEvents.PLAYER_ACTION, record);

    // Check if hand is over (all but one folded)
    if (this.bettingRound.isHandOver(this.seats)) {
      this.resolveHandEarly();
      return true;
    }

    // Check if betting round is complete
    if (this.bettingRound.isRoundComplete(this.seats, this.currentBet)) {
      this.advancePhase();
      return true;
    }

    // Move to next active player
    this.activePlayerIndex = this.bettingRound.getNextActivePlayer(
      this.seats,
      this.activePlayerIndex
    );

    if (this.activePlayerIndex === -1) {
      this.advancePhase();
    } else {
      this.emitPlayerTurn();
    }

    return true;
  }

  // ============ Phase Management ============

  private advancePhase(): void {
    // Calculate side pots at the end of each betting round
    this.pots = this.sidePotCalc.calculate(this.seats);

    // Reset for new street
    this.bettingRound.resetForNewStreet(this.seats);
    this.currentBet = 0;
    this.minRaise = this.config.bigBlind;

    // Check if we should skip to showdown
    if (this.bettingRound.shouldSkipToShowdown(this.seats)) {
      this.runOutBoard();
      this.resolveShowdown();
      return;
    }

    switch (this.phase) {
      case ArenaGamePhase.PREFLOP:
        this.phase = ArenaGamePhase.FLOP;
        this.communityCards = [...this.dealResult!.flop];
        break;

      case ArenaGamePhase.FLOP:
        this.phase = ArenaGamePhase.TURN;
        this.communityCards.push(this.dealResult!.turn);
        break;

      case ArenaGamePhase.TURN:
        this.phase = ArenaGamePhase.RIVER;
        this.communityCards.push(this.dealResult!.river);
        break;

      case ArenaGamePhase.RIVER:
        this.resolveShowdown();
        return;

      default:
        return;
    }

    this.emit(TableEvents.PHASE_CHANGE, {
      phase: this.phase,
      communityCards: [...this.communityCards],
    });

    // Find first to act for new street
    this.activePlayerIndex = this.bettingRound.getFirstToAct(
      this.seats,
      this.dealerButtonIndex,
      this.phase
    );

    if (this.activePlayerIndex === -1) {
      // No one can act, advance again
      this.advancePhase();
    } else {
      this.emitPlayerTurn();
    }
  }

  /**
   * Run out remaining community cards when skipping to showdown.
   */
  private runOutBoard(): void {
    if (!this.dealResult) return;

    if (this.communityCards.length === 0) {
      this.communityCards = [...this.dealResult.flop, this.dealResult.turn, this.dealResult.river];
    } else if (this.communityCards.length === 3) {
      this.communityCards.push(this.dealResult.turn, this.dealResult.river);
    } else if (this.communityCards.length === 4) {
      this.communityCards.push(this.dealResult.river);
    }
  }

  /**
   * Resolve hand when all but one player folds.
   */
  private resolveHandEarly(): void {
    this.turnTimer.cancel();
    this.pots = this.sidePotCalc.calculate(this.seats);

    // If no pots calculated (e.g., everyone folded to blinds), create a simple pot
    if (this.pots.length === 0) {
      const totalBets = this.seats.reduce((sum, s) => sum + s.betThisHand, 0);
      const remaining = this.seats.find(
        (s) => s.playerId !== null && s.status !== SeatStatus.FOLDED && s.status !== SeatStatus.EMPTY
      );
      if (remaining && totalBets > 0) {
        this.pots = [{ amount: totalBets, eligiblePlayerIds: [remaining.playerId!] }];
      }
    }

    const result = this.showdown.evaluateFoldWin(
      this.seats,
      this.pots,
      this.handNumber,
      this.communityCards
    );

    this.distributeWinnings(result);
    this.completeHand(result);
  }

  /**
   * Resolve showdown: evaluate hands and distribute pots.
   */
  private resolveShowdown(): void {
    this.turnTimer.cancel();
    this.phase = ArenaGamePhase.SHOWDOWN;
    this.pots = this.sidePotCalc.calculate(this.seats);

    // If no pots, create from total bets
    if (this.pots.length === 0) {
      const totalBets = this.seats.reduce((sum, s) => sum + s.betThisHand, 0);
      const eligible = this.seats
        .filter((s) => s.playerId !== null && s.status !== SeatStatus.FOLDED && s.status !== SeatStatus.EMPTY)
        .map((s) => s.playerId!);
      if (totalBets > 0 && eligible.length > 0) {
        this.pots = [{ amount: totalBets, eligiblePlayerIds: eligible }];
      }
    }

    const result = this.showdown.evaluate(
      this.seats,
      this.communityCards,
      this.pots,
      this.handNumber
    );

    this.distributeWinnings(result);
    this.completeHand(result);
  }

  private distributeWinnings(result: HandResult): void {
    for (const winner of result.winners) {
      const seat = this.seats.find((s) => s.playerId === winner.playerId);
      if (seat) {
        seat.stack += winner.amount;
      }
    }
  }

  private completeHand(result: HandResult): void {
    this.phase = ArenaGamePhase.COMPLETE;
    this.emit(TableEvents.HAND_COMPLETE, result);

    // Clean up busted players and reset waiting status
    for (const seat of this.seats) {
      if (seat.playerId !== null) {
        if (seat.stack <= 0) {
          seat.status = SeatStatus.SITTING_OUT;
        } else {
          seat.status = SeatStatus.WAITING;
        }
      }
    }
  }

  // ============ Blind & Position Logic ============

  private postBlinds(activePlayers: Seat[]): void {
    const isHeadsUp = activePlayers.length === 2;

    let sbSeat: Seat | undefined;
    let bbSeat: Seat | undefined;

    if (isHeadsUp) {
      // Heads-up: dealer posts SB, other posts BB
      sbSeat = this.seats[this.dealerButtonIndex];
      bbSeat = activePlayers.find((s) => s.index !== this.dealerButtonIndex);
    } else {
      sbSeat = activePlayers.find((s) => s.position === Position.SB);
      bbSeat = activePlayers.find((s) => s.position === Position.BB);
    }

    if (sbSeat) {
      const sbAmount = Math.min(this.config.smallBlind, sbSeat.stack);
      sbSeat.stack -= sbAmount;
      sbSeat.betThisRound = sbAmount;
      sbSeat.betThisHand = sbAmount;
      if (sbSeat.stack === 0) sbSeat.status = SeatStatus.ALL_IN;
    }

    if (bbSeat) {
      const bbAmount = Math.min(this.config.bigBlind, bbSeat.stack);
      bbSeat.stack -= bbAmount;
      bbSeat.betThisRound = bbAmount;
      bbSeat.betThisHand = bbAmount;
      if (bbSeat.stack === 0) bbSeat.status = SeatStatus.ALL_IN;
    }

    this.currentBet = this.config.bigBlind;
  }

  private rotateDealerButton(activePlayers: Seat[]): void {
    if (this.handNumber === 1) {
      // First hand: random dealer
      const randomIdx = Math.floor(Math.random() * activePlayers.length);
      this.dealerButtonIndex = activePlayers[randomIdx].index;
      return;
    }

    // Rotate to next active player
    const len = this.seats.length;
    for (let i = 1; i <= len; i++) {
      const idx = (this.dealerButtonIndex + i) % len;
      const seat = this.seats[idx];
      if (
        seat.playerId !== null &&
        activePlayers.includes(seat)
      ) {
        this.dealerButtonIndex = idx;
        return;
      }
    }
  }

  private assignPositions(activePlayers: Seat[]): void {
    const positions = getPositionsForPlayerCount(activePlayers.length);

    // Sort active players by seat index, starting from dealer button
    const orderedPlayers: Seat[] = [];
    const len = this.seats.length;
    for (let i = 0; i < len; i++) {
      const idx = (this.dealerButtonIndex + i) % len;
      const seat = this.seats[idx];
      if (activePlayers.includes(seat)) {
        orderedPlayers.push(seat);
      }
    }

    // Assign positions in order
    for (let i = 0; i < orderedPlayers.length; i++) {
      orderedPlayers[i].position = positions[i];
    }
  }

  // ============ Player View ============

  /**
   * Get a sanitized view for a specific player (hides opponent hole cards).
   */
  getPlayerView(playerId: string): PlayerView | null {
    const seat = this.seats.find((s) => s.playerId === playerId);
    if (!seat) return null;

    const totalPot = this.pots.reduce((sum, p) => sum + p.amount, 0) +
      this.seats.reduce((sum, s) => sum + s.betThisRound, 0);

    const players: PlayerPublicInfo[] = this.seats
      .filter((s) => s.playerId !== null)
      .map((s) => ({
        playerId: s.playerId!,
        playerName: s.playerName || s.playerId!,
        seatIndex: s.index,
        position: s.position,
        stack: s.stack,
        status: s.status,
        betThisRound: s.betThisRound,
        isDealer: s.index === this.dealerButtonIndex,
      }));

    const validActions = this.activePlayerIndex === seat.index
      ? this.bettingRound.getValidActions(this.seats, seat.index, this.currentBet)
      : [];

    const callAmount = this.bettingRound.getCallAmount(seat, this.currentBet);
    const minRaiseAmount = this.currentBet + this.minRaise;
    const maxRaiseAmount = seat.betThisRound + seat.stack;

    return {
      tableId: this.config.tableId,
      handNumber: this.handNumber,
      phase: this.phase,
      myPlayerId: playerId,
      mySeatIndex: seat.index,
      myPosition: seat.position || Position.BTN,
      myHoleCards: [...seat.holeCards],
      myStack: seat.stack,
      myBetThisRound: seat.betThisRound,
      communityCards: [...this.communityCards],
      pots: this.pots.map((p) => ({ ...p })),
      totalPot,
      currentBet: this.currentBet,
      minRaise: this.minRaise,
      players,
      activePlayerId: this.activePlayerIndex >= 0 ? this.seats[this.activePlayerIndex]?.playerId ?? null : null,
      isMyTurn: this.activePlayerIndex === seat.index,
      validActions,
      callAmount,
      minRaiseAmount,
      maxRaiseAmount,
      actionHistory: [...this.actionHistory],
    };
  }

  /**
   * Get the full table state (for admin/logging).
   */
  getTableState(): TableState {
    return {
      config: { ...this.config },
      seats: this.seats.map((s) => ({ ...s, holeCards: [...s.holeCards] })),
      dealerButtonIndex: this.dealerButtonIndex,
      phase: this.phase,
      communityCards: [...this.communityCards],
      pots: this.pots.map((p) => ({ ...p })),
      currentBet: this.currentBet,
      minRaise: this.minRaise,
      activePlayerIndex: this.activePlayerIndex,
      handNumber: this.handNumber,
      actionHistory: [...this.actionHistory],
    };
  }

  getPhase(): ArenaGamePhase {
    return this.phase;
  }

  getHandNumber(): number {
    return this.handNumber;
  }

  getActivePlayerId(): string | null {
    if (this.activePlayerIndex < 0) return null;
    return this.seats[this.activePlayerIndex]?.playerId ?? null;
  }

  getSeats(): Seat[] {
    return this.seats;
  }

  // ============ Helpers ============

  private emitPlayerTurn(): void {
    if (this.activePlayerIndex < 0) return;
    const seat = this.seats[this.activePlayerIndex];
    if (!seat || !seat.playerId) return;

    const validActions = this.bettingRound.getValidActions(
      this.seats,
      this.activePlayerIndex,
      this.currentBet
    );

    this.emit(TableEvents.PLAYER_TURN, {
      playerId: seat.playerId,
      seatIndex: seat.index,
      validActions,
    });

    // Start turn timer
    const canCheck = validActions.includes(PlayerAction.CHECK);
    this.turnTimer.start(seat.playerId, canCheck, (pid, defaultAction) => {
      this.processAction(pid, defaultAction);
    });
  }

  private createEmptySeat(index: number): Seat {
    return {
      index,
      playerId: null,
      playerName: null,
      stack: 0,
      status: SeatStatus.EMPTY,
      position: null,
      holeCards: [],
      betThisRound: 0,
      betThisHand: 0,
      hasActed: false,
    };
  }

  private resetSeat(seat: Seat): void {
    seat.playerId = null;
    seat.playerName = null;
    seat.stack = 0;
    seat.status = SeatStatus.EMPTY;
    seat.position = null;
    seat.holeCards = [];
    seat.betThisRound = 0;
    seat.betThisHand = 0;
    seat.hasActed = false;
  }

  /**
   * Destroy the table and clean up resources.
   */
  destroy(): void {
    this.turnTimer.destroy();
    this.removeAllListeners();
  }
}
