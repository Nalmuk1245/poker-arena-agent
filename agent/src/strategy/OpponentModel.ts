import { PlayerAction, ActionRecord, GamePhase } from "../types/game";
import {
  OpponentProfile,
  PlayerArchetype,
} from "../types/strategy";

const DEFAULT_PROFILE: Omit<OpponentProfile, "address"> = {
  handsPlayed: 0,
  vpip: 0.5,
  pfr: 0.3,
  aggression: 0.5,
  foldToRaise: 0.4,
  foldToCBet: 0.4,
  showdownFreq: 0.5,
  avgBetSize: 0.5,
  bluffFrequency: 0.3,
  archetype: PlayerArchetype.UNKNOWN,
  preflopAggression: 0.5,
  postflopAggression: 0.5,
};

export class OpponentModel {
  private static readonly MAX_PROFILES = 100;
  private profiles: Map<string, OpponentProfile> = new Map();
  // Raw counters for computing stats
  private counters: Map<
    string,
    {
      totalHands: number;
      vpipHands: number;
      pfrHands: number;
      totalActions: number;
      aggressiveActions: number;
      foldToRaiseOpp: number;
      foldToRaiseCount: number;
      showdowns: number;
      showdownsReached: number;
      totalBetSize: number;
      betCount: number;
      preflopActions: number;
      preflopAggressive: number;
      postflopActions: number;
      postflopAggressive: number;
      bluffsDetected: number;
      showdownsWithData: number;
    }
  > = new Map();

  getProfile(address: string): OpponentProfile {
    if (!this.profiles.has(address)) {
      // Evict least-played profile if at capacity
      if (this.profiles.size >= OpponentModel.MAX_PROFILES) {
        let minAddr = "";
        let minHands = Infinity;
        for (const [addr, profile] of this.profiles) {
          if (profile.handsPlayed < minHands) {
            minHands = profile.handsPlayed;
            minAddr = addr;
          }
        }
        if (minAddr) {
          this.profiles.delete(minAddr);
          this.counters.delete(minAddr);
        }
      }

      this.profiles.set(address, {
        ...DEFAULT_PROFILE,
        address,
      });
      this.counters.set(address, {
        totalHands: 0,
        vpipHands: 0,
        pfrHands: 0,
        totalActions: 0,
        aggressiveActions: 0,
        foldToRaiseOpp: 0,
        foldToRaiseCount: 0,
        showdowns: 0,
        showdownsReached: 0,
        totalBetSize: 0,
        betCount: 0,
        preflopActions: 0,
        preflopAggressive: 0,
        postflopActions: 0,
        postflopAggressive: 0,
        bluffsDetected: 0,
        showdownsWithData: 0,
      });
    }
    return this.profiles.get(address)!;
  }

  /**
   * Record an action observed from the opponent.
   */
  recordAction(
    address: string,
    action: PlayerAction,
    phase: GamePhase,
    betAmount: number,
    potSize: number,
    facingRaise: boolean
  ): void {
    const profile = this.getProfile(address);
    const c = this.counters.get(address)!;
    const alpha = this.getAlpha(c.totalActions);

    c.totalActions++;

    // VPIP: did they voluntarily put money in?
    if (
      action === PlayerAction.CALL ||
      action === PlayerAction.RAISE ||
      action === PlayerAction.ALL_IN
    ) {
      c.vpipHands++;
    }

    // PFR
    if (
      phase === GamePhase.PREFLOP &&
      (action === PlayerAction.RAISE || action === PlayerAction.ALL_IN)
    ) {
      c.pfrHands++;
    }

    // Aggression
    if (
      action === PlayerAction.RAISE ||
      action === PlayerAction.ALL_IN
    ) {
      c.aggressiveActions++;
    }

    // Fold to raise
    if (facingRaise) {
      c.foldToRaiseOpp++;
      if (action === PlayerAction.FOLD) {
        c.foldToRaiseCount++;
      }
    }

    // Bet sizing
    if (betAmount > 0 && potSize > 0) {
      c.totalBetSize += betAmount / potSize;
      c.betCount++;
    }

    // Phase-specific aggression
    if (phase === GamePhase.PREFLOP) {
      c.preflopActions++;
      if (action === PlayerAction.RAISE || action === PlayerAction.ALL_IN) {
        c.preflopAggressive++;
      }
    } else {
      c.postflopActions++;
      if (action === PlayerAction.RAISE || action === PlayerAction.ALL_IN) {
        c.postflopAggressive++;
      }
    }

    // Update profile with exponential moving average
    this.updateProfile(address, alpha);
  }

  /**
   * Record a showdown result to track bluff frequency.
   */
  recordShowdown(
    address: string,
    wasBluff: boolean
  ): void {
    const c = this.counters.get(address)!;
    c.showdownsWithData++;
    if (wasBluff) c.bluffsDetected++;
    c.showdownsReached++;

    this.updateProfile(address, this.getAlpha(c.totalActions));
  }

