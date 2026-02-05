import { Card, cardToString } from "../../types/cards";
import {
  Seat,
  SeatStatus,
  SidePot,
  HandResult,
  PotDistribution,
  ShowdownPlayerInfo,
} from "../types/ArenaTypes";

const PokerSolver = require("pokersolver");
const Hand = PokerSolver.Hand;

/**
 * Handles multiway showdown: evaluates hands per pot, distributes winnings.
 */
export class Showdown {
  /**
   * Evaluate showdown and distribute pots.
   *
   * @param seats - All table seats
   * @param communityCards - 5 community cards
   * @param pots - Side pots to distribute
   * @param handNumber - Current hand number
   * @returns HandResult with all distributions
   */
  evaluate(
    seats: Seat[],
    communityCards: Card[],
    pots: SidePot[],
    handNumber: number
  ): HandResult {
    const showdownPlayers: ShowdownPlayerInfo[] = [];
    const allWinners: Map<string, { amount: number; handDescription: string; holeCards: Card[] }> = new Map();
    const potDistributions: PotDistribution[] = [];

    // Collect showdown-eligible players (not folded, have hole cards)
    const eligibleSeats = seats.filter(
      (s) =>
        s.playerId !== null &&
        s.holeCards.length === 2 &&
        (s.status === SeatStatus.ACTIVE || s.status === SeatStatus.ALL_IN)
    );

    // Evaluate each player's hand
    const playerHands = new Map<string, { solved: any; description: string }>();
    for (const seat of eligibleSeats) {
      const allCards = [...seat.holeCards, ...communityCards];
      const solverCards = allCards.map((c) => `${c.rank}${c.suit}`);
      const solved = Hand.solve(solverCards);
      playerHands.set(seat.playerId!, { solved, description: solved.descr });

      showdownPlayers.push({
        playerId: seat.playerId!,
        holeCards: [...seat.holeCards],
        handDescription: solved.descr,
      });
    }

    // Distribute each pot
    for (let potIdx = 0; potIdx < pots.length; potIdx++) {
      const pot = pots[potIdx];
      const eligibleInPot = pot.eligiblePlayerIds.filter((id) =>
        playerHands.has(id)
      );

      if (eligibleInPot.length === 0) continue;

      if (eligibleInPot.length === 1) {
        // Only one eligible player (others folded)
        const winnerId = eligibleInPot[0];
        const hand = playerHands.get(winnerId)!;
        this.addWinnings(allWinners, winnerId, pot.amount, hand.description, seats);

        potDistributions.push({
          potIndex: potIdx,
          potAmount: pot.amount,
          winnerIds: [winnerId],
          amountPerWinner: pot.amount,
        });
        continue;
      }

      // Multiple eligible players → compare hands
      const solvedHands = eligibleInPot.map((id) => playerHands.get(id)!.solved);
      const winners = Hand.winners(solvedHands);

      const winnerIds = eligibleInPot.filter((id) =>
        winners.includes(playerHands.get(id)!.solved)
      );

      // Split pot among winners (remainder goes to first winner clockwise from dealer)
      const amountPerWinner = Math.floor(pot.amount / winnerIds.length);
      const remainder = pot.amount - amountPerWinner * winnerIds.length;

      for (let i = 0; i < winnerIds.length; i++) {
        const winnerId = winnerIds[i];
        const hand = playerHands.get(winnerId)!;
        const amount = amountPerWinner + (i === 0 ? remainder : 0);
        this.addWinnings(allWinners, winnerId, amount, hand.description, seats);
      }

      potDistributions.push({
        potIndex: potIdx,
        potAmount: pot.amount,
        winnerIds,
        amountPerWinner,
      });
    }

    // Build final winners array
    const winnersArray = Array.from(allWinners.entries()).map(([playerId, info]) => ({
      playerId,
      amount: info.amount,
      handDescription: info.handDescription,
      holeCards: info.holeCards,
    }));

    return {
      handNumber,
      winners: winnersArray,
      potDistributions,
      boardCards: [...communityCards],
      showdownPlayers,
    };
  }

  /**
   * Handle the case where all but one player folded.
   * The remaining player wins all pots without showing cards.
   */
  evaluateFoldWin(
    seats: Seat[],
    pots: SidePot[],
    handNumber: number,
    communityCards: Card[]
  ): HandResult {
    const remainingSeats = seats.filter(
      (s) =>
        s.playerId !== null &&
        s.status !== SeatStatus.FOLDED &&
        s.status !== SeatStatus.EMPTY &&
        s.status !== SeatStatus.SITTING_OUT
    );

    if (remainingSeats.length !== 1) {
      throw new Error(`Expected exactly 1 remaining player, got ${remainingSeats.length}`);
    }

    const winner = remainingSeats[0];
    const totalAmount = pots.reduce((sum, p) => sum + p.amount, 0);

    return {
      handNumber,
      winners: [
        {
          playerId: winner.playerId!,
          amount: totalAmount,
          handDescription: "Opponents folded",
          holeCards: [...winner.holeCards],
        },
      ],
      potDistributions: pots.map((pot, idx) => ({
        potIndex: idx,
        potAmount: pot.amount,
        winnerIds: [winner.playerId!],
        amountPerWinner: pot.amount,
      })),
      boardCards: [...communityCards],
      showdownPlayers: [],
    };
  }

  private addWinnings(
    allWinners: Map<string, { amount: number; handDescription: string; holeCards: Card[] }>,
    playerId: string,
    amount: number,
    handDescription: string,
    seats: Seat[]
  ): void {
    const existing = allWinners.get(playerId);
    if (existing) {
      existing.amount += amount;
    } else {
      const seat = seats.find((s) => s.playerId === playerId);
      allWinners.set(playerId, {
        amount,
        handDescription,
        holeCards: seat ? [...seat.holeCards] : [],
      });
    }
  }
}
