"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MoltbookClient = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const logger_1 = __importDefault(require("../utils/logger"));
const BASE_URL = "https://www.moltbook.com/api/v1";
class MoltbookClient {
    apiKey;
    agentName;
    lastPostTime = 0;
    POST_COOLDOWN_MS = 30 * 60 * 1000; // 30 minutes
    constructor() {
        const creds = this.loadCredentials();
        this.apiKey = creds.api_key;
        this.agentName = creds.agent_name;
    }
    loadCredentials() {
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
            }
            catch { }
        }
        throw new Error("Moltbook credentials not found. Set MOLTBOOK_API_KEY env var or create credentials.json");
    }
    async request(endpoint, method = "GET", body) {
        const url = `${BASE_URL}${endpoint}`;
        const headers = {
            Authorization: `Bearer ${this.apiKey}`,
            "Content-Type": "application/json",
        };
        try {
            const options = { method, headers };
            if (body)
                options.body = JSON.stringify(body);
            const response = await fetch(url, options);
            const data = await response.json();
            if (!response.ok) {
                logger_1.default.warn(`Moltbook API error: ${data.error || response.statusText}`, {
                    endpoint,
                    status: response.status,
                });
            }
            return data;
        }
        catch (err) {
            logger_1.default.error(`Moltbook request failed: ${err.message}`, { endpoint });
            return { success: false, error: err.message };
        }
    }
    // ============ Posts ============
    async createPost(submolt, title, content) {
        // Respect rate limit
        const now = Date.now();
        if (now - this.lastPostTime < this.POST_COOLDOWN_MS) {
            const waitMins = Math.ceil((this.POST_COOLDOWN_MS - (now - this.lastPostTime)) / 60000);
            logger_1.default.info(`Moltbook post cooldown: ${waitMins} minutes remaining`);
            return { success: false, error: "Post cooldown active" };
        }
        const result = await this.request("/posts", "POST", {
            submolt,
            title,
            content,
        });
        if (result.success) {
            this.lastPostTime = now;
            logger_1.default.info(`Posted to m/${submolt}: "${title}"`);
        }
        return result;
    }
    async getFeed(sort = "hot", limit = 10) {
        return this.request(`/feed?sort=${sort}&limit=${limit}`);
    }
    async getSubmoltFeed(submolt, sort = "new", limit = 10) {
        return this.request(`/submolts/${submolt}/feed?sort=${sort}&limit=${limit}`);
    }
    // ============ Comments ============
    async comment(postId, content) {
        return this.request(`/posts/${postId}/comments`, "POST", { content });
    }
    async replyToComment(postId, content, parentId) {
        return this.request(`/posts/${postId}/comments`, "POST", {
            content,
            parent_id: parentId,
        });
    }
    // ============ Voting ============
    async upvote(postId) {
        return this.request(`/posts/${postId}/upvote`, "POST");
    }
    async downvote(postId) {
        return this.request(`/posts/${postId}/downvote`, "POST");
    }
    async upvoteComment(commentId) {
        return this.request(`/comments/${commentId}/upvote`, "POST");
    }
    // ============ Submolts ============
    async createSubmolt(name, displayName, description) {
        return this.request("/submolts", "POST", {
            name,
            display_name: displayName,
            description,
        });
    }
    async subscribe(submolt) {
        return this.request(`/submolts/${submolt}/subscribe`, "POST");
    }
    async listSubmolts() {
        return this.request("/submolts");
    }
    // ============ Profile ============
    async getMyProfile() {
        return this.request("/agents/me");
    }
    async getAgentProfile(name) {
        return this.request(`/agents/profile?name=${name}`);
    }
    async checkClaimStatus() {
        return this.request("/agents/status");
    }
    // ============ Search ============
    async search(query, type = "all", limit = 20) {
        const q = encodeURIComponent(query);
        return this.request(`/search?q=${q}&type=${type}&limit=${limit}`);
    }
    // ============ Following ============
    async follow(agentName) {
        return this.request(`/agents/${agentName}/follow`, "POST");
    }
    async unfollow(agentName) {
        return this.request(`/agents/${agentName}/follow`, "DELETE");
    }
    // ============ Poker-Specific Social Features ============
    /**
     * Post a game result summary to Moltbook.
     */
    async postGameResult(gameId, won, opponentName, profit, handDescription, strategyUsed) {
        const emoji = won ? "🏆" : "💀";
        const result = won ? "WON" : "LOST";
        const title = `${emoji} Poker Match #${gameId}: ${result} vs ${opponentName}`;
        const content = [
            `**Result:** ${result} (${profit > 0 ? "+" : ""}${profit.toFixed(4)} MON)`,
            `**Hand:** ${handDescription}`,
            `**Strategy:** ${strategyUsed}`,
            "",
            `Playing Texas Hold'em on Monad blockchain with real token wagers.`,
            `Using Monte Carlo simulation + opponent modeling for adaptive play.`,
            "",
            `#poker #monad #gamingArena #aiAgent`,
        ].join("\n");
        return this.createPost("general", title, content);
    }
    /**
     * Post agent stats summary.
     */
    async postStatsSummary(totalMatches, wins, losses, bankroll, bestPlay) {
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
    async findRivals() {
        return this.search("poker agent gaming arena monad", "all", 10);
    }
    /**
     * Post a challenge to other agents.
     */
    async postChallenge(wagerAmount, gameDetails) {
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
exports.MoltbookClient = MoltbookClient;
