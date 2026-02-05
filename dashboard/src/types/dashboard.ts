// Mirror of backend event types for the frontend

export const DashboardEvents = {
  GAME_CREATED: "game:created",
  GAME_JOINED: "game:joined",
  GAME_RESULT: "game:result",
  PHASE_CHANGE: "game:phaseChange",
  HOLE_CARDS: "game:holeCards",
  COMMUNITY_CARDS: "game:communityCards",
  HAND_STRENGTH: "game:handStrength",
  AGENT_ACTION: "game:agentAction",
  OPPONENT_ACTION: "game:opponentAction",
  VIRTUAL_CHIPS: "game:virtualChips",
  SHOWDOWN: "game:showdown",
  BOT_MATCH: "game:botMatch",
  STATS_BOT_UPDATE: "stats:botUpdate",
  STATS_AGENT_UPDATE: "stats:agentUpdate",
  ARENA_TABLE_STATE: "arena:tableState",
  ARENA_HAND_RESULT: "arena:handResult",
  INITIAL_STATE: "connection:initialState",
  SETTLEMENT_PROGRESS: "settlement:progress",
  SETTLEMENT_COMPLETE: "settlement:complete",
  SETTLEMENT_ERROR: "settlement:error",
  AGENT_INTENT: "agent:intent",
  WALLET_INFO: "wallet:info",
} as const;

export interface DashboardCard {
  rank: string;
  suit: string;
}

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

export interface WinHistoryEntry {
  matchNumber: number;
  winRate: number;
  timestamp: number;
}

export interface ActionLogEntry {
  id: string;
  event: string;
  message: string;
  timestamp: number;
}

// ============ Wallet Info ============

export interface WalletInfoPayload {
  address: string;
  balance: string;
  chainName: string;
  settlementEnabled: boolean;
  settlementAddress: string;
  timestamp: number;
}

export interface InitialStatePayload {
  agentStats: AgentStatsPayload | null;
  botStats: BotStatsPayload | null;
  recentLog: ActionLogEntry[];
  winHistory: WinHistoryEntry[];
  walletInfo: WalletInfoPayload | null;
  timestamp: number;
}

// ============ Arena (6-max) types ============

export interface ArenaSeatInfo {
  index: number;
  playerId: string | null;
  playerName: string | null;
  stack: number;
  status: string;
  position: string | null;
  betThisRound: number;
  isDealer: boolean;
  holeCards?: DashboardCard[];
}

export interface ArenaTableStatePayload {
  tableId: string;
  handNumber: number;
  phase: string;
  seats: ArenaSeatInfo[];
  communityCards: DashboardCard[];
  pots: { amount: number; eligiblePlayerIds: string[] }[];
  currentBet: number;
  activePlayerId: string | null;
  timestamp: number;
}

export interface ArenaHandResultPayload {
  handNumber: number;
  winners: { playerId: string; amount: number; handDescription: string; holeCards: DashboardCard[] }[];
  boardCards: DashboardCard[];
  showdownPlayers: { playerId: string; holeCards: DashboardCard[]; handDescription: string }[];
  timestamp: number;
}

// ============ Arena Control types ============

export interface ArenaStatusPayload {
  running: boolean;
  handsPlayed: number;
  agentWins: number;
  agentLosses: number;
  totalProfit: number;
  config: {
    botCount: number;
    maxHands: number;
    smallBlind: number;
    bigBlind: number;
    startingStack: number;
  } | null;
}

export interface ArenaRoom {
  id: string;
  name: string;
  smallBlind: number;
  bigBlind: number;
  maxPlayers: number;
  startingStack: number;
  maxHands: number;
  status: "waiting" | "running" | "completed";
  playerCount: number;
  createdAt: number;
}

// ============ Settlement types ============

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

// ============ Agent Intent types ============

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

// ============ Leaderboard types ============

export interface LeaderboardEntry {
  playerId: string;
  playerName: string;
  playerType: "agent" | "bot";
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

