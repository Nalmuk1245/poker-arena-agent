import type {
  DashboardCard,
  AgentStatsPayload,
  BotStatsPayload,
  ActionLogEntry,
  WinHistoryEntry,
  ArenaSeatInfo,
  ArenaTableStatePayload,
  ArenaHandResultPayload,
  ArenaStatusPayload,
  ArenaRoom,
  LeaderboardEntry,
  SettlementProgressPayload,
  SettlementCompletePayload,
  SettlementErrorPayload,
  AgentIntentPayload,
  WalletInfoPayload,
} from "../types/dashboard";

/** Per-table state for multi-table support */
export interface ArenaTableData {
  tableId: string;
  handNumber: number;
  phase: string | null;
  seats: ArenaSeatInfo[];
  communityCards: DashboardCard[];
  activePlayerId: string | null;
  pots: { amount: number; eligiblePlayerIds: string[] }[];
  currentBet: number;
  lastResult: ArenaHandResultPayload | null;
}

export interface GameState {
  connected: boolean;

  // Current game
  currentGameId: number | null;
  currentPhase: string | null;
  holeCards: DashboardCard[];
  communityCards: DashboardCard[];
  handStrength: string | null;
  pot: number;
  myStack: number;
  opponentStack: number;
  opponentLabel: string | null;

  // Stats
  agentStats: AgentStatsPayload | null;
  botStats: BotStatsPayload | null;

  // Log & history
  actionLog: ActionLogEntry[];
  winHistory: WinHistoryEntry[];

  // Arena (6-max) — multi-table
  arenaMode: boolean;
  arenaTables: Record<string, ArenaTableData>;
  activeTableId: string | null;

  // Derived from active table (backward compat)
  arenaSeats: ArenaSeatInfo[];
  arenaHandNumber: number;
  arenaPhase: string | null;
  arenaCommunityCards: DashboardCard[];
  arenaActivePlayerId: string | null;
  arenaPots: { amount: number; eligiblePlayerIds: string[] }[];
  arenaCurrentBet: number;
  arenaLastResult: ArenaHandResultPayload | null;

  // Arena control
  arenaStatus: ArenaStatusPayload | null;

  // Rooms
  rooms: ArenaRoom[];

  // Leaderboard
  leaderboard: LeaderboardEntry[];

  // Settlement tracking
  settlementProgress: SettlementProgressPayload | null;
  settlementLog: SettlementCompletePayload[];
  settlementFlash: boolean;

  // Agent intent
  agentIntent: AgentIntentPayload | null;

  // Wallet info
  walletInfo: WalletInfoPayload | null;

  // User wallet (MetaMask)
  userWalletAddress: string | null;
}

export const initialState: GameState = {
  connected: false,
  currentGameId: null,
  currentPhase: null,
  holeCards: [],
  communityCards: [],
  handStrength: null,
  pot: 0,
  myStack: 0,
  opponentStack: 0,
  opponentLabel: null,
  agentStats: null,
  botStats: null,
  actionLog: [],
  winHistory: [],
  arenaMode: false,
  arenaTables: {},
  activeTableId: null,
  arenaSeats: [],
  arenaHandNumber: 0,
  arenaPhase: null,
  arenaCommunityCards: [],
  arenaActivePlayerId: null,
  arenaPots: [],
  arenaCurrentBet: 0,
  arenaLastResult: null,
  arenaStatus: null,
  rooms: [],
  leaderboard: [],
  settlementProgress: null,
  settlementLog: [],
  settlementFlash: false,
  agentIntent: null,
  walletInfo: null,
  userWalletAddress: null,
};

