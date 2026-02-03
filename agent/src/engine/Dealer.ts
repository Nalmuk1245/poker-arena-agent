import { Card } from "../types/cards";
import { Deck } from "./Deck";
import { ethers } from "ethers";

/**
 * Dealer manages shared card dealing for a poker game between two agents.
 * Ensures both players and the community cards come from the same shuffled deck.
 *
 * Uses a combined-seed approach for fairness:
 * 1. Each player generates a random seed and commits its hash on-chain
 * 2. After both commit, each reveals their seed (verified against hash)
 * 3. Combined seed = keccak256(seed1 + seed2) determines the deck shuffle
 * Neither player can manipulate the outcome alone.
 */
export interface DealtGame {
  player1Cards: Card[];
  player2Cards: Card[];
  flop: Card[];
  turn: Card;
  river: Card;
  deckSeed: string;
}

export interface SeedCommitment {
  seed: string;       // raw seed (bytes32 hex)
  seedHash: string;   // keccak256(seed) — committed on-chain
}

export class Dealer {
  /**
   * Generate a random seed and its commitment hash.
   * The hash is committed on-chain first, then the seed is revealed after
   * the opponent also commits.
   */
  static generateSeedCommitment(): SeedCommitment {
    const seed = ethers.hexlify(ethers.randomBytes(32));
    const seedHash = ethers.keccak256(ethers.solidityPacked(["bytes32"], [seed]));
    return { seed, seedHash };
  }

  /**
   * Combine two seeds into the final deck seed.
   * This matches the on-chain computation:
   *   combinedSeed = keccak256(abi.encodePacked(seed1, seed2))
   */
  static combineSeed(seed1: string, seed2: string): string {
    return ethers.keccak256(
      ethers.solidityPacked(["bytes32", "bytes32"], [seed1, seed2])
    );
  }

  /**
   * Deal a complete game using a combined seed from both players.
   * Both agents independently compute the same deal from the combined seed.
   */
  static dealGame(seed?: string): DealtGame {
    const deckSeed = seed || ethers.hexlify(ethers.randomBytes(32));
    const deck = Dealer.seededDeck(deckSeed);

    const player1Cards = deck.deal(2);
    const player2Cards = deck.deal(2);
    deck.dealOne(); // burn card
    const flop = deck.deal(3);
    deck.dealOne(); // burn card
    const turn = deck.dealOne();
    deck.dealOne(); // burn card
    const river = deck.dealOne();

    return {
      player1Cards,
      player2Cards,
      flop,
      turn,
      river,
      deckSeed,
    };
  }

  /**
   * Deal a game using two player seeds (combined automatically).
   * This is the primary method for on-chain integrated games.
   */
  static dealGameFromSeeds(seed1: string, seed2: string): DealtGame {
    const combinedSeed = Dealer.combineSeed(seed1, seed2);
    return Dealer.dealGame(combinedSeed);
  }

  /**
   * Create a deterministically shuffled deck from a seed.
   * Uses a seeded PRNG so both sides get the same shuffle.
   */
  private static seededDeck(seed: string): Deck {
    const deck = new Deck();
    deck.reset();
    Dealer.seededShuffle(deck, seed);
    return deck;
  }

  /**
   * Fisher-Yates shuffle with a seeded PRNG derived from the seed hash.
   */
  private static seededShuffle(deck: Deck, seed: string): void {
    const tempDeck = new Deck();
    tempDeck.reset();

    const allCards: Card[] = [];
    while (tempDeck.remaining() > 0) {
      allCards.push(tempDeck.dealOne());
    }

    // Seeded PRNG using hash chain
    let hashState = ethers.keccak256(ethers.toUtf8Bytes(seed));

    for (let i = allCards.length - 1; i > 0; i--) {
      hashState = ethers.keccak256(hashState);
      const rand = parseInt(hashState.slice(2, 10), 16);
      const j = rand % (i + 1);
      [allCards[i], allCards[j]] = [allCards[j], allCards[i]];
    }

    (deck as any).cards = allCards;
  }
}
