import { ethers } from "ethers";
import { ContractManager } from "./ContractManager";
import { ActionLogStore } from "./ActionLogStore";
import { HandResult, MultiActionRecord } from "../arena/types/ArenaTypes";
import { DashboardEventEmitter } from "../api/DashboardEventEmitter";
import { DashboardEvents } from "../types/dashboard";
import logger from "../utils/logger";

interface HandSummaryData {
  handNumber: number;
  winners: Array<{ playerId: string; amount: number }>;
  actionLog: MultiActionRecord[];
}

interface SettlementConfig {
  batchSize: number;
  flushIntervalMs: number;
  retryCount: number;
  retryDelayMs: number;
}

/**
 * BatchSettler: accumulates hand results off-chain and batch-settles on-chain.
 * Reduces gas from 10-20 tx/hand to 1 tx per N hands.
 */
export class BatchSettler {
  private contractManager: ContractManager;
  private actionLogStore: ActionLogStore;
  private config: SettlementConfig;
  private pendingHands: Map<string, HandSummaryData[]> = new Map(); // roomId → hands
  private flushTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private playerAddressMap: Map<string, string> = new Map(); // playerId → wallet address
  private dashEmitter: DashboardEventEmitter | null;
  private batchCounter = 0;

  constructor(
    contractManager: ContractManager,
    config: SettlementConfig,
    dashEmitter?: DashboardEventEmitter
  ) {
    this.contractManager = contractManager;
    this.actionLogStore = new ActionLogStore();
    this.config = config;
    this.dashEmitter = dashEmitter ?? null;
  }

  /**
   * Register a mapping from playerId to wallet address.
   * Only players with wallet addresses will be included in on-chain settlement.
   */
  registerPlayerAddress(playerId: string, walletAddress: string): void {
    this.playerAddressMap.set(playerId, walletAddress);
  }

  /**
   * Push a hand result for batch accumulation.
   * Called by ArenaRunner after each hand completes.
   */
  pushHandResult(
    roomId: string,
    result: HandResult,
    actionLog: MultiActionRecord[]
  ): void {
    // Store action log
    this.actionLogStore.store(roomId, result.handNumber, actionLog);

    // Create summary
    const summary: HandSummaryData = {
      handNumber: result.handNumber,
      winners: result.winners.map(w => ({
        playerId: w.playerId,
        amount: w.amount,
      })),
      actionLog,
    };

    if (!this.pendingHands.has(roomId)) {
      this.pendingHands.set(roomId, []);
    }
    this.pendingHands.get(roomId)!.push(summary);

    const pendingCount = this.pendingHands.get(roomId)!.length;
    logger.info(
      `[BatchSettler] Queued hand #${result.handNumber} for room ${roomId} ` +
      `(${pendingCount}/${this.config.batchSize})`
    );

    this.dashEmitter?.emitDashboard(DashboardEvents.SETTLEMENT_PROGRESS, {
      roomId,
      pendingCount,
      batchSize: this.config.batchSize,
      timestamp: Date.now(),
    });

    // Check if batch is full
    if (this.pendingHands.get(roomId)!.length >= this.config.batchSize) {
      this.flush(roomId);
    } else {
      // Reset flush timer
      this.resetFlushTimer(roomId);
    }
  }

  /**
   * Finalize a room: flush any remaining hands.
   */
  async finalizeRoom(roomId: string): Promise<void> {
    this.clearFlushTimer(roomId);
    const pending = this.pendingHands.get(roomId);
    if (pending && pending.length > 0) {
      await this.flush(roomId);
    }
    this.actionLogStore.clear(roomId);
    this.pendingHands.delete(roomId);
  }

