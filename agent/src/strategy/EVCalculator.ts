import { EVResult } from "../types/strategy";

export class EVCalculator {
  /**
   * Calculate Expected Value for each possible action.
   *
   * EV(call) = equity * (pot + callAmount) - (1 - equity) * callAmount
   * EV(raise) = foldEq * pot + (1 - foldEq) * [equity * (pot + raiseAmt + callAmt) - (1 - equity) * raiseAmt]
   */
  calculate(
    equity: number,
    potSize: number,
    callAmount: number,
    raiseAmount: number,
    opponentFoldToRaise: number = 0.4
  ): EVResult {
    // EV of folding is always 0 (relative to current decision point)
    const evFold = 0;

    // EV of calling
    const evCall =
      equity * (potSize + callAmount) - (1 - equity) * callAmount;

    // EV of raising
    // Two scenarios: opponent folds (we win pot) or opponent calls (showdown)
    const foldEq = opponentFoldToRaise;
    const evRaiseWhenCalled =
      equity * (potSize + raiseAmount + callAmount) -
      (1 - equity) * raiseAmount;
    const evRaise = foldEq * potSize + (1 - foldEq) * evRaiseWhenCalled;

    // Determine best action
    let bestAction: string;
    if (evRaise >= evCall && evRaise > evFold) {
      bestAction = "RAISE";
    } else if (evCall > evFold) {
      bestAction = "CALL";
    } else {
      bestAction = "FOLD";
    }

    return { evFold, evCall, evRaise, bestAction };
  }

  /**
   * Calculate implied odds for drawing hands.
   * Accounts for future bets we can win if we hit our draw.
   */
  calculateImpliedOdds(
    equity: number,
    potSize: number,
    callAmount: number,
    expectedFutureBets: number
  ): number {
    // Implied pot = current pot + expected future bets
    const impliedPot = potSize + expectedFutureBets;
    return equity * (impliedPot + callAmount) - (1 - equity) * callAmount;
  }
}