  recordHandComplete(address: string): void {
    const c = this.counters.get(address);
    if (c) {
      c.totalHands++;
    }
  }

  /**
   * Classify opponent into an archetype.
   */
  classifyArchetype(profile: OpponentProfile): PlayerArchetype {
    if (profile.handsPlayed < 5) return PlayerArchetype.UNKNOWN;

    const isLoose = profile.vpip > 0.4;
    const isAggressive = profile.aggression > 0.45;

    if (!isLoose && !isAggressive) return PlayerArchetype.ROCK;
    if (!isLoose && isAggressive) return PlayerArchetype.TAG;
    if (isLoose && !isAggressive) return PlayerArchetype.CALLING_STATION;
    return PlayerArchetype.LAG;
  }

  /**
   * Get strategy adjustments based on opponent archetype.
   */
  getAdjustments(profile: OpponentProfile): {
    equityAdjust: number;
    bluffMore: boolean;
    trapMore: boolean;
    valueBetThinner: boolean;
  } {
    switch (profile.archetype) {
      case PlayerArchetype.ROCK:
        return {
          equityAdjust: 0.05,     // Steal more vs tight players
          bluffMore: true,
          trapMore: false,
          valueBetThinner: false,
        };
      case PlayerArchetype.TAG:
        return {
          equityAdjust: 0,
          bluffMore: false,        // Risky to bluff good players
          trapMore: true,          // Trap with strong hands
          valueBetThinner: false,
        };
      case PlayerArchetype.CALLING_STATION:
        return {
          equityAdjust: -0.05,
          bluffMore: false,        // Never bluff calling stations
          trapMore: false,
          valueBetThinner: true,   // Value bet with marginal hands
        };
      case PlayerArchetype.LAG:
        return {
          equityAdjust: 0.03,
          bluffMore: false,
          trapMore: true,          // Let them hang themselves
          valueBetThinner: true,
        };
      default:
        return {
          equityAdjust: 0,
          bluffMore: false,
          trapMore: false,
          valueBetThinner: false,
        };
    }
  }

  /**
   * Serialize all profiles for persistence.
   */
  exportProfiles(): Record<string, OpponentProfile> {
    const result: Record<string, OpponentProfile> = {};
    for (const [addr, profile] of this.profiles) {
      result[addr] = profile;
    }
    return result;
  }

  /**
   * Import previously saved profiles.
   */
  importProfiles(data: Record<string, OpponentProfile>): void {
    for (const [addr, profile] of Object.entries(data)) {
      this.profiles.set(addr, profile);
    }
  }

  // ---- Internal ----

  private getAlpha(totalActions: number): number {
    // Higher alpha = more weight on recent data
    // Start responsive (0.3), settle to stable (0.1)
    return Math.max(0.1, 0.3 - totalActions * 0.005);
  }

  private updateProfile(address: string, alpha: number): void {
    const c = this.counters.get(address)!;
    const p = this.profiles.get(address)!;

    if (c.totalActions > 0) {
      p.vpip = this.ema(p.vpip, c.vpipHands / c.totalActions, alpha);
      p.aggression = this.ema(
        p.aggression,
        c.aggressiveActions / c.totalActions,
        alpha
      );
    }
    if (c.totalHands > 0) {
      p.pfr = this.ema(p.pfr, c.pfrHands / Math.max(c.totalHands, 1), alpha);
    }
    if (c.foldToRaiseOpp > 0) {
      p.foldToRaise = this.ema(
        p.foldToRaise,
        c.foldToRaiseCount / c.foldToRaiseOpp,
        alpha
      );
    }
    if (c.betCount > 0) {
      p.avgBetSize = this.ema(
        p.avgBetSize,
        c.totalBetSize / c.betCount,
        alpha
      );
    }
    if (c.preflopActions > 0) {
      p.preflopAggression = this.ema(
        p.preflopAggression,
        c.preflopAggressive / c.preflopActions,
        alpha
      );
    }
    if (c.postflopActions > 0) {
      p.postflopAggression = this.ema(
        p.postflopAggression,
        c.postflopAggressive / c.postflopActions,
        alpha
      );
    }
    if (c.showdownsWithData > 0) {
      p.bluffFrequency = this.ema(
        p.bluffFrequency,
        c.bluffsDetected / c.showdownsWithData,
        alpha
      );
      p.showdownFreq = this.ema(
        p.showdownFreq,
        c.showdownsReached / Math.max(c.totalHands, 1),
        alpha
      );
    }

    p.handsPlayed = c.totalHands;
    p.archetype = this.classifyArchetype(p);
  }

  private ema(oldVal: number, newVal: number, alpha: number): number {
    return alpha * newVal + (1 - alpha) * oldVal;
  }
}
