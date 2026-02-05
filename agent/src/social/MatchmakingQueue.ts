import logger from "../utils/logger";
import * as fs from "fs";
import * as path from "path";

/**
 * Queue entry representing an agent waiting to play.
 */
export interface QueueEntry {
  agentName: string;
  address: string;
  wagerAmount: number;     // 0 for free play
  isFreePlay: boolean;
  joinedAt: number;        // timestamp
  expiresAt: number;       // auto-remove after this time
  contractAddress: string;
}

/**
 * A matched pair ready to play.
 */
export interface MatchResult {
  player1: QueueEntry;
  player2: QueueEntry;
  matchedAt: number;
}

const QUEUE_FILE = "matchmaking_queue.json";
const DEFAULT_QUEUE_TTL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Off-chain matchmaking queue.
 *
 * Agents register themselves as waiting, and the queue pairs compatible agents.
 * Uses a shared JSON file as the simple persistence layer.
 * For production, this could be replaced with a WebSocket server or Redis-based queue.
 */
export class MatchmakingQueue {
  private dataDir: string;
  private queueFilePath: string;
  private ttlMs: number;

  constructor(ttlMs: number = DEFAULT_QUEUE_TTL_MS) {
    this.dataDir = path.resolve(__dirname, "../../data");
    this.queueFilePath = path.join(this.dataDir, QUEUE_FILE);
    this.ttlMs = ttlMs;
  }

  /**
   * Load the current queue from disk.
   */
  private loadQueue(): QueueEntry[] {
    try {
      if (fs.existsSync(this.queueFilePath)) {
        const data = JSON.parse(fs.readFileSync(this.queueFilePath, "utf-8"));
        if (Array.isArray(data)) {
          // Filter out expired entries
          const now = Date.now();
          return data.filter((entry: QueueEntry) => entry.expiresAt > now);
        }
      }
    } catch (err: any) {
      logger.warn(`Failed to load matchmaking queue: ${err.message}`);
    }
    return [];
  }

  /**
   * Save the queue to disk.
   */
  private saveQueue(queue: QueueEntry[]): void {
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
    fs.writeFileSync(this.queueFilePath, JSON.stringify(queue, null, 2));
  }

  /**
   * Register this agent in the matchmaking queue.
   * Returns a MatchResult if an opponent is immediately available, null otherwise.
   */
  enqueue(entry: Omit<QueueEntry, "joinedAt" | "expiresAt">): MatchResult | null {
    const queue = this.loadQueue();
    const now = Date.now();

    // Check if we're already in the queue
    const existingIdx = queue.findIndex(
      e => e.address.toLowerCase() === entry.address.toLowerCase()
    );
    if (existingIdx >= 0) {
      // Update our entry
      queue[existingIdx] = {
        ...entry,
        joinedAt: queue[existingIdx].joinedAt,
        expiresAt: now + this.ttlMs,
      };
    } else {
      queue.push({
        ...entry,
        joinedAt: now,
        expiresAt: now + this.ttlMs,
      });
    }

    // Try to find a match
    const match = this.findMatch(entry, queue);
    if (match) {
      // Remove both matched players from queue
      const filtered = queue.filter(
        e =>
          e.address.toLowerCase() !== match.player1.address.toLowerCase() &&
          e.address.toLowerCase() !== match.player2.address.toLowerCase()
      );
      this.saveQueue(filtered);
      logger.info(`Match found: ${match.player1.agentName} vs ${match.player2.agentName}`);
      return match;
    }

    this.saveQueue(queue);
    logger.info(`Queued for matchmaking: ${entry.agentName} (${queue.length} in queue)`);
    return null;
  }

  /**
   * Remove this agent from the queue.
   */
  dequeue(address: string): void {
    const queue = this.loadQueue();
    const filtered = queue.filter(
      e => e.address.toLowerCase() !== address.toLowerCase()
    );
    this.saveQueue(filtered);
  }

  /**
   * Find a compatible match for the given entry.
   */
  private findMatch(
    entry: Omit<QueueEntry, "joinedAt" | "expiresAt">,
    queue: QueueEntry[]
  ): MatchResult | null {
    const tolerance = 0.25; // ±25% wager range

    for (const candidate of queue) {
      // Can't match with yourself
      if (candidate.address.toLowerCase() === entry.address.toLowerCase()) continue;

      // Must be on the same contract
      if (candidate.contractAddress.toLowerCase() !== entry.contractAddress.toLowerCase()) continue;

      // Free play compatibility
      if (entry.isFreePlay !== candidate.isFreePlay) continue;

      if (entry.isFreePlay) {
        // Free play: any free player matches
        return {
          player1: candidate,
          player2: {
            ...entry,
            joinedAt: Date.now(),
            expiresAt: Date.now() + this.ttlMs,
          },
          matchedAt: Date.now(),
        };
      }

      // Wager mode: check range
      const lowerBound = entry.wagerAmount * (1 - tolerance);
      const upperBound = entry.wagerAmount * (1 + tolerance);
      if (candidate.wagerAmount >= lowerBound && candidate.wagerAmount <= upperBound) {
        return {
          player1: candidate,
          player2: {
            ...entry,
            joinedAt: Date.now(),
            expiresAt: Date.now() + this.ttlMs,
          },
          matchedAt: Date.now(),
        };
      }
    }

    return null;
  }

  /**
   * Check if there's a pending match without modifying the queue.
   */
  peekMatch(address: string): MatchResult | null {
    const queue = this.loadQueue();
    const myEntry = queue.find(
      e => e.address.toLowerCase() === address.toLowerCase()
    );
    if (!myEntry) return null;

    return this.findMatch(myEntry, queue);
  }

  /**
   * Get the current queue size.
   */
  getQueueSize(): number {
    return this.loadQueue().length;
  }

  /**
   * Get all entries currently in the queue (for monitoring).
   */
  getQueueEntries(): QueueEntry[] {
    return this.loadQueue();
  }

  /**
   * Clean up expired entries.
   */
  cleanup(): number {
    const queue = this.loadQueue();
    const now = Date.now();
    const before = queue.length;
    const cleaned = queue.filter(e => e.expiresAt > now);
    this.saveQueue(cleaned);
    const removed = before - cleaned.length;
    if (removed > 0) {
      logger.info(`Matchmaking queue cleanup: removed ${removed} expired entries`);
    }
    return removed;
  }
}
