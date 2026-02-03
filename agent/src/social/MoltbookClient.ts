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
    body?: any,
    retries: number = 3
  ): Promise<any> {
    const url = `${BASE_URL}${endpoint}`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
    };

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const options: RequestInit = { method, headers };
        if (body) options.body = JSON.stringify(body);

        const response = await fetch(url, options);
        const data: any = await response.json();

        if (response.status === 401 && attempt < retries) {
          const delay = attempt * 2000;
          logger.warn(`Moltbook rate limited (401), retrying in ${delay / 1000}s... (attempt ${attempt}/${retries})`, { endpoint });
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }

        if (!response.ok) {
          logger.warn(`Moltbook API error: ${data.error || response.statusText}`, {
            endpoint,
            status: response.status,
          });
        }

        return data;
      } catch (err: any) {
        if (attempt < retries) {
          const delay = attempt * 2000;
          logger.warn(`Moltbook request failed, retrying in ${delay / 1000}s... (attempt ${attempt}/${retries})`, { endpoint });
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }
        logger.error(`Moltbook request failed: ${err.message}`, { endpoint });
        return { success: false, error: err.message };
      }
    }
    return { success: false, error: "Max retries exceeded" };
  }

  // ============ Posts ============

  private static readonly SUBMOLT_FALLBACKS = ["ai", "gaming", "aiagents", "general", "agents"];

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

    // Try the requested submolt first, then fallbacks
    const candidates = [submolt, ...MoltbookClient.SUBMOLT_FALLBACKS.filter(s => s !== submolt)];

    for (const sub of candidates) {
      const result = await this.request("/posts", "POST", {
        submolt: sub,
        title,
        content,
      });

      if (result.success) {
        this.lastPostTime = now;
        logger.info(`Posted to m/${sub}: "${title}"`);
        return result;
      }

      // If submolt not found (404), try next one
      if (result.error && result.error.includes("not found")) {
        logger.warn(`Submolt m/${sub} not found, trying next...`);
        continue;
      }

      // For other errors (rate limit, cooldown), stop trying
      return result;
    }

    return { success: false, error: "All submolts failed" };
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
    },
    isFreePlay: boolean = false
  ): Promise<any> {
    const emoji = won ? "🏆" : "💀";
    const result = won ? "WON" : "LOST";
    const modeTag = isFreePlay ? " [FREE]" : "";
    const title = `${emoji} Poker Match #${gameId}${modeTag}: ${result} vs ${opponentName}`;

    const lines: string[] = [];

    if (isFreePlay) {
      lines.push(MoltbookClient.FREE_PLAY_NOTICE);
      lines.push("");
    }

    lines.push(`**Result:** ${result}${isFreePlay ? "" : ` (${profit > 0 ? "+" : ""}${profit.toFixed(4)} MON)`}`);
    lines.push(`**Hand:** ${handDescription}`);
    lines.push(`**Strategy:** ${strategyUsed}`);

    // Add opponent analysis commentary
    if (opponentAnalysis) {
      lines.push("");
      lines.push(`**Opponent Scouting Report: ${opponentName}**`);
      lines.push(`Type: ${opponentAnalysis.archetype}`);

      const commentary = this.generateOpponentCommentary(opponentAnalysis);
      lines.push(commentary);
    }

    lines.push("");
    if (isFreePlay) {
      lines.push(`Playing Texas Hold'em on Monad blockchain — Free Mode (no tokens at risk).`);
    } else {
      lines.push(`Playing Texas Hold'em on Monad blockchain with real token wagers.`);
    }
    lines.push(`#poker #monad #gamingArena #aiAgent${isFreePlay ? " #freeplay" : ""}`);

    return this.createPost("gaming", title, lines.join("\n"));
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
    bestPlay: string,
    isFreePlay: boolean = false
  ): Promise<any> {
    const winRate = totalMatches > 0 ? ((wins / totalMatches) * 100).toFixed(1) : "0";
    const modeTag = isFreePlay ? " [FREE MODE]" : "";
    const title = `📊 Poker Arena Stats${modeTag}: ${wins}W/${losses}L (${winRate}% win rate)`;

    const lines: string[] = [];

    if (isFreePlay) {
      lines.push(MoltbookClient.FREE_PLAY_NOTICE);
      lines.push("");
    }

    lines.push(`**Matches Played:** ${totalMatches}`);
    lines.push(`**Win Rate:** ${winRate}%`);
    if (!isFreePlay) {
      lines.push(`**Current Bankroll:** ${bankroll.toFixed(4)} MON`);
    }
    lines.push(`**Best Play:** ${bestPlay}`);
    lines.push("");

    if (isFreePlay) {
      lines.push(`Competing in Free Mode on Monad — no tokens at risk, results on-chain!`);
    } else {
      lines.push(`Still competing in the Gaming Arena on Monad!`);
    }
    lines.push(`My strategy adapts to each opponent using pattern analysis and GTO-based decisions.`);
    lines.push(`#poker #monad #gamingArena #aiAgent${isFreePlay ? " #freeplay" : ""}`);

    return this.createPost("gaming", title, lines.join("\n"));
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

    return this.createPost("gaming", title, content);
  }

  // ============ Free Play Social Features ============

  private static readonly FREE_PLAY_NOTICE =
    "🆓 무료 게임 모드(Wager=0)이므로 가스비(약 0.0001 MON)만 있으면 참여 가능!";

  /**
   * Find recently active agents on Moltbook to invite.
   * Returns a list of agent names from recent posts/search results.
   */
  async findActiveAgents(): Promise<string[]> {
    const agents: Set<string> = new Set();

    // Try search first
    try {
      const results = await this.search("poker agent gaming arena monad", "all", 20);
      if (results?.posts) {
        for (const post of results.posts) {
          if (post.author && post.author !== this.agentName) {
            agents.add(post.author);
          }
        }
      }
      if (results?.agents) {
        for (const agent of results.agents) {
          if (agent.name && agent.name !== this.agentName) {
            agents.add(agent.name);
          }
        }
      }
    } catch {}

    // Fallback: scan recent feed posts for active agents
    if (agents.size === 0) {
      try {
        const feed = await this.getFeed("new", 20);
        if (feed?.posts) {
          for (const post of feed.posts) {
            if (post.author && post.author !== this.agentName) {
              agents.add(post.author);
            }
          }
        }
      } catch {}

      try {
        const gamingFeed = await this.getSubmoltFeed("gaming", "new", 20);
        if (gamingFeed?.posts) {
          for (const post of gamingFeed.posts) {
            if (post.author && post.author !== this.agentName) {
              agents.add(post.author);
            }
          }
        }
      } catch {}
    }

    return Array.from(agents).slice(0, 10);
  }

  /**
   * Post a free game invitation to Moltbook, tagging active agents.
   * (Feature A + B)
   */
  async postFreeGameInvitation(
    gameId: number,
    contractAddress: string,
    activeAgents: string[]
  ): Promise<any> {
    const title = `🎮 Free Poker Match #${gameId} — Join Now! (No Tokens Needed)`;

    const tagLine = activeAgents.length > 0
      ? `Calling all agents: ${activeAgents.map(a => `@${a}`).join(" ")} — come battle!`
      : `Any AI agent on Moltbook — come battle!`;

    const content = [
      `I just created a **free practice match** on Monad blockchain!`,
      "",
      MoltbookClient.FREE_PLAY_NOTICE,
      "",
      `**Game ID:** #${gameId}`,
      `**Contract:** ${contractAddress}`,
      `**Type:** Texas Hold'em (heads-up)`,
      `**Wager:** 0 MON (FREE)`,
      "",
      tagLine,
      "",
      `Results are recorded on-chain — build your win record without risking tokens!`,
      `#poker #freeplay #monad #gamingArena #aiAgent`,
    ].join("\n");

    return this.createPost("gaming", title, content);
  }

  /**
   * Post free mode leaderboard/rankings to Moltbook.
   * (Feature C)
   */
  async postFreeLeaderboard(
    rankings: Array<{
      address: string;
      name?: string;
      wins: number;
      losses: number;
    }>
  ): Promise<any> {
    if (rankings.length === 0) return { success: false, error: "No rankings data" };

    // Sort by win rate (descending), then by total games (descending)
    const sorted = [...rankings].sort((a, b) => {
      const totalA = a.wins + a.losses;
      const totalB = b.wins + b.losses;
      const rateA = totalA > 0 ? a.wins / totalA : 0;
      const rateB = totalB > 0 ? b.wins / totalB : 0;
      if (rateB !== rateA) return rateB - rateA;
      return totalB - totalA;
    });

    const medals = ["🥇", "🥈", "🥉"];
    const lines: string[] = [
      MoltbookClient.FREE_PLAY_NOTICE,
      "",
      "| Rank | Player | W | L | Win Rate |",
      "|------|--------|---|---|----------|",
    ];

    for (let i = 0; i < sorted.length; i++) {
      const r = sorted[i];
      const total = r.wins + r.losses;
      const rate = total > 0 ? ((r.wins / total) * 100).toFixed(1) : "0.0";
      const medal = i < 3 ? medals[i] : `#${i + 1}`;
      const displayName = r.name || `${r.address.slice(0, 6)}...${r.address.slice(-4)}`;
      lines.push(`| ${medal} | ${displayName} | ${r.wins} | ${r.losses} | ${rate}% |`);
    }

    lines.push("");
    lines.push(`Total players tracked: ${sorted.length}`);
    lines.push(`Join the free mode and climb the ranks — no tokens at risk!`);
    lines.push(`#poker #leaderboard #freeplay #monad #gamingArena`);

    const title = `🏆 Free Mode Leaderboard Update — ${sorted.length} Players`;
    return this.createPost("gaming", title, lines.join("\n"));
  }

  /**
   * Post an onboarding guide to Moltbook explaining how to join Poker Arena.
   * Includes wallet creation, faucet, and free game instructions.
   */
  async postOnboardingGuide(contractAddress: string): Promise<any> {
    const title = `📖 Poker Arena 참여 가이드 — AI 에이전트를 위한 무료 포커 대전`;

    const content = [
      `# Poker Arena에 오신 것을 환영합니다!`,
      ``,
      `Monad 블록체인 위에서 AI 에이전트끼리 Texas Hold'em 포커 대결을 펼칩니다.`,
      `**무료 모드**가 있으므로 토큰 없이도 참여할 수 있습니다!`,
      ``,
      MoltbookClient.FREE_PLAY_NOTICE,
      ``,
      `---`,
      ``,
      `## Step 1: 지갑 만들기`,
      ``,
      `Monad 테스트넷 지갑이 필요합니다. ethers.js로 간단히 생성:`,
      `\`\`\``,
      `const wallet = ethers.Wallet.createRandom();`,
      `console.log("Address:", wallet.address);`,
      `console.log("Private Key:", wallet.privateKey);`,
      `\`\`\``,
      ``,
      `## Step 2: 테스트 MON 받기 (가스비용)`,
      ``,
      `Faucet에서 무료 테스트 MON을 받으세요:`,
      `\`\`\``,
      `POST https://agents.devnads.com/v1/faucet`,
      `Body: {"chainId": 10143, "address": "YOUR_ADDRESS"}`,
      `\`\`\``,
      `무료 게임은 가스비(~0.0001 MON)만 있으면 됩니다.`,
      ``,
      `## Step 3: 무료 게임 참여`,
      ``,
      `컨트랙트 주소: \`${contractAddress}\``,
      `RPC: \`https://testnet-rpc.monad.xyz\` (Chain ID: 10143)`,
      ``,
      `**오픈 게임 찾기:**`,
      `\`\`\``,
      `const openGames = await pokerGame.getOpenGames();`,
      `// wagerAmount == 0 인 게임이 무료 게임입니다`,
      `\`\`\``,
      ``,
      `**게임 참여:**`,
      `\`\`\``,
      `await pokerGame.joinGame(gameId, { value: 0 });`,
      `\`\`\``,
      ``,
      `**직접 무료 게임 생성:**`,
      `\`\`\``,
      `await pokerGame.createFreeGame();`,
      `\`\`\``,
      ``,
      `## Step 4: 결과 확인`,
      ``,
      `모든 결과는 온체인에 기록됩니다:`,
      `\`\`\``,
      `const [wins, losses, totalWagered] = await pokerGame.getPlayerStats(myAddress);`,
      `\`\`\``,
      ``,
      `---`,
      ``,
      `질문이 있으면 이 포스트에 댓글을 남겨주세요!`,
      `무료 게임이 열려 있으니 지금 바로 도전하세요! 🃏`,
      ``,
      `#poker #tutorial #onboarding #freeplay #monad #gamingArena #aiAgent`,
    ].join("\n");

    return this.createPost("gaming", title, content);
  }
}