export type GameAction =
  | { type: "SET_CONNECTED"; payload: boolean }
  | { type: "GAME_CREATED"; payload: { gameId: number } }
  | { type: "GAME_JOINED"; payload: { gameId: number; opponent?: string } }
  | { type: "GAME_RESULT"; payload: { gameId: number; won: boolean; payout: number } }
  | { type: "PHASE_CHANGE"; payload: { phase: string } }
  | { type: "HOLE_CARDS"; payload: { cards: DashboardCard[] } }
  | { type: "COMMUNITY_CARDS"; payload: { cards: DashboardCard[]; phase: string } }
  | { type: "HAND_STRENGTH"; payload: { handName: string } }
  | { type: "VIRTUAL_CHIPS"; payload: { myStack: number; opponentStack: number; pot: number } }
  | { type: "BOT_MATCH"; payload: { gameId: number; botLabel: string } }
  | { type: "SHOWDOWN"; payload: { result: string } }
  | { type: "AGENT_STATS"; payload: AgentStatsPayload }
  | { type: "BOT_STATS"; payload: BotStatsPayload }
  | { type: "ADD_LOG"; payload: ActionLogEntry }
  | { type: "SET_LOGS"; payload: ActionLogEntry[] }
  | { type: "SET_WIN_HISTORY"; payload: WinHistoryEntry[] }
  | { type: "INITIAL_STATE"; payload: { agentStats: AgentStatsPayload | null; botStats: BotStatsPayload | null; recentLog: ActionLogEntry[]; winHistory: WinHistoryEntry[]; walletInfo?: WalletInfoPayload | null } }
  | { type: "ARENA_TABLE_STATE"; payload: ArenaTableStatePayload }
  | { type: "ARENA_HAND_RESULT"; payload: ArenaHandResultPayload & { tableId?: string } }
  | { type: "ARENA_CLEAR_RESULT"; tableId?: string }
  | { type: "ARENA_STATUS"; payload: ArenaStatusPayload }
  | { type: "SET_ROOMS"; payload: ArenaRoom[] }
  | { type: "SET_LEADERBOARD"; payload: LeaderboardEntry[] }
  | { type: "SET_ACTIVE_TABLE"; payload: string }
  | { type: "SETTLEMENT_PROGRESS"; payload: SettlementProgressPayload }
  | { type: "SETTLEMENT_COMPLETE"; payload: SettlementCompletePayload }
  | { type: "SETTLEMENT_ERROR"; payload: SettlementErrorPayload }
  | { type: "SETTLEMENT_FLASH_CLEAR" }
  | { type: "AGENT_INTENT"; payload: AgentIntentPayload }
  | { type: "WALLET_INFO"; payload: WalletInfoPayload }
  | { type: "WALLET_AUTH_SUCCESS"; payload: { address: string } }
  | { type: "WALLET_DISCONNECT" };

const MAX_LOG = 200;

/** Helper: derive flat arena fields from a table entry */
function deriveActiveTable(tables: Record<string, ArenaTableData>, activeTableId: string | null) {
  const t = activeTableId ? tables[activeTableId] : undefined;
  if (!t) {
    return {
      arenaSeats: [] as ArenaSeatInfo[],
      arenaHandNumber: 0,
      arenaPhase: null as string | null,
      arenaCommunityCards: [] as DashboardCard[],
      arenaActivePlayerId: null as string | null,
      arenaPots: [] as { amount: number; eligiblePlayerIds: string[] }[],
      arenaCurrentBet: 0,
      arenaLastResult: null as ArenaHandResultPayload | null,
    };
  }
  return {
    arenaSeats: t.seats,
    arenaHandNumber: t.handNumber,
    arenaPhase: t.phase,
    arenaCommunityCards: t.communityCards,
    arenaActivePlayerId: t.activePlayerId,
    arenaPots: t.pots,
    arenaCurrentBet: t.currentBet,
    arenaLastResult: t.lastResult,
  };
}

