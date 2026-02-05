import { ethers } from "ethers";
import { MultiActionRecord } from "../arena/types/ArenaTypes";

/**
 * In-memory store for off-chain action logs.
 * Used to compute Merkle roots for on-chain settlement verification.
 */
export class ActionLogStore {
  private logs: Map<string, MultiActionRecord[][]> = new Map(); // roomId → hand[] → actions[]

  store(roomId: string, handNumber: number, actions: MultiActionRecord[]): void {
    if (!this.logs.has(roomId)) {
      this.logs.set(roomId, []);
    }
    const roomLogs = this.logs.get(roomId)!;
    roomLogs[handNumber] = actions;
  }

  getForRoom(roomId: string): MultiActionRecord[][] {
    return this.logs.get(roomId) ?? [];
  }

  /**
   * Compute keccak256 hash of a single hand's action log.
   */
  hashActionLog(actions: MultiActionRecord[]): string {
    if (actions.length === 0) {
      return ethers.ZeroHash;
    }
    const encoded = actions.map(a =>
      `${a.playerId}:${a.action}:${a.amount}:${a.phase}:${a.timestamp}`
    ).join("|");
    return ethers.keccak256(ethers.toUtf8Bytes(encoded));
  }

  /**
   * Compute Merkle root from all action log hashes for a room.
   * Uses a simple binary Merkle tree.
   */
  computeMerkleRoot(roomId: string): string {
    const roomLogs = this.logs.get(roomId) ?? [];
    const leafHashes = roomLogs
      .filter(actions => actions && actions.length > 0)
      .map(actions => this.hashActionLog(actions));

    if (leafHashes.length === 0) {
      return ethers.ZeroHash;
    }

    return this.buildMerkleRoot(leafHashes);
  }

  private buildMerkleRoot(leaves: string[]): string {
    if (leaves.length === 1) return leaves[0];

    const nextLevel: string[] = [];
    for (let i = 0; i < leaves.length; i += 2) {
      if (i + 1 < leaves.length) {
        // Sort pair to ensure deterministic ordering
        const [a, b] = leaves[i] < leaves[i + 1]
          ? [leaves[i], leaves[i + 1]]
          : [leaves[i + 1], leaves[i]];
        nextLevel.push(
          ethers.keccak256(ethers.concat([a, b]))
        );
      } else {
        // Odd leaf: promote to next level
        nextLevel.push(leaves[i]);
      }
    }

    return this.buildMerkleRoot(nextLevel);
  }

  clear(roomId: string): void {
    this.logs.delete(roomId);
  }
}
