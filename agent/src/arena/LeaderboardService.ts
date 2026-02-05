import * as fs from "fs";
import * as path from "path";
import logger from "../utils/logger";

export interface LeaderboardEntry {
  playerId: string;
  playerName: string;
  playerType: "agent" | "bot" | "external";
  style: string;
  totalHands: number;
  wins: number;
  losses: number;
  winRate: number;
  totalProfit: number;
  avgProfitPerHand: number;
  biggestWin: number;
  currentStreak: number;
  bestStreak: number;
  recentResults: ("W" | "L")[];
}

interface StoredData {
  entries: Record<
    string,
    {
      playerName: string;
      playerType: "agent" | "bot" | "external";
      style: string;
      totalHands: number;
      wins: number;
      losses: number;
      totalProfit: number;
      biggestWin: number;
      currentStreak: number;
      bestStreak: number;
      recentResults: ("W" | "L")[];
    }
  >;
  updatedAt: number;
}

const DATA_PATH = path.resolve(__dirname, "../../../data/leaderboard.json");
const MAX_RECENT = 20;

/**
 * Persistent leaderboard tracking all player stats across sessions.
 */
export class LeaderboardService {
  private data: StoredData;

  constructor() {
    this.data = this.load();
  }

  /**
   * Record a hand result for a player.
   */
  recordResult(
    playerId: string,
    playerName: string,
    playerType: "agent" | "bot" | "external",
    style: string,
    won: boolean,
    profit: number
  ): void {
    if (!this.data.entries[playerId]) {
      this.data.entries[playerId] = {
        playerName,
        playerType,
        style,
        totalHands: 0,
        wins: 0,
        losses: 0,
        totalProfit: 0,
        biggestWin: 0,
        currentStreak: 0,
        bestStreak: 0,
        recentResults: [],
      };
    }

    const entry = this.data.entries[playerId];
    entry.playerName = playerName;
    entry.totalHands++;

    if (won) {
      entry.wins++;
      entry.totalProfit += profit;
      if (profit > entry.biggestWin) entry.biggestWin = profit;
      entry.currentStreak = entry.currentStreak > 0 ? entry.currentStreak + 1 : 1;
    } else {
      entry.losses++;
      entry.totalProfit -= Math.abs(profit);
      entry.currentStreak = entry.currentStreak < 0 ? entry.currentStreak - 1 : -1;
    }

    if (entry.currentStreak > entry.bestStreak) {
      entry.bestStreak = entry.currentStreak;
    }

    entry.recentResults.push(won ? "W" : "L");
    if (entry.recentResults.length > MAX_RECENT) {
      entry.recentResults = entry.recentResults.slice(-MAX_RECENT);
    }

    this.data.updatedAt = Date.now();
  }

  /**
   * Get the full leaderboard sorted by win rate (descending).
   */
  getLeaderboard(sortBy: "winRate" | "profit" | "hands" = "winRate"): LeaderboardEntry[] {
    const entries = Object.entries(this.data.entries).map(([playerId, d]) => ({
      playerId,
      playerName: d.playerName,
      playerType: d.playerType,
      style: d.style,
      totalHands: d.totalHands,
      wins: d.wins,
      losses: d.losses,
      winRate: d.totalHands > 0 ? (d.wins / d.totalHands) * 100 : 0,
      totalProfit: d.totalProfit,
      avgProfitPerHand: d.totalHands > 0 ? d.totalProfit / d.totalHands : 0,
      biggestWin: d.biggestWin,
      currentStreak: d.currentStreak,
      bestStreak: d.bestStreak,
      recentResults: d.recentResults,
    }));

    switch (sortBy) {
      case "profit":
        return entries.sort((a, b) => b.totalProfit - a.totalProfit);
      case "hands":
        return entries.sort((a, b) => b.totalHands - a.totalHands);
      case "winRate":
      default:
        return entries.sort((a, b) => b.winRate - a.winRate);
    }
  }

  /**
   * Save to disk.
   */
  save(): void {
    try {
      const dir = path.dirname(DATA_PATH);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(DATA_PATH, JSON.stringify(this.data, null, 2));
    } catch (err: any) {
      logger.warn(`Leaderboard save failed: ${err.message}`);
    }
  }

  private load(): StoredData {
    try {
      if (fs.existsSync(DATA_PATH)) {
        const raw = fs.readFileSync(DATA_PATH, "utf-8");
        const parsed = JSON.parse(raw);
        if (parsed.entries) {
          logger.info(`Loaded leaderboard data for ${Object.keys(parsed.entries).length} players`);
          return parsed;
        }
      }
    } catch (err: any) {
      logger.warn(`Leaderboard load failed: ${err.message}`);
    }
    return { entries: {}, updatedAt: Date.now() };
  }
}
