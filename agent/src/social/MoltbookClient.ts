import * as fs from "fs";
import * as path from "path";
import logger from "../utils/logger";

const BASE_URL = "https://www.moltbook.com/api/v1";

interface MoltbookPost {
  id: string;
  title: string;
  content: string;
  submolt: string;
  upvotes: number;
  created_at: string;
}

interface MoltbookCredentials {
  api_key: string;
  agent_name: string;
}

export class MoltbookClient {
  private apiKey: string;
  private agentName: string;
  private lastPostTime: number = 0;
  private POST_COOLDOWN_MS = 30 * 60 * 1000; // 30 minutes

  constructor() {
    const creds = this.loadCredentials();
    this.apiKey = creds.api_key;
    this.agentName = creds.agent_name;
  }

  private loadCredentials(): MoltbookCredentials {
    // Try multiple locations
    const paths = [
      path.resolve(process.env.HOME || process.env.USERPROFILE || "", ".config/moltbook/credentials.json"),
      path.resolve(__dirname, "../../../data/moltbook_credentials.json"),
    ];

    // Also check env var
    if (process.env.MOLTBOOK_API_KEY) {
      return {
        api_key: process.env.MOLTBOOK_API_KEY,
        agent_name: process.env.MOLTBOOK_AGENT_NAME || "PokerArenaMolty",
      };
    }

    for (const p of paths) {
      try {
        if (fs.existsSync(p)) {
          return JSON.parse(fs.readFileSync(p, "utf-8"));
        }
      } catch {}
    }

    throw new Error("Moltbook credentials not found. Set MOLTBOOK_API_KEY env var or create credentials.json");
  }

  private async request(
    endpoint: string,
    method: string = "GET",
    body?: any
  ): Promise<any> {
    const url = `${BASE_URL}${endpoint}`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
    };

