"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HandCategory = exports.RANK_VALUES = exports.Rank = exports.Suit = void 0;
exports.cardToString = cardToString;
exports.stringToCard = stringToCard;
var Suit;
(function (Suit) {
    Suit["HEARTS"] = "h";
    Suit["DIAMONDS"] = "d";
    Suit["CLUBS"] = "c";
    Suit["SPADES"] = "s";
})(Suit || (exports.Suit = Suit = {}));
var Rank;
(function (Rank) {
    Rank["TWO"] = "2";
    Rank["THREE"] = "3";
    Rank["FOUR"] = "4";
    Rank["FIVE"] = "5";
    Rank["SIX"] = "6";
    Rank["SEVEN"] = "7";
    Rank["EIGHT"] = "8";
    Rank["NINE"] = "9";
    Rank["TEN"] = "T";
    Rank["JACK"] = "J";
    Rank["QUEEN"] = "Q";
    Rank["KING"] = "K";
    Rank["ACE"] = "A";
})(Rank || (exports.Rank = Rank = {}));
exports.RANK_VALUES = {
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
var HandCategory;
(function (HandCategory) {
    HandCategory[HandCategory["HIGH_CARD"] = 1] = "HIGH_CARD";
    HandCategory[HandCategory["PAIR"] = 2] = "PAIR";
    HandCategory[HandCategory["TWO_PAIR"] = 3] = "TWO_PAIR";
    HandCategory[HandCategory["THREE_OF_A_KIND"] = 4] = "THREE_OF_A_KIND";
    HandCategory[HandCategory["STRAIGHT"] = 5] = "STRAIGHT";
    HandCategory[HandCategory["FLUSH"] = 6] = "FLUSH";
    HandCategory[HandCategory["FULL_HOUSE"] = 7] = "FULL_HOUSE";
    HandCategory[HandCategory["FOUR_OF_A_KIND"] = 8] = "FOUR_OF_A_KIND";
    HandCategory[HandCategory["STRAIGHT_FLUSH"] = 9] = "STRAIGHT_FLUSH";
    HandCategory[HandCategory["ROYAL_FLUSH"] = 10] = "ROYAL_FLUSH";
})(HandCategory || (exports.HandCategory = HandCategory = {}));
function cardToString(card) {
    return `${card.rank}${card.suit}`;
}
function stringToCard(s) {
    return {
        rank: s[0],
        suit: s[1],
    };
}
