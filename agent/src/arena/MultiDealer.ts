import { Card } from "../types/cards";
import { Deck } from "../engine/Deck";

export interface DealResult {
  playerCards: Map<string, Card[]>;
  flop: Card[];
  turn: Card;
  river: Card;
}

/**
 * Deals cards for N-player Texas Hold'em.
 * Uses existing Deck class with proper burn cards.
 */
export class MultiDealer {
  private deck: Deck;

  constructor() {
    this.deck = new Deck();
  }

  /**
   * Deal a full hand for N players.
   * Cards are dealt round-robin style (one card per player, then second card).
   * Burn cards are used before flop, turn, and river.
   *
   * @param playerIds - Ordered list of player IDs at the table
   * @returns DealResult with player cards and community cards
   */
  deal(playerIds: string[]): DealResult {
    if (playerIds.length < 2 || playerIds.length > 6) {
      throw new Error(`Need 2-6 players, got ${playerIds.length}`);
    }

    this.deck.reset();

    const playerCards = new Map<string, Card[]>();
    for (const id of playerIds) {
      playerCards.set(id, []);
    }

    // Round-robin dealing: first card to each player, then second card
    for (let round = 0; round < 2; round++) {
      for (const id of playerIds) {
        const card = this.deck.dealOne();
        playerCards.get(id)!.push(card);
      }
    }

    // Burn and deal flop (3 cards)
    this.deck.dealOne(); // burn
    const flop = this.deck.deal(3);

    // Burn and deal turn
    this.deck.dealOne(); // burn
    const turn = this.deck.dealOne();

    // Burn and deal river
    this.deck.dealOne(); // burn
    const river = this.deck.dealOne();

    return { playerCards, flop, turn, river };
  }

  /**
   * Get the underlying deck for simulation purposes.
   */
  getDeck(): Deck {
    return this.deck;
  }
}
