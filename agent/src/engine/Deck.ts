import { Card, Rank, Suit } from "../types/cards";

export class Deck {
  private cards: Card[] = [];

  constructor() {
    this.reset();
  }

  reset(): void {
    this.cards = [];
    const suits = Object.values(Suit);
    const ranks = Object.values(Rank);
    for (const suit of suits) {
      for (const rank of ranks) {
        this.cards.push({ rank, suit });
      }
    }
    this.shuffle();
  }

  shuffle(): void {
    // Fisher-Yates shuffle
    for (let i = this.cards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
    }
  }

  deal(count: number): Card[] {
    if (count > this.cards.length) {
      throw new Error(`Cannot deal ${count} cards, only ${this.cards.length} remaining`);
    }
    return this.cards.splice(0, count);
  }

  dealOne(): Card {
    return this.deal(1)[0];
  }

  remove(cardsToRemove: Card[]): void {
    this.cards = this.cards.filter(
      (c) => !cardsToRemove.some((r) => r.rank === c.rank && r.suit === c.suit)
    );
  }

  remaining(): number {
    return this.cards.length;
  }

  clone(): Deck {
    const d = new Deck();
    d.cards = [...this.cards.map((c) => ({ ...c }))];
    return d;
  }

  static fullDeckExcluding(exclude: Card[]): Card[] {
    const suits = Object.values(Suit);
    const ranks = Object.values(Rank);
    const all: Card[] = [];
    for (const suit of suits) {
      for (const rank of ranks) {
        if (!exclude.some((e) => e.rank === rank && e.suit === suit)) {
          all.push({ rank, suit });
        }
      }
    }
    return all;
  }
}
