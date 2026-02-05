import { Card } from "../types/cards";
import { EquityResult } from "../types/strategy";
import { Deck } from "../engine/Deck";
import { HandEvaluator } from "../engine/HandEvaluator";

/**
 * Monte Carlo equity calculator for multiway pots.
 * Extends the concept of the existing OddsCalculator to N opponents.
 */
export class MultiOddsCalculator {
  private evaluator: HandEvaluator;

  constructor() {
    this.evaluator = new HandEvaluator();
  }

  /**
   * Calculate equity against multiple opponents via Monte Carlo simulation.
   *
   * In multiway pots, you must beat ALL opponents to win.
   * Equity is significantly lower than heads-up.
   *
   * @param holeCards - Our 2 hole cards
   * @param communityCards - Known community cards (0-5)
   * @param numOpponents - Number of opponents (1-5)
   * @param simulations - Number of Monte Carlo iterations (default 3000)
   */
  calculateEquityMultiway(
    holeCards: Card[],
    communityCards: Card[],
    numOpponents: number,
    simulations: number = 3000
  ): EquityResult {
    if (numOpponents < 1) numOpponents = 1;
    if (numOpponents > 5) numOpponents = 5;

    const knownCards = [...holeCards, ...communityCards];
    const remainingCommunity = 5 - communityCards.length;
    let wins = 0;
    let ties = 0;
    let losses = 0;

    for (let i = 0; i < simulations; i++) {
      const available = Deck.fullDeckExcluding(knownCards);
      this.shuffleArray(available);

      let cardIdx = 0;

      // Deal remaining community cards
      const simCommunity = [...communityCards];
      for (let c = 0; c < remainingCommunity; c++) {
        simCommunity.push(available[cardIdx++]);
      }

      // Evaluate our hand
      const myHand = [...holeCards, ...simCommunity];
      const myCards = myHand.map((c) => `${c.rank}${c.suit}`);

      // Evaluate each opponent's hand
      let beatAll = true;
      let tiedAny = false;

      for (let opp = 0; opp < numOpponents; opp++) {
        const oppHole = [available[cardIdx++], available[cardIdx++]];
        const oppHand = [...oppHole, ...simCommunity];

        const result = this.evaluator.compare(myHand, oppHand);

        if (result < 0) {
          beatAll = false;
          break;
        } else if (result === 0) {
          tiedAny = true;
        }
      }

      if (beatAll && !tiedAny) {
        wins++;
      } else if (beatAll && tiedAny) {
        ties++;
      } else {
        losses++;
      }
    }

    return {
      equity: (wins + ties * 0.5) / simulations,
      wins,
      ties,
      losses,
      simulations,
    };
  }

  /**
   * Calculate pot odds for multiway pots.
   */
  calculatePotOdds(callAmount: number, potSize: number): number {
    if (callAmount <= 0) return Infinity;
    return potSize / callAmount;
  }

  /**
   * Check if calling is profitable based on equity vs pot odds.
   */
  isProfitableCall(equity: number, callAmount: number, potSize: number): boolean {
    const potOdds = callAmount / (potSize + callAmount);
    return equity > potOdds;
  }

  private shuffleArray<T>(arr: T[]): void {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }
}
