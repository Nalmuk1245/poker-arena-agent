/**
 * Dashboard Socket.IO event types and payloads.
 */

// ============ Event Names ============

export const DashboardEvents = {
  // Game lifecycle
  GAME_CREATED: "game:created",
  GAME_JOINED: "game:joined",
  GAME_RESULT: "game:result",

  // Game phases & cards
  PHASE_CHANGE: "game:phaseChange",
  HOLE_CARDS: "game:holeCards",
  COMMUNITY_CARDS: "game:communityCards",
  HAND_STRENGTH: "game:handStrength",

  // Actions
  AGENT_ACTION: "game:agentAction",
  OPPONENT_ACTION: "game:opponentAction",

  // Virtual chips & showdown
  VIRTUAL_CHIPS: "game:virtualChips",
  SHOWDOWN: "game:showdown",
  BOT_MATCH: "game:botMatch",

  // Stats
  STATS_BOT_UPDATE: "stats:botUpdate",
  STATS_AGENT_UPDATE: "stats:agentUpdate",

  // Arena (6-max multiplayer)
  ARENA_TABLE_STATE: "arena:tableState",
  ARENA_HAND_RESULT: "arena:handResult",

  // Connection
  INITIAL_STATE: "connection:initialState",

  // Settlement (on-chain batch)
  SETTLEMENT_PROGRESS: "settlement:progress",
  SETTLEMENT_COMPLETE: "settlement:complete",
  SETTLEMENT_ERROR: "settlement:error",

  // Agent intent (decision reasoning)
  AGENT_INTENT: "agent:intent",

  // Wallet info
  WALLET_INFO: "wallet:info",
} as const;

export type DashboardEventName = (typeof DashboardEvents)[keyof typeof DashboardEvents];

// ============ Card representation for dashboard ============

export interface DashboardCard {
  rank: string;  // "2"-"A"
  suit: string;  // "h","d","c","s"
}

// ============ Event Payloads ============

export interface GameCreatedPayload {
  gameId: number;
  timestamp: number;
}

export interface GameJoinedPayload {
  gameId: number;
  opponent?: string;
  timestamp: number;
}

export interface GameResultPayload {
  gameId: number;
  won: boolean;
  payout: number;
  timestamp: number;
}

export interface PhaseChangePayload {
  gameId: number;
  phase: string;
  timestamp: number;
}

export interface HoleCardsPayload {
  gameId: number;
  cards: DashboardCard[];
  display: string;  // fancy display e.g. "[A\u2660 K\u2665]"
  timestamp: number;
}

export interface CommunityCardsPayload {
  gameId: number;
  cards: DashboardCard[];
  display: string;
  phase: string;
  timestamp: number;
}

export interface HandStrengthPayload {
  gameId: number;
  handName: string;
  timestamp: number;
}

export interface AgentActionPayload {
  gameId: number;
  action: string;
  amount: number;
  reasoning: string;
  timestamp: number;
}

export interface OpponentActionPayload {
  gameId: number;
  phase: string;
  timestamp: number;
}

export interface VirtualChipsPayload {
  gameId: number;
  myStack: number;
  opponentStack: number;
  pot: number;
  timestamp: number;
}

export interface ShowdownPayload {
  gameId: number;
  result: string;
  timestamp: number;
}

export interface BotMatchPayload {
  gameId: number;
  botLabel: string;
  timestamp: number;
}

// ============ Arena Payloads ============

export interface ArenaTableStatePayload {
  tableId: string;
  handNumber: number;
  phase: string;
  seats: Array<{
    index: number;
    playerId: string | null;
    playerName: string | null;
    stack: number;
    status: string;
    position: string | null;
    betThisRound: number;
    isDealer: boolean;
  }>;
  communityCards: DashboardCard[];
  pots: Array<{ amount: number; eligiblePlayerIds: string[] }>;
  currentBet: number;
  activePlayerId: string | null;
  timestamp: number;
}

export interface ArenaHandResultPayload {
  handNumber: number;
  winners: Array<{
    playerId: string;
    amount: number;
    handDescription: string;
    holeCards: DashboardCard[];
  }>;
  boardCards: DashboardCard[];
  showdownPlayers: Array<{
    playerId: string;
    holeCards: DashboardCard[];
    handDescription: string;
  }>;
  timestamp: number;
}

// ============ Stats Payloads ============

export interface AgentStatsPayload {
  matchesPlayed: number;
  wins: number;
  losses: number;
  winRate: number;
  bankroll: number;
  riskLevel: string;
  consecutiveLosses: number;
  isFreePlay: boolean;
  timestamp: number;
}

