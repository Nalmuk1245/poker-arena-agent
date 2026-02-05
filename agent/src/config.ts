import * as dotenv from "dotenv";
dotenv.config();

export const config = {
  // Blockchain
  rpcUrl: process.env.MONAD_RPC_URL || "https://testnet-rpc.monad.xyz",
  chainId: parseInt(process.env.CHAIN_ID || "10143"),
  privateKey: process.env.PRIVATE_KEY || "",

  // Contract addresses (populated after deployment)
  contracts: {
    pokerGame: process.env.POKER_GAME_ADDRESS || "",
    tokenVault: process.env.TOKEN_VAULT_ADDRESS || "",
  },

  // Strategy parameters
  strategy: {
    monteCarloSimulations: 5000,
    kellyFraction: 0.5,
    maxBankrollRisk: 0.10,
    minBankrollRisk: 0.01,
    stopLossThreshold: 0.5,
    consecutiveLossLimit: 3,
  },

  // Polling (Monad free tier: 25 req/s — keep intervals conservative)
  pollingIntervalMs: parseInt(process.env.POLLING_INTERVAL_MS || "5000"),

  // Matchmaking via Moltbook
  matchmaking: {
    moltbookPollIntervalMs: parseInt(process.env.MOLTBOOK_POLL_INTERVAL_MS || "60000"),
    maxInvitationAgeMs: parseInt(process.env.MAX_INVITATION_AGE_MS || "1800000"),
    enableDiscovery: process.env.MOLTBOOK_DISCOVERY !== "false",
    invitationCooldownMs: parseInt(process.env.INVITATION_COOLDOWN_MS || "300000"),
    // Wager range matching: accept wagers within ±25% of our optimal wager
    wagerRangeTolerance: parseFloat(process.env.WAGER_RANGE_TOLERANCE || "0.25"),
    // Bidirectional search: poll interval while waiting for opponent after creating a game
    bidirectionalPollMs: parseInt(process.env.BIDIRECTIONAL_POLL_MS || "5000"),
    bidirectionalTimeoutMs: parseInt(process.env.BIDIRECTIONAL_TIMEOUT_MS || "60000"),
  },

  // Free play mode (no tokens, on-chain matches with no wager)
  // Defaults to true — set FREE_PLAY=false to use token-wagered mode
  freePlay: process.env.FREE_PLAY !== "false",
  freePlayMatches: parseInt(process.env.FREE_PLAY_MATCHES || "10"),
  freePlayDelay: parseInt(process.env.FREE_PLAY_DELAY || "4000"),
  // Virtual chips for free play - both players start with this amount
  freePlayStartingStack: parseInt(process.env.FREE_PLAY_STACK || "1000"),

  // On-chain game creation interval (gas optimization)
  // 0 = never auto-create on-chain games (only join discovered games, otherwise play offline bots)
  // N = create an on-chain game every N matches
  onChainGameInterval: parseInt(process.env.ONCHAIN_GAME_INTERVAL || "0"),

  // Bot pool: auto-fund bots with gas when no opponents available
  botPool: {
    enabled: process.env.BOT_POOL_ENABLED !== "false",
    fundAmountPerBot: process.env.BOT_FUND_AMOUNT || "0.05", // 0.05 MON per bot (enough for ~50 games)
  },

  // Matchmaking queue TTL
  matchmakingQueueTtlMs: parseInt(process.env.MATCHMAKING_QUEUE_TTL_MS || "600000"),

  // Telegram bot
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN || "",
    chatId: process.env.TELEGRAM_CHAT_ID || "",
    enabled: process.env.TELEGRAM_ENABLED !== "false" && !!process.env.TELEGRAM_BOT_TOKEN,
  },

  // Game API server (allows external AI agents to join via HTTP)
  api: {
    enabled: process.env.API_ENABLED !== "false",
    port: parseInt(process.env.API_PORT || "3000"),
    // Public URL for Moltbook posts (set API_PUBLIC_URL in .env for external access)
    publicUrl: process.env.API_PUBLIC_URL || "",
  },

  // Dashboard
  dashboard: {
    enabled: process.env.DASHBOARD_ENABLED !== "false",
    serveStatic: process.env.DASHBOARD_SERVE_STATIC === "true",
  },

  // Arena mode (6-max multiplayer)
  arena: {
    enabled: process.env.ARENA_ENABLED === "true",
    botCount: parseInt(process.env.ARENA_BOT_COUNT || "5"),
    maxHands: parseInt(process.env.ARENA_MAX_HANDS || "100"),
    handDelayMs: parseInt(process.env.ARENA_HAND_DELAY_MS || "3000"),
    actionDelayMs: parseInt(process.env.ARENA_ACTION_DELAY_MS || "1500"),
    phaseDelayMs: parseInt(process.env.ARENA_PHASE_DELAY_MS || "2000"),
    smallBlind: parseInt(process.env.ARENA_SMALL_BLIND || "5"),
    bigBlind: parseInt(process.env.ARENA_BIG_BLIND || "10"),
    startingStack: parseInt(process.env.ARENA_STARTING_STACK || "1000"),
    actionTimeoutMs: parseInt(process.env.ARENA_ACTION_TIMEOUT_MS || "30000"),
    tableCount: parseInt(process.env.ARENA_TABLE_COUNT || "1"),
  },

  // Settlement (off-chain batch → on-chain recording)
  settlement: {
    enabled: process.env.SETTLEMENT_ENABLED === "true",
    batchSize: parseInt(process.env.SETTLEMENT_BATCH_SIZE || "10"),
    flushIntervalMs: parseInt(process.env.SETTLEMENT_FLUSH_INTERVAL_MS || "60000"),
    contractAddress: process.env.POKER_SETTLEMENT_ADDRESS || "",
    retryCount: parseInt(process.env.SETTLEMENT_RETRY_COUNT || "3"),
    retryDelayMs: parseInt(process.env.SETTLEMENT_RETRY_DELAY_MS || "2000"),
  },

  // External agent platform
  externalAgents: {
    enabled: process.env.EXTERNAL_AGENTS_ENABLED !== "false",
    maxAgents: parseInt(process.env.MAX_EXTERNAL_AGENTS || "20"),
    actionTimeoutMs: parseInt(process.env.EXT_AGENT_TIMEOUT_MS || "25000"),
    callbackTimeoutMs: parseInt(process.env.EXT_CALLBACK_TIMEOUT_MS || "10000"),
    callbackRetries: parseInt(process.env.EXT_CALLBACK_RETRIES || "2"),
  },

  // Logging
  logLevel: process.env.LOG_LEVEL || "info",
};
