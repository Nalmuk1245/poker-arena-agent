import { GameState, GamePhase } from "../types/game";
import { BluffDecision, OpponentProfile, PlayerArchetype } from "../types/strategy";
import { Card, Rank, Suit } from "../types/cards";

export class BluffEngine {
  /**
   * Determine whether to bluff based on GTO principles
   * and opponent-specific adjustments.
   */
  shouldBluff(
    gameState: GameState,
    opponentProfile: OpponentProfile,
    equity: number,
    bluffMultiplier: number = 1.0
  ): BluffDecision {
    // Don't bluff preflop (keep it simple)
    if (gameState.phase === GamePhase.PREFLOP) {
      return { shouldBluff: false, raiseSize: 0, confidence: 0, reasoning: "no preflop bluff" };
    }

    const potSize = gameState.potSize;
    const betSize = Math.floor(potSize * 0.66); // 2/3 pot standard

    // GTO bluff frequency: betSize / (betSize + potSize), scaled by evolution multiplier
    let gtoBluffFreq = (betSize / (betSize + potSize)) * bluffMultiplier;

    // Adjust for opponent type
    if (opponentProfile.foldToRaise > 0.5) {
      gtoBluffFreq *= 1.5; // Bluff more vs frequent folders
    } else if (opponentProfile.foldToRaise < 0.25) {
      gtoBluffFreq *= 0.2; // Rarely bluff calling stations
    }

    // Archetype adjustments
    if (opponentProfile.archetype === PlayerArchetype.CALLING_STATION) {
      return { shouldBluff: false, raiseSize: 0, confidence: 0, reasoning: "never bluff calling station" };
    }

    if (opponentProfile.archetype === PlayerArchetype.ROCK && equity < 0.3) {
      gtoBluffFreq *= 1.8; // Rocks fold a lot
    }

    // Check for semi-bluff opportunities (draws)
    const hasDraw = this.detectDraws(
      gameState.myHoleCards,
      gameState.communityCards
    );

    // Only bluff with:
    // 1. Weak hand (equity < 0.3)
    // 2. Preferably with a draw (semi-bluff)
    // 3. At GTO-adjusted frequency
    const randomFactor = Math.random();
    const shouldBluff =
      equity < 0.3 &&
      randomFactor < gtoBluffFreq &&
      (hasDraw || gameState.phase === GamePhase.RIVER); // Pure bluff ok on river

    let raiseSize = betSize;
    if (shouldBluff) {
      if (hasDraw) {
        // Semi-bluff: bet 60-75% pot
        raiseSize = Math.floor(potSize * (0.6 + Math.random() * 0.15));
      } else {
        // Pure bluff: bet 33-50% pot (minimize cost)
        raiseSize = Math.floor(potSize * (0.33 + Math.random() * 0.17));
      }
    }

    // Cap at our stack
    raiseSize = Math.min(raiseSize, gameState.myStack);

    return {
      shouldBluff,
      raiseSize,
      confidence: gtoBluffFreq,
      reasoning: shouldBluff
        ? hasDraw
          ? "semi-bluff with draw"
          : "pure bluff on river"
        : "no bluff opportunity",
    };
  }

  /**
   * Detect if we have drawing hands (flush draw, straight draw).
   */
  private detectDraws(holeCards: Card[], communityCards: Card[]): boolean {
    if (communityCards.length < 3) return false;

    const allCards = [...holeCards, ...communityCards];

    return this.hasFlushDraw(allCards) || this.hasStraightDraw(allCards);
  }

  private hasFlushDraw(cards: Card[]): boolean {
    const suitCounts: Record<string, number> = {};
    for (const card of cards) {
      suitCounts[card.suit] = (suitCounts[card.suit] || 0) + 1;
    }
    // 4 of same suit = flush draw
    return Object.values(suitCounts).some((count) => count === 4);
  }

  private hasStraightDraw(cards: Card[]): boolean {
    const rankValues: Record<string, number> = {
      "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8,
      "9": 9, T: 10, J: 11, Q: 12, K: 13, A: 14,
    };

    const values = [...new Set(cards.map((c) => rankValues[c.rank]))].sort(
      (a, b) => a - b
    );

    // Exclude made straights (5 consecutive values)
    for (let i = 0; i <= values.length - 5; i++) {
      if (values[i + 4] - values[i] === 4) {
        return false;
      }
    }

    // OESD: 4 consecutive values (e.g., 5-6-7-8)
    for (let i = 0; i <= values.length - 4; i++) {
      if (values[i + 3] - values[i] === 3) {
        return true;
      }
    }

    // Gutshot: 4 values within a range of 5 (one gap, e.g., 5-6-_-8-9)
    for (let i = 0; i <= values.length - 4; i++) {
      if (values[i + 3] - values[i] === 4) {
        return true;
      }
    }

    // Ace-low straight draw (A-2-3-4)
    if (values.includes(14) && values.includes(2) && values.includes(3) && values.includes(4)) {
      return true;
    }

    return false;
  }
}