export interface BotStatsEntry {
  address: string;
  label: string;
  style: string;
  wins: number;
  losses: number;
  handsPlayed: number;
  currentStreak: number;
  winRate: number;
}

export interface BotStatsPayload {
  bots: BotStatsEntry[];
  timestamp: number;
}

// ============ Win History (for chart) ============

export interface WinHistoryEntry {
  matchNumber: number;
  winRate: number;
  timestamp: number;
}

// ============ Initial State (sent on connection) ============

export interface InitialStatePayload {
  agentStats: AgentStatsPayload | null;
  botStats: BotStatsPayload | null;
  recentLog: ActionLogEntry[];
  winHistory: WinHistoryEntry[];
  walletInfo: WalletInfoPayload | null;
  timestamp: number;
}

// ============ Action Log ============

export interface ActionLogEntry {
  id: string;
  event: string;
  message: string;
  timestamp: number;
}

// ============ Settlement Payloads ============

export interface SettlementProgressPayload {
  roomId: string;
  pendingCount: number;
  batchSize: number;
  timestamp: number;
}

export interface SettlementCompletePayload {
  roomId: string;
  batchNumber: number;
  handsSettled: number;
  txHash: string;
  timestamp: number;
}

export interface SettlementErrorPayload {
  roomId: string;
  handsLost: number;
  error: string;
  timestamp: number;
}

// ============ Agent Intent Payload ============

export interface AgentIntentPayload {
  gameId: number;
  phase: string;
  position: string;
  equity: number;
  evFold: number;
  evCall: number;
  evRaise: number;
  evBestAction: string;
  bluffDecision: { shouldBluff: boolean; reasoning: string };
  opponentProfile: {
    playerId: string;
    archetype: string;
    aggression: number;
    foldToRaise: number;
    vpip: number;
  } | null;
  multiwayCount: number;
  action: string;
  amount: number;
  reasoning: string;
  timestamp: number;
}

// ============ Wallet Info Payload ============

export interface WalletInfoPayload {
  address: string;
  balance: string;       // MON balance (formatted)
  chainName: string;
  settlementEnabled: boolean;
  settlementAddress: string;
  timestamp: number;
}

// ============ Wallet Auth types ============

export interface WalletAuthPayload {
  address: string;
  signature: string;
  message: string;
}

export interface WalletAuthResponse {
  success: boolean;
  address?: string;
  error?: string;
}

// ============ Event Map (for type-safe Socket.IO) ============

export interface DashboardEventMap {
  [DashboardEvents.GAME_CREATED]: GameCreatedPayload;
  [DashboardEvents.GAME_JOINED]: GameJoinedPayload;
  [DashboardEvents.GAME_RESULT]: GameResultPayload;
  [DashboardEvents.PHASE_CHANGE]: PhaseChangePayload;
  [DashboardEvents.HOLE_CARDS]: HoleCardsPayload;
  [DashboardEvents.COMMUNITY_CARDS]: CommunityCardsPayload;
  [DashboardEvents.HAND_STRENGTH]: HandStrengthPayload;
  [DashboardEvents.AGENT_ACTION]: AgentActionPayload;
  [DashboardEvents.OPPONENT_ACTION]: OpponentActionPayload;
  [DashboardEvents.VIRTUAL_CHIPS]: VirtualChipsPayload;
  [DashboardEvents.SHOWDOWN]: ShowdownPayload;
  [DashboardEvents.BOT_MATCH]: BotMatchPayload;
  [DashboardEvents.STATS_BOT_UPDATE]: BotStatsPayload;
  [DashboardEvents.STATS_AGENT_UPDATE]: AgentStatsPayload;
  [DashboardEvents.ARENA_TABLE_STATE]: ArenaTableStatePayload;
  [DashboardEvents.ARENA_HAND_RESULT]: ArenaHandResultPayload;
  [DashboardEvents.INITIAL_STATE]: InitialStatePayload;
  [DashboardEvents.SETTLEMENT_PROGRESS]: SettlementProgressPayload;
  [DashboardEvents.SETTLEMENT_COMPLETE]: SettlementCompletePayload;
  [DashboardEvents.SETTLEMENT_ERROR]: SettlementErrorPayload;
  [DashboardEvents.AGENT_INTENT]: AgentIntentPayload;
  [DashboardEvents.WALLET_INFO]: WalletInfoPayload;
}
