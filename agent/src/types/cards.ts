export enum Suit {
  HEARTS = "h",
  DIAMONDS = "d",
  CLUBS = "c",
  SPADES = "s",
}

export enum Rank {
  TWO = "2",
  THREE = "3",
  FOUR = "4",
  FIVE = "5",
  SIX = "6",
  SEVEN = "7",
  EIGHT = "8",
  NINE = "9",
  TEN = "T",
  JACK = "J",
  QUEEN = "Q",
  KING = "K",
  ACE = "A",
}

export interface Card {
  rank: Rank;
  suit: Suit;
}

export const RANK_VALUES: Record<Rank, number> = {
  [Rank.TWO]: 2,
  [Rank.THREE]: 3,
  [Rank.FOUR]: 4,
  [Rank.FIVE]: 5,
  [Rank.SIX]: 6,
  [Rank.SEVEN]: 7,
  [Rank.EIGHT]: 8,
  [Rank.NINE]: 9,
  [Rank.TEN]: 10,
  [Rank.JACK]: 11,
  [Rank.QUEEN]: 12,
  [Rank.KING]: 13,
  [Rank.ACE]: 14,
};

export enum HandCategory {
  HIGH_CARD = 1,
  PAIR = 2,
  TWO_PAIR = 3,
  THREE_OF_A_KIND = 4,
  STRAIGHT = 5,
  FLUSH = 6,
  FULL_HOUSE = 7,
  FOUR_OF_A_KIND = 8,
  STRAIGHT_FLUSH = 9,
  ROYAL_FLUSH = 10,
}

export function cardToString(card: Card): string {
  return `${card.rank}${card.suit}`;
}

const SUIT_SYMBOLS: Record<Suit, string> = {
  [Suit.SPADES]: "\u2660",
  [Suit.HEARTS]: "\u2665",
  [Suit.DIAMONDS]: "\u2666",
  [Suit.CLUBS]: "\u2663",
};

const RANK_DISPLAY: Record<Rank, string> = {
  [Rank.TWO]: "2",
  [Rank.THREE]: "3",
  [Rank.FOUR]: "4",
  [Rank.FIVE]: "5",
  [Rank.SIX]: "6",
  [Rank.SEVEN]: "7",
  [Rank.EIGHT]: "8",
  [Rank.NINE]: "9",
  [Rank.TEN]: "10",
  [Rank.JACK]: "J",
  [Rank.QUEEN]: "Q",
  [Rank.KING]: "K",
  [Rank.ACE]: "A",
};

/**
 * Pretty card display with suit symbols.
 * e.g. "A\u2660" "K\u2665" "Q\u2666" "J\u2663"
 */
export function cardToFancy(card: Card): string {
  return `${RANK_DISPLAY[card.rank]}${SUIT_SYMBOLS[card.suit]}`;
}

/**
 * Format a hand of cards into a visually appealing bracketed display.
 * e.g. "[A\u2660 K\u2665]"
 */
export function handToFancy(cards: Card[]): string {
  return `[${cards.map(cardToFancy).join(" ")}]`;
}

export function stringToCard(s: string): Card {
  return {
    rank: s[0] as Rank,
    suit: s[1] as Suit,
  };
}
