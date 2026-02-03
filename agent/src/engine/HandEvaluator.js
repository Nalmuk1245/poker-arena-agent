"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HandEvaluator = void 0;
const cards_1 = require("../types/cards");
// pokersolver provides Hand.solve() for 5-7 card evaluation
const PokerSolver = require("pokersolver");
const Hand = PokerSolver.Hand;
// Map pokersolver rank names to our HandCategory
const CATEGORY_MAP = {
    "Royal Flush": cards_1.HandCategory.ROYAL_FLUSH,
    "Straight Flush": cards_1.HandCategory.STRAIGHT_FLUSH,
    "Four of a Kind": cards_1.HandCategory.FOUR_OF_A_KIND,
    "Full House": cards_1.HandCategory.FULL_HOUSE,
    "Flush": cards_1.HandCategory.FLUSH,
    "Straight": cards_1.HandCategory.STRAIGHT,
    "Three of a Kind": cards_1.HandCategory.THREE_OF_A_KIND,
    "Two Pair": cards_1.HandCategory.TWO_PAIR,
    "Pair": cards_1.HandCategory.PAIR,
    "High Card": cards_1.HandCategory.HIGH_CARD,
};
class HandEvaluator {
    /**
     * Evaluate a poker hand from 5-7 cards.
     * Returns a HandResult with category, rank, and name.
     */
    evaluate(cards) {
        if (cards.length < 5 || cards.length > 7) {
            throw new Error(`Need 5-7 cards to evaluate, got ${cards.length}`);
        }
        // Convert to pokersolver format: "As", "Kh", "Td", etc.
        const solverCards = cards.map((c) => this.toSolverFormat(c));
        const solved = Hand.solve(solverCards);
        const category = CATEGORY_MAP[solved.name] || cards_1.HandCategory.HIGH_CARD;
        return {
            category,
            rank: solved.rank,
            name: solved.descr,
            cards: solved.cardPool.map((c) => c.toString()),
        };
    }
    /**
     * Compare two hands. Returns:
     *  1 if hand1 wins
     * -1 if hand2 wins
     *  0 if tie
     */
    compare(hand1Cards, hand2Cards) {
        const solver1 = Hand.solve(hand1Cards.map((c) => this.toSolverFormat(c)));
        const solver2 = Hand.solve(hand2Cards.map((c) => this.toSolverFormat(c)));
        const winners = Hand.winners([solver1, solver2]);
        if (winners.length === 2)
            return 0; // tie
        if (winners[0] === solver1)
            return 1;
        return -1;
    }
    toSolverFormat(card) {
        // pokersolver expects: rank + suit (e.g., "As" for Ace of spades)
        return `${card.rank}${card.suit}`;
    }
}
exports.HandEvaluator = HandEvaluator;
