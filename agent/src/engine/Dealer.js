"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Dealer = void 0;
const Deck_1 = require("./Deck");
const ethers_1 = require("ethers");
class Dealer {
    /**
     * Deal a complete game using a shared seed.
     * Both agents can verify the deal by using the same seed.
     */
    static dealGame(seed) {
        const deckSeed = seed || ethers_1.ethers.hexlify(ethers_1.ethers.randomBytes(32));
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
     * Create a deterministically shuffled deck from a seed.
     * Uses a seeded PRNG so both sides get the same shuffle.
     */
    static seededDeck(seed) {
        const deck = new Deck_1.Deck();
        // Reset to ordered deck, then shuffle with seeded PRNG
        deck.reset();
        Dealer.seededShuffle(deck, seed);
        return deck;
    }
    /**
     * Fisher-Yates shuffle with a seeded PRNG derived from the seed hash.
     */
    static seededShuffle(deck, seed) {
        // Access internal cards via clone trick
        const tempDeck = new Deck_1.Deck();
        tempDeck.reset();
        // We need to access the cards array. Since Deck has private cards,
        // we'll use a workaround: deal all cards, shuffle them, and rebuild.
        const allCards = [];
        while (tempDeck.remaining() > 0) {
            allCards.push(tempDeck.dealOne());
        }
        // Seeded PRNG using hash chain
        let hashState = ethers_1.ethers.keccak256(ethers_1.ethers.toUtf8Bytes(seed));
        for (let i = allCards.length - 1; i > 0; i--) {
            hashState = ethers_1.ethers.keccak256(hashState);
            const rand = parseInt(hashState.slice(2, 10), 16);
            const j = rand % (i + 1);
            [allCards[i], allCards[j]] = [allCards[j], allCards[i]];
        }
        // Rebuild the deck with shuffled cards by removing all and replacing
        deck.remove(allCards); // removes nothing since deck was already emptied
        // We'll just store and retrieve via dealing from a fresh deck
        // Instead, we modify the approach: return cards directly
        deck.cards = allCards;
    }
}
exports.Dealer = Dealer;
