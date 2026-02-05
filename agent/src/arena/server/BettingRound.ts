import { PlayerAction } from "../../types/game";
import {
  Seat,
  SeatStatus,
  ArenaGamePhase,
  Position,
} from "../types/ArenaTypes";

export interface BettingAction {
  playerId: string;
  action: PlayerAction;
  amount: number;
}

export interface BettingState {
  seats: Seat[];
  currentBet: number;
  minRaise: number;
  activePlayerIndex: number;
  phase: ArenaGamePhase;
  dealerButtonIndex: number;
}

/**
 * Manages a single betting round within a hand.
 * Handles action ordering, validation, and completion detection.
 */
export class BettingRound {
  /**
   * Get the index of the first player to act in a betting round.
   *
   * - Preflop: first active player after BB (UTG position)
   * - Postflop: first active player after dealer button (SB or next)
   * - Heads-up preflop: dealer/SB acts first
   */
  getFirstToAct(seats: Seat[], dealerIndex: number, phase: ArenaGamePhase): number {
    const activePlayers = this.getActivePlayers(seats);
    if (activePlayers.length <= 1) return -1;

    const isHeadsUp = activePlayers.length === 2;

    if (phase === ArenaGamePhase.PREFLOP) {
      if (isHeadsUp) {
        // Heads-up: dealer/SB acts first preflop
        return dealerIndex;
      }
      // Multiway: UTG (first player after BB) acts first preflop
      const bbIndex = this.findBBIndex(seats);
      return this.nextActivePlayer(seats, bbIndex);
    }

    // Postflop: first active player after dealer
    return this.nextActivePlayer(seats, dealerIndex);
  }

  /**
   * Get valid actions for the active player.
   */
  getValidActions(seats: Seat[], activeIndex: number, currentBet: number): PlayerAction[] {
    const seat = seats[activeIndex];
    if (!seat || !seat.playerId || seat.status === SeatStatus.FOLDED || seat.status === SeatStatus.ALL_IN) {
      return [];
    }

    const actions: PlayerAction[] = [PlayerAction.FOLD];
    const toCall = currentBet - seat.betThisRound;

    if (toCall <= 0) {
      // No bet to call: can check or raise
      actions.push(PlayerAction.CHECK);
      if (seat.stack > 0) {
        actions.push(PlayerAction.RAISE);
      }
    } else if (toCall >= seat.stack) {
      // Must go all-in to call
      actions.push(PlayerAction.ALL_IN);
    } else {
      // Can call, raise, or all-in
      actions.push(PlayerAction.CALL);
      if (seat.stack > toCall) {
        actions.push(PlayerAction.RAISE);
      }
      actions.push(PlayerAction.ALL_IN);
    }

    return actions;
  }

  /**
   * Calculate call amount for a player.
   */
  getCallAmount(seat: Seat, currentBet: number): number {
    const toCall = currentBet - seat.betThisRound;
    return Math.min(Math.max(0, toCall), seat.stack);
  }

  /**
   * Process a player action and update seat state.
   * Returns true if the action was valid.
   */
  processAction(
    state: BettingState,
    playerId: string,
    action: PlayerAction,
    amount: number
  ): boolean {
    const seatIndex = state.seats.findIndex((s) => s.playerId === playerId);
    if (seatIndex === -1) return false;

    const seat = state.seats[seatIndex];
    if (seatIndex !== state.activePlayerIndex) return false;

    const validActions = this.getValidActions(state.seats, seatIndex, state.currentBet);
    if (!validActions.includes(action)) return false;

    switch (action) {
      case PlayerAction.FOLD:
        seat.status = SeatStatus.FOLDED;
        seat.hasActed = true;
        break;

      case PlayerAction.CHECK:
        seat.hasActed = true;
        break;

      case PlayerAction.CALL: {
        const callAmt = this.getCallAmount(seat, state.currentBet);
        seat.stack -= callAmt;
        seat.betThisRound += callAmt;
        seat.betThisHand += callAmt;
        seat.hasActed = true;
        if (seat.stack === 0) {
          seat.status = SeatStatus.ALL_IN;
        }
        break;
      }

      case PlayerAction.RAISE: {
        const toCall = state.currentBet - seat.betThisRound;
        const minTotalRaise = state.currentBet + state.minRaise;
        // amount = total raise-to amount (not the increment above current bet)
        let raiseToAmount = Math.max(amount, minTotalRaise);
        // Cap at player's stack + current bet contribution
        const maxRaiseTo = seat.betThisRound + seat.stack;
        raiseToAmount = Math.min(raiseToAmount, maxRaiseTo);

        const totalCost = raiseToAmount - seat.betThisRound;
        seat.stack -= totalCost;
        seat.betThisRound = raiseToAmount;
        seat.betThisHand += totalCost;

        // Update table state
        const raiseIncrement = raiseToAmount - state.currentBet;
        if (raiseIncrement > state.minRaise) {
          state.minRaise = raiseIncrement;
        }
        state.currentBet = raiseToAmount;

        // Reset hasActed for all other active players (they need to act again)
        for (const s of state.seats) {
          if (
            s.playerId !== playerId &&
            s.status === SeatStatus.ACTIVE
          ) {
            s.hasActed = false;
          }
        }
        seat.hasActed = true;

        if (seat.stack === 0) {
          seat.status = SeatStatus.ALL_IN;
        }
        break;
      }

      case PlayerAction.ALL_IN: {
        const allInAmount = seat.stack;
        seat.betThisRound += allInAmount;
        seat.betThisHand += allInAmount;
        seat.stack = 0;
        seat.status = SeatStatus.ALL_IN;
        seat.hasActed = true;

        // If all-in amount raises the current bet, other players must respond
        if (seat.betThisRound > state.currentBet) {
          const raiseIncrement = seat.betThisRound - state.currentBet;
          if (raiseIncrement >= state.minRaise) {
            state.minRaise = raiseIncrement;
          }
          state.currentBet = seat.betThisRound;

          for (const s of state.seats) {
            if (
              s.playerId !== playerId &&
              s.status === SeatStatus.ACTIVE
            ) {
              s.hasActed = false;
            }
          }
        }
        break;
      }
    }

    return true;
  }