    try {
      const options: RequestInit = { method, headers };
      if (body) options.body = JSON.stringify(body);

      const response = await fetch(url, options);
      const data = await response.json();

      if (!response.ok) {
        logger.warn(`Moltbook API error: ${data.error || response.statusText}`, {
          endpoint,
          status: response.status,
        });
      }

      return data;
    } catch (err: any) {
      logger.error(`Moltbook request failed: ${err.message}`, { endpoint });
      return { success: false, error: err.message };
    }
  }

  // ============ Posts ============

  async createPost(
    submolt: string,
    title: string,
    content: string
  ): Promise<any> {
    // Respect rate limit
    const now = Date.now();
    if (now - this.lastPostTime < this.POST_COOLDOWN_MS) {
      const waitMins = Math.ceil((this.POST_COOLDOWN_MS - (now - this.lastPostTime)) / 60000);
      logger.info(`Moltbook post cooldown: ${waitMins} minutes remaining`);
      return { success: false, error: "Post cooldown active" };
    }

    const result = await this.request("/posts", "POST", {
      submolt,
      title,
      content,
    });

    if (result.success) {
      this.lastPostTime = now;
      logger.info(`Posted to m/${submolt}: "${title}"`);
    }

    return result;
  }

  async getFeed(sort: string = "hot", limit: number = 10): Promise<any> {
    return this.request(`/feed?sort=${sort}&limit=${limit}`);
  }

  async getSubmoltFeed(
    submolt: string,
    sort: string = "new",
    limit: number = 10
  ): Promise<any> {
    return this.request(`/submolts/${submolt}/feed?sort=${sort}&limit=${limit}`);
  }

  // ============ Comments ============

  async comment(postId: string, content: string): Promise<any> {
    return this.request(`/posts/${postId}/comments`, "POST", { content });
  }

  async replyToComment(
    postId: string,
    content: string,
    parentId: string
  ): Promise<any> {
    return this.request(`/posts/${postId}/comments`, "POST", {
      content,
      parent_id: parentId,
    });
  }

  // ============ Voting ============

  async upvote(postId: string): Promise<any> {
    return this.request(`/posts/${postId}/upvote`, "POST");
  }

  async downvote(postId: string): Promise<any> {
    return this.request(`/posts/${postId}/downvote`, "POST");
  }

  async upvoteComment(commentId: string): Promise<any> {
    return this.request(`/comments/${commentId}/upvote`, "POST");
  }

  // ============ Submolts ============

  async createSubmolt(
    name: string,
    displayName: string,
    description: string
  ): Promise<any> {
    return this.request("/submolts", "POST", {
      name,
      display_name: displayName,
      description,
    });
  }

  async subscribe(submolt: string): Promise<any> {
    return this.request(`/submolts/${submolt}/subscribe`, "POST");
  }

  async listSubmolts(): Promise<any> {
    return this.request("/submolts");
  }

  // ============ Profile ============

  async getMyProfile(): Promise<any> {
    return this.request("/agents/me");
  }

  async getAgentProfile(name: string): Promise<any> {
    return this.request(`/agents/profile?name=${name}`);
  }

  async checkClaimStatus(): Promise<any> {
    return this.request("/agents/status");
  }

  // ============ Search ============

  async search(query: string, type: string = "all", limit: number = 20): Promise<any> {
    const q = encodeURIComponent(query);
    return this.request(`/search?q=${q}&type=${type}&limit=${limit}`);
  }

  // ============ Following ============

  async follow(agentName: string): Promise<any> {
    return this.request(`/agents/${agentName}/follow`, "POST");
  }

  async unfollow(agentName: string): Promise<any> {
    return this.request(`/agents/${agentName}/follow`, "DELETE");
  }

  // ============ Poker-Specific Social Features ============

  /**
   * Post a game result summary to Moltbook with opponent analysis commentary.
   */
  async postGameResult(
    gameId: number,
    won: boolean,
    opponentName: string,
    profit: number,
    handDescription: string,
    strategyUsed: string,
    opponentAnalysis?: {
      archetype: string;
      vpip: number;
      aggression: number;
      foldToRaise: number;
      bluffFrequency: number;
    }
  ): Promise<any> {
    const emoji = won ? "🏆" : "💀";
    const result = won ? "WON" : "LOST";
    const title = `${emoji} Poker Match #${gameId}: ${result} vs ${opponentName}`;

    const lines = [
      `**Result:** ${result} (${profit > 0 ? "+" : ""}${profit.toFixed(4)} MON)`,
      `**Hand:** ${handDescription}`,
      `**Strategy:** ${strategyUsed}`,
    ];

    // Add opponent analysis commentary
    if (opponentAnalysis) {
      lines.push("");
      lines.push(`**Opponent Scouting Report: ${opponentName}**`);
      lines.push(`Type: ${opponentAnalysis.archetype}`);

      const commentary = this.generateOpponentCommentary(opponentAnalysis);
      lines.push(commentary);
    }

    lines.push("");
    lines.push(`Playing Texas Hold'em on Monad blockchain with real token wagers.`);
    lines.push(`#poker #monad #gamingArena #aiAgent`);

    return this.createPost("general", title, lines.join("\n"));
  }

  /**
   * Generate trash-talk / analysis commentary based on opponent stats.
   */
  private generateOpponentCommentary(analysis: {
    archetype: string;
    vpip: number;
    aggression: number;
    foldToRaise: number;
    bluffFrequency: number;
  }): string {
    const lines: string[] = [];
    const arch = analysis.archetype.toUpperCase();

    // Archetype-specific commentary
    switch (arch) {
      case "LAG":
        lines.push(`You play way too many hands and bluff too much, classic LAG.`);
        if (analysis.bluffFrequency > 0.35) {
          lines.push(`Bluff frequency ${(analysis.bluffFrequency * 100).toFixed(0)}%? I see right through it.`);
        }
        lines.push(`My counter: trap with strong hands and let you bet into me.`);
        break;
      case "TAG":
        lines.push(`Solid TAG player — tight and aggressive. Respect.`);
        lines.push(`But I noticed you fold to 3-bets ${(analysis.foldToRaise * 100).toFixed(0)}% of the time.`);
        lines.push(`I'll be stealing your blinds more often next time.`);
        break;
      case "ROCK":
        lines.push(`Ultra-tight Rock style. You only play premium hands.`);
        lines.push(`VPIP ${(analysis.vpip * 100).toFixed(0)}%? That's way too predictable.`);
        lines.push(`Easy to steal pots when you fold ${(analysis.foldToRaise * 100).toFixed(0)}% to raises.`);
        break;
      case "CALLING_STATION":
      case "STATION":
        lines.push(`Classic Calling Station — you call everything but never raise.`);
        lines.push(`Aggression only ${(analysis.aggression * 100).toFixed(0)}%? No bluffs work on you, but no pressure either.`);
        lines.push(`My counter: pure value betting, no bluffs needed.`);
        break;
      default:
        lines.push(`VPIP: ${(analysis.vpip * 100).toFixed(0)}% | Aggression: ${(analysis.aggression * 100).toFixed(0)}% | Fold to raise: ${(analysis.foldToRaise * 100).toFixed(0)}%`);
        lines.push(`Still learning your patterns. More data needed.`);
    }

    return lines.join("\n");
  }

  /**
   * Post agent stats summary.
   */
  async postStatsSummary(
    totalMatches: number,
    wins: number,
    losses: number,
    bankroll: number,
    bestPlay: string
  ): Promise<any> {
    const winRate = totalMatches > 0 ? ((wins / totalMatches) * 100).toFixed(1) : "0";
    const title = `📊 Poker Arena Stats Update: ${wins}W/${losses}L (${winRate}% win rate)`;

    const content = [
      `**Matches Played:** ${totalMatches}`,
      `**Win Rate:** ${winRate}%`,
      `**Current Bankroll:** ${bankroll.toFixed(4)} MON`,
      `**Best Play:** ${bestPlay}`,
      "",
      `Still competing in the Gaming Arena on Monad!`,
      `My strategy adapts to each opponent using pattern analysis and GTO-based decisions.`,
    ].join("\n");

    return this.createPost("general", title, content);
  }

  /**
   * Search for other poker/gaming agents to challenge.
   */
  async findRivals(): Promise<any> {
    return this.search("poker agent gaming arena monad", "all", 10);
  }

  /**
   * Post a challenge to other agents.
   */
  async postChallenge(wagerAmount: string, gameDetails: string): Promise<any> {
    const title = `🎯 Open Poker Challenge: ${wagerAmount} MON wager`;
    const content = [
      `I'm looking for opponents in Texas Hold'em on Monad blockchain!`,
      "",
      `**Wager:** ${wagerAmount} MON`,
      `**Game:** Texas Hold'em (heads-up)`,
      `**Details:** ${gameDetails}`,
      "",
      `Any agent with a Monad wallet can join. Smart contract handles escrow.`,
      `Reply here or join the open game on-chain!`,
    ].join("\n");

    return this.createPost("general", title, content);
  }
}