  /**
   * Flush pending hands for a room to on-chain settlement.
   */
  private async flush(roomId: string): Promise<void> {
    this.clearFlushTimer(roomId);
    const hands = this.pendingHands.get(roomId);
    if (!hands || hands.length === 0) return;

    // Take the batch and clear pending
    const batch = [...hands];
    this.pendingHands.set(roomId, []);

    logger.info(`[BatchSettler] Flushing ${batch.length} hands for room ${roomId}`);

    // Build settlement data
    const sessionId = ethers.keccak256(
      ethers.toUtf8Bytes(`${roomId}:${Date.now()}`)
    );

    const handNumbers: number[] = [];
    const winnersArrays: string[][] = [];
    const amountsArrays: bigint[][] = [];
    const actionLogHashes: string[] = [];

    for (const hand of batch) {
      handNumbers.push(hand.handNumber);

      // Map player IDs to addresses (use zero address for bots without wallets)
      const winnerAddrs = hand.winners.map(w =>
        this.playerAddressMap.get(w.playerId) || ethers.ZeroAddress
      );
      const winnerAmounts = hand.winners.map(w => BigInt(Math.floor(w.amount)));

      winnersArrays.push(winnerAddrs);
      amountsArrays.push(winnerAmounts);
      actionLogHashes.push(this.actionLogStore.hashActionLog(hand.actionLog));
    }

    // Compute chip deltas across the batch
    const { players, chipDeltas } = this.computeChipDeltas(batch);

    // Compute Merkle root
    const merkleRoot = this.actionLogStore.computeMerkleRoot(roomId);

    // Submit to chain with retry
    for (let attempt = 1; attempt <= this.config.retryCount; attempt++) {
      try {
        const contract = this.contractManager.getPokerSettlement();
        const tx = await contract.settleSession(
          sessionId,
          handNumbers,
          winnersArrays,
          amountsArrays,
          actionLogHashes,
          players,
          chipDeltas,
          merkleRoot
        );
        const receipt = await tx.wait();

        this.batchCounter++;
        logger.info(
          `[BatchSettler] Settled batch: ${batch.length} hands, tx: ${receipt.hash}`
        );

        this.dashEmitter?.emitDashboard(DashboardEvents.SETTLEMENT_COMPLETE, {
          roomId,
          batchNumber: this.batchCounter,
          handsSettled: batch.length,
          txHash: receipt.hash,
          timestamp: Date.now(),
        });
        return;
      } catch (err: any) {
        logger.warn(
          `[BatchSettler] Settlement attempt ${attempt}/${this.config.retryCount} failed: ${err.message}`
        );
        if (attempt < this.config.retryCount) {
          await this.sleep(this.config.retryDelayMs * attempt);
        }
      }
    }

    logger.error(
      `[BatchSettler] Failed to settle batch for room ${roomId} after ${this.config.retryCount} attempts. ` +
      `${batch.length} hands lost.`
    );

    this.dashEmitter?.emitDashboard(DashboardEvents.SETTLEMENT_ERROR, {
      roomId,
      handsLost: batch.length,
      error: `Failed after ${this.config.retryCount} attempts`,
      timestamp: Date.now(),
    });
  }

  /**
   * Compute net chip deltas per player across a batch.
   */
  private computeChipDeltas(batch: HandSummaryData[]): {
    players: string[];
    chipDeltas: bigint[];
  } {
    const deltaMap = new Map<string, number>(); // address → net delta

    for (const hand of batch) {
      for (const winner of hand.winners) {
        const addr = this.playerAddressMap.get(winner.playerId) || ethers.ZeroAddress;
        deltaMap.set(addr, (deltaMap.get(addr) ?? 0) + winner.amount);
      }
    }

    const players: string[] = [];
    const chipDeltas: bigint[] = [];

    for (const [addr, delta] of deltaMap) {
      if (addr === ethers.ZeroAddress) continue; // Skip bots without wallets
      players.push(addr);
      chipDeltas.push(BigInt(Math.floor(delta)));
    }

    return { players, chipDeltas };
  }

  private resetFlushTimer(roomId: string): void {
    this.clearFlushTimer(roomId);
    const timer = setTimeout(() => {
      this.flush(roomId);
    }, this.config.flushIntervalMs);
    this.flushTimers.set(roomId, timer);
  }

  private clearFlushTimer(roomId: string): void {
    const timer = this.flushTimers.get(roomId);
    if (timer) {
      clearTimeout(timer);
      this.flushTimers.delete(roomId);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ============ Stats ============

  getPendingCount(roomId?: string): number {
    if (roomId) {
      return this.pendingHands.get(roomId)?.length ?? 0;
    }
    let total = 0;
    for (const hands of this.pendingHands.values()) {
      total += hands.length;
    }
    return total;
  }
}