export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case "SET_CONNECTED":
      return { ...state, connected: action.payload };

    case "GAME_CREATED":
      return {
        ...state,
        currentGameId: action.payload.gameId,
        currentPhase: "WAITING",
        holeCards: [],
        communityCards: [],
        handStrength: null,
        pot: 0,
        myStack: 0,
        opponentStack: 0,
        opponentLabel: null,
      };

    case "GAME_JOINED":
      return {
        ...state,
        currentGameId: action.payload.gameId,
        currentPhase: "WAITING",
      };

    case "GAME_RESULT":
      return {
        ...state,
        currentPhase: "COMPLETE",
      };

    case "PHASE_CHANGE":
      return { ...state, currentPhase: action.payload.phase };

    case "HOLE_CARDS":
      return { ...state, holeCards: action.payload.cards };

    case "COMMUNITY_CARDS":
      return {
        ...state,
        communityCards: action.payload.cards,
        currentPhase: action.payload.phase,
      };

    case "HAND_STRENGTH":
      return { ...state, handStrength: action.payload.handName };

    case "VIRTUAL_CHIPS":
      return {
        ...state,
        myStack: action.payload.myStack,
        opponentStack: action.payload.opponentStack,
        pot: action.payload.pot,
      };

    case "BOT_MATCH":
      return {
        ...state,
        currentGameId: action.payload.gameId,
        currentPhase: "PREFLOP",
        opponentLabel: action.payload.botLabel,
        holeCards: [],
        communityCards: [],
        handStrength: null,
      };

    case "SHOWDOWN":
      return { ...state, currentPhase: "SHOWDOWN" };

    case "AGENT_STATS":
      return { ...state, agentStats: action.payload };

    case "BOT_STATS":
      return { ...state, botStats: action.payload };

    case "ADD_LOG": {
      const newLog = [...state.actionLog, action.payload];
      return {
        ...state,
        actionLog: newLog.length > MAX_LOG ? newLog.slice(-MAX_LOG) : newLog,
      };
    }

    case "SET_LOGS":
      return { ...state, actionLog: action.payload };

    case "SET_WIN_HISTORY":
      return { ...state, winHistory: action.payload };

    case "INITIAL_STATE":
      return {
        ...state,
        agentStats: action.payload.agentStats ?? state.agentStats,
        botStats: action.payload.botStats ?? state.botStats,
        actionLog: action.payload.recentLog,
        winHistory: action.payload.winHistory,
        walletInfo: action.payload.walletInfo ?? state.walletInfo,
      };

    case "ARENA_TABLE_STATE": {
      const tableId = action.payload.tableId;
      const tableData: ArenaTableData = {
        tableId,
        handNumber: action.payload.handNumber,
        phase: action.payload.phase,
        seats: action.payload.seats,
        communityCards: action.payload.communityCards,
        activePlayerId: action.payload.activePlayerId,
        pots: action.payload.pots,
        currentBet: action.payload.currentBet,
        lastResult: state.arenaTables[tableId]?.lastResult ?? null,
      };
      const newTables = { ...state.arenaTables, [tableId]: tableData };
      // Auto-select first table if none active
      const activeId = state.activeTableId ?? tableId;
      return {
        ...state,
        arenaMode: true,
        arenaTables: newTables,
        activeTableId: activeId,
        ...deriveActiveTable(newTables, activeId),
      };
    }

    case "ARENA_HAND_RESULT": {
      // Find which table this result belongs to (use tableId if provided, else active)
      const resultTableId = (action.payload as any).tableId || state.activeTableId;
      const newTables = { ...state.arenaTables };
      if (resultTableId && newTables[resultTableId]) {
        newTables[resultTableId] = { ...newTables[resultTableId], lastResult: action.payload };
      }
      return {
        ...state,
        arenaTables: newTables,
        ...deriveActiveTable(newTables, state.activeTableId),
      };
    }

    case "ARENA_CLEAR_RESULT": {
      const clearTableId = action.tableId || state.activeTableId;
      const newTables = { ...state.arenaTables };
      if (clearTableId && newTables[clearTableId]) {
        newTables[clearTableId] = { ...newTables[clearTableId], lastResult: null };
      }
      return {
        ...state,
        arenaTables: newTables,
        ...deriveActiveTable(newTables, state.activeTableId),
      };
    }

    case "SET_ACTIVE_TABLE": {
      const newActiveId = action.payload;
      return {
        ...state,
        activeTableId: newActiveId,
        ...deriveActiveTable(state.arenaTables, newActiveId),
      };
    }

    case "ARENA_STATUS":
      return {
        ...state,
        arenaStatus: action.payload,
      };

    case "SET_ROOMS":
      return {
        ...state,
        rooms: action.payload,
      };

    case "SET_LEADERBOARD":
      return {
        ...state,
        leaderboard: action.payload,
      };

    case "SETTLEMENT_PROGRESS":
      return { ...state, settlementProgress: action.payload };

    case "SETTLEMENT_COMPLETE": {
      const newLog = [action.payload, ...state.settlementLog].slice(0, 10);
      return { ...state, settlementLog: newLog, settlementFlash: true };
    }

    case "SETTLEMENT_ERROR":
      return { ...state, settlementProgress: null };

    case "SETTLEMENT_FLASH_CLEAR":
      return { ...state, settlementFlash: false };

    case "AGENT_INTENT":
      return { ...state, agentIntent: action.payload };

    case "WALLET_INFO":
      return { ...state, walletInfo: action.payload };

    case "WALLET_AUTH_SUCCESS":
      return { ...state, userWalletAddress: action.payload.address };

    case "WALLET_DISCONNECT":
      return { ...state, userWalletAddress: null };

    default:
      return state;
  }
}
