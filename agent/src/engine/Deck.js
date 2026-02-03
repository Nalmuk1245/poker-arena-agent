"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Deck = void 0;
const cards_1 = require("../types/cards");
class Deck {
    cards = [];
    constructor() {
        this.reset();
    }
    reset() {
        this.cards = [];
        const suits = Object.values(cards_1.Suit);
        const ranks = Object.values(cards_1.Rank);
        for (const suit of suits) {
            for (const rank of ranks) {
                this.cards.push({ rank, suit });
            }
        }
        this.shuffle();
    }
    shuffle() {
        // Fisher-Yates shuffle
        for (let i = this.cards.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
        }
    }
    deal(count) {
        if (count > this.cards.length) {
            throw new Error(`Cannot deal ${count} cards, only ${this.cards.length} remaining`);
        }
        return this.cards.splice(0, count);
    }
    dealOne() {
        return this.deal(1)[0];
    }
    remove(cardsToRemove) {
        this.cards = this.cards.filter((c) => !cardsToRemove.some((r) => r.rank === c.rank && r.suit === c.suit));
    }
    remaining() {
        return this.cards.length;
    }
    clone() {
        const d = new Deck();
        d.cards = [...this.cards.map((c) => ({ ...c }))];
        return d;
    }
    static fullDeckExcluding(exclude) {
        const suits = Object.values(cards_1.Suit);
        const ranks = Object.values(cards_1.Rank);
        const all = [];
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
exports.Deck = Deck;
