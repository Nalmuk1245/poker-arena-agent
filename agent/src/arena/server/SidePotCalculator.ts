import { Seat, SeatStatus, SidePot } from "../types/ArenaTypes";

/**
 * Calculates side pots when players go all-in with different stack sizes.
 *
 * Algorithm:
 * 1. Collect all distinct all-in amounts (boundaries) sorted ascending.
 * 2. For each boundary interval, calculate each player's contribution.
 * 3. Sum contributions per interval → pot amount.
 * 4. Eligible players = those who contributed to this level AND haven't folded.
 */
export class SidePotCalculator {
  /**
   * Calculate pots from current seat state.
   * Call this after all betting is complete for the hand.
   *
   * @param seats - All seats at the table
   * @returns Array of SidePot in order (main pot first)
   */
  calculate(seats: Seat[]): SidePot[] {
    // Only consider seats that have put money in this hand
    const activeBettors = seats.filter(
      (s) => s.playerId !== null && s.betThisHand > 0
    );

    if (activeBettors.length === 0) return [];

    // Get all distinct bet-this-hand values, sorted ascending
    const allInAmounts = new Set<number>();
    for (const seat of activeBettors) {
      allInAmounts.add(seat.betThisHand);
    }
    const boundaries = Array.from(allInAmounts).sort((a, b) => a - b);

    const pots: SidePot[] = [];
    let previousBoundary = 0;

    for (const boundary of boundaries) {
      const levelContribution = boundary - previousBoundary;
      if (levelContribution <= 0) continue;

      let potAmount = 0;
      const eligiblePlayerIds: string[] = [];

      for (const seat of activeBettors) {
        // Player contributed to this level if their total bet >= boundary
        const contribution = Math.min(seat.betThisHand, boundary) - Math.min(seat.betThisHand, previousBoundary);
        if (contribution > 0) {
          potAmount += contribution;
        }

        // Eligible = contributed to this level AND not folded
        if (
          seat.betThisHand >= boundary &&
          seat.status !== SeatStatus.FOLDED &&
          seat.playerId !== null
        ) {
          eligiblePlayerIds.push(seat.playerId);
        }
      }

      if (potAmount > 0 && eligiblePlayerIds.length > 0) {
        pots.push({ amount: potAmount, eligiblePlayerIds });
      }

      previousBoundary = boundary;
    }

    // Merge pots with identical eligible player sets
    return this.mergePots(pots);
  }

  /**
   * Merge consecutive pots with the same eligible player set.
   */
  private mergePots(pots: SidePot[]): SidePot[] {
    if (pots.length <= 1) return pots;

    const merged: SidePot[] = [pots[0]];
    for (let i = 1; i < pots.length; i++) {
      const prev = merged[merged.length - 1];
      const curr = pots[i];

      if (this.sameEligible(prev.eligiblePlayerIds, curr.eligiblePlayerIds)) {
        prev.amount += curr.amount;
      } else {
        merged.push(curr);
      }
    }
    return merged;
  }

  private sameEligible(a: string[], b: string[]): boolean {
    if (a.length !== b.length) return false;
    const sortedA = [...a].sort();
    const sortedB = [...b].sort();
    return sortedA.every((v, i) => v === sortedB[i]);
  }
}
