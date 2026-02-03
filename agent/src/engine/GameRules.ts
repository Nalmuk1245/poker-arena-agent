import { GamePhase, GameState, PlayerAction } from "../types/game";

export class GameRules {
  /**
   * Get valid actions for the current game state.
   */
  getValidActions(state: GameState): PlayerAction[] {
    const actions: PlayerAction[] = [PlayerAction.FOLD];

    const toCall = state.currentBet - state.myBetThisRound;

    if (toCall <= 0) {
      // No bet to match - can check
      actions.push(PlayerAction.CHECK);
    } else {
      // Must call, raise, or fold
      if (toCall <= state.myStack) {
        actions.push(PlayerAction.CALL);
      }
    }

    // Can raise if we have enough chips
    const minRaise = Math.max(state.currentBet * 2, state.wagerAmount * 0.02);
    if (state.myStack > toCall + minRaise) {
      actions.push(PlayerAction.RAISE);
    }

    // Can always go all-in if we have chips
    if (state.myStack > 0) {
      actions.push(PlayerAction.ALL_IN);
    }

    return actions;
  }

  /**
   * Calculate the minimum raise amount.
   */
  getMinRaise(state: GameState): number {
    // Min raise = current bet * 2 (standard Texas Hold'em)
    return Math.max(state.currentBet * 2, state.wagerAmount * 0.02);
  }

  /**
   * Calculate amount needed to call.
   */
  getCallAmount(state: GameState): number {
    return Math.max(0, state.currentBet - state.myBetThisRound);
  }

  /**
   * Get the next phase after the current one.
   */
  getNextPhase(current: GamePhase): GamePhase {
    const order: GamePhase[] = [
      GamePhase.WAITING,
      GamePhase.PREFLOP,
      GamePhase.FLOP,
      GamePhase.TURN,
      GamePhase.RIVER,
      GamePhase.SHOWDOWN,
      GamePhase.COMPLETE,
    ];
    const idx = order.indexOf(current);
    if (idx < 0 || idx >= order.length - 1) return GamePhase.COMPLETE;
    return order[idx + 1];
  }

  /**
   * Calculate max bet as fraction of pot (for raise sizing).
   */
  calculateBetSize(
    potSize: number,
    fraction: number,
    myStack: number
  ): number {
    const bet = Math.floor(potSize * fraction);
    return Math.min(bet, myStack);
  }
}
