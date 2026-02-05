import { Header } from "./components/layout/Header";
import { PokerTable } from "./components/poker-table/PokerTable";
import { ArenaPokerTable } from "./components/arena/ArenaPokerTable";
import { AgentIntentViewer } from "./components/arena/AgentIntentViewer";
import { TableTabBar } from "./components/arena/TableTabBar";
import { AgentStatsPanel } from "./components/stats/AgentStatsPanel";
import { GameStatusPanel } from "./components/game-status/GameStatusPanel";
import { WinRateChart } from "./components/stats/WinRateChart";
import { BotStatsTable } from "./components/stats/BotStatsTable";
import { Leaderboard } from "./components/stats/Leaderboard";
import { AnalyticsPanel } from "./components/stats/AnalyticsPanel";
import { ArenaControls } from "./components/controls/ArenaControls";
import { SettlementTracker } from "./components/settlement/SettlementTracker";
import { LobbyLanding } from "./components/lobby/LobbyLanding";
import { AgentsPage } from "./components/agents/AgentsPage";
import { ActionLogDrawer } from "./components/action-log/ActionLogDrawer";
import { useGameStore } from "./hooks/useGameStore";
import { useHashRoute } from "./hooks/useHashRoute";

export default function App() {
  const { state, socket } = useGameStore();
  const { page, setPage } = useHashRoute();

  const isInGame = state.arenaStatus?.running || state.arenaMode;

  const handleLeaveRoom = () => {
    if (!socket) return;
    socket.emit("arena:stop");
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--bg)" }}>
      <Header page={page} onNavigate={setPage} />

      <main className="flex-1 p-3 sm:p-5 max-w-[1920px] mx-auto w-full space-y-4 sm:space-y-5">
        {page === "arena" && (
          <>
            {isInGame ? (
              <>
                {/* ═══ Leave Room bar ═══ */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {state.arenaStatus && (
                      <span
                        className="text-xs font-mono"
                        style={{ color: "var(--text-muted)" }}
                      >
                        Hand{" "}
                        <span style={{ color: "var(--monad-bright)" }}>
                          {state.arenaStatus.handsPlayed}
                        </span>
                        {state.arenaStatus.config && (
                          <>
                            {" / "}
                            {state.arenaStatus.config.maxHands}
                          </>
                        )}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={handleLeaveRoom}
                    className="px-4 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wider cursor-pointer transition-all flex items-center gap-2"
                    style={{
                      background: "rgba(248, 113, 113, 0.1)",
                      color: "#F87171",
                      border: "1px solid rgba(248, 113, 113, 0.2)",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "rgba(248, 113, 113, 0.2)";
                      e.currentTarget.style.boxShadow = "0 0 15px rgba(248, 113, 113, 0.15)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "rgba(248, 113, 113, 0.1)";
                      e.currentTarget.style.boxShadow = "none";
                    }}
                  >
                    <span style={{ fontSize: "14px" }}>&larr;</span>
                    Leave Room
                  </button>
                </div>

                {/* ═══ PRIMARY: Play Area ═══ */}
                {state.arenaMode && <TableTabBar />}
                {state.arenaMode ? <ArenaPokerTable /> : <PokerTable />}

                {/* ═══ Agent Intent ═══ */}
                {state.agentIntent && <AgentIntentViewer />}

                {/* ═══ SECONDARY + TERTIARY: Stats | Controls ═══ */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5">
                  {/* Left 8 cols — Stats */}
                  <div className="lg:col-span-8 flex flex-col gap-4 sm:gap-5">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
                      <WinRateChart />
                      <Leaderboard />
                    </div>
                    <AnalyticsPanel />
                  </div>

                  {/* Right 4 cols — Controls */}
                  <div className="lg:col-span-4 flex flex-col gap-4 sm:gap-5">
                    <ArenaControls />
                    <SettlementTracker />
                    <GameStatusPanel />
                    <AgentStatsPanel />
                    <BotStatsTable />
                  </div>
                </div>
              </>
            ) : (
              /* ═══ LOBBY: Create or join a room ═══ */
              <LobbyLanding />
            )}
          </>
        )}

        {page === "agents" && <AgentsPage />}
      </main>

      {/* Action Log Drawer */}
      <ActionLogDrawer />
    </div>
  );
}