  /**
   * Check if the betting round is complete.
   * Complete when all active (non-folded, non-all-in) players have acted
   * and their bets match the current bet.
   */
  isRoundComplete(seats: Seat[], currentBet: number): boolean {
    const activePlayers = seats.filter(
      (s) =>
        s.playerId !== null &&
        s.status === SeatStatus.ACTIVE
    );

    // If no active players (all folded or all-in), round is complete
    if (activePlayers.length === 0) return true;

    // If only one active player and they've acted, round is complete
    if (activePlayers.length === 1 && activePlayers[0].hasActed) {
      // Unless there's a bet they haven't matched
      return activePlayers[0].betThisRound >= currentBet;
    }

    // All active players must have acted and match the current bet
    return activePlayers.every(
      (s) => s.hasActed && s.betThisRound >= currentBet
    );
  }

  /**
   * Check if the hand should end early (all but one folded).
   */
  isHandOver(seats: Seat[]): boolean {
    const remaining = seats.filter(
      (s) =>
        s.playerId !== null &&
        s.status !== SeatStatus.FOLDED &&
        s.status !== SeatStatus.EMPTY &&
        s.status !== SeatStatus.SITTING_OUT
    );
    return remaining.length <= 1;
  }

  /**
   * Check if we should skip to showdown (all remaining players are all-in or only one active).
   */
  shouldSkipToShowdown(seats: Seat[]): boolean {
    const remaining = seats.filter(
      (s) =>
        s.playerId !== null &&
        s.status !== SeatStatus.FOLDED &&
        s.status !== SeatStatus.EMPTY &&
        s.status !== SeatStatus.SITTING_OUT
    );

    if (remaining.length <= 1) return false; // hand over, not showdown

    const activeCount = remaining.filter((s) => s.status === SeatStatus.ACTIVE).length;
    // If at most 1 player can still act, skip to showdown
    return activeCount <= 1;
  }

  /**
   * Get the next active player index (skipping folded, all-in, empty).
   */
  getNextActivePlayer(seats: Seat[], currentIndex: number): number {
    return this.nextActivePlayer(seats, currentIndex);
  }

  /**
   * Reset betting round state for a new street.
   */
  resetForNewStreet(seats: Seat[]): void {
    for (const seat of seats) {
      if (seat.playerId !== null && seat.status === SeatStatus.ACTIVE) {
        seat.betThisRound = 0;
        seat.hasActed = false;
      }
      // Also reset betThisRound for all-in players (they can't bet more)
      if (seat.status === SeatStatus.ALL_IN) {
        seat.betThisRound = 0;
      }
    }
  }

  // ============ Helpers ============

  private getActivePlayers(seats: Seat[]): Seat[] {
    return seats.filter(
      (s) =>
        s.playerId !== null &&
        s.status !== SeatStatus.FOLDED &&
        s.status !== SeatStatus.EMPTY &&
        s.status !== SeatStatus.SITTING_OUT
    );
  }

  private findBBIndex(seats: Seat[]): number {
    return seats.findIndex((s) => s.position === Position.BB);
  }

  private nextActivePlayer(seats: Seat[], fromIndex: number): number {
    const len = seats.length;
    for (let i = 1; i <= len; i++) {
      const idx = (fromIndex + i) % len;
      const seat = seats[idx];
      if (
        seat.playerId !== null &&
        seat.status === SeatStatus.ACTIVE
      ) {
        return idx;
      }
    }
    return -1; // No active players
  }
}
