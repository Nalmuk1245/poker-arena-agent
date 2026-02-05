import { useState, useEffect } from "react";
import { useGameStore } from "../../hooks/useGameStore";
import type { LeaderboardEntry } from "../../types/dashboard";

type SortKey = "winRate" | "profit" | "hands";

export function Leaderboard() {
  const { state, socket } = useGameStore();
  const [sortBy, setSortBy] = useState<SortKey>("winRate");
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);

  // Fetch leaderboard on mount and when sort changes
  useEffect(() => {
    if (!socket) return;
    socket.emit("leaderboard:get", { sortBy }, (data: LeaderboardEntry[]) => {
      if (data) setEntries(data);
    });
  }, [socket, sortBy]);

  // Update from real-time push
  useEffect(() => {
    if (state.leaderboard.length > 0) {
      setEntries(state.leaderboard);
    }
  }, [state.leaderboard]);

  const sortButtons: { key: SortKey; label: string }[] = [
    { key: "winRate", label: "Win %" },
    { key: "profit", label: "Profit" },
    { key: "hands", label: "Hands" },
  ];

  return (
    <div className="glass-panel overflow-hidden">
      <div
        className="px-4 py-3 flex items-center justify-between"
        style={{ borderBottom: "1px solid var(--panel-border)" }}
      >
        <h3
          className="text-xs font-semibold uppercase tracking-widest"
          style={{ color: "var(--text-muted)" }}
        >
          Leaderboard
        </h3>
        <div className="flex gap-1">
          {sortButtons.map((btn) => (
            <button
              key={btn.key}
              onClick={() => setSortBy(btn.key)}
              className="px-2 py-0.5 rounded text-[10px] font-medium uppercase tracking-wider cursor-pointer transition-all"
              style={{
                background:
                  sortBy === btn.key
                    ? "rgba(131, 110, 249, 0.2)"
                    : "transparent",
                color:
                  sortBy === btn.key ? "#A78BFA" : "var(--text-muted)",
                border:
                  sortBy === btn.key
                    ? "1px solid rgba(131, 110, 249, 0.3)"
                    : "1px solid transparent",
              }}
            >
              {btn.label}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr
              style={{
                borderBottom: "1px solid var(--panel-border)",
                background: "rgba(131, 110, 249, 0.04)",
              }}
            >
              <th
                className="text-left px-4 py-2 font-medium w-8"
                style={{ color: "var(--text-muted)" }}
              >
                #
              </th>
              <th
                className="text-left px-2 py-2 font-medium"
                style={{ color: "var(--text-muted)" }}
              >
                Player
              </th>
              <th
                className="text-center px-2 py-2 font-medium"
                style={{ color: "var(--text-muted)" }}
              >
                W/L
              </th>
              <th
                className="text-center px-2 py-2 font-medium"
                style={{ color: "var(--text-muted)" }}
              >
                Rate
              </th>
              <th
                className="text-center px-2 py-2 font-medium"
                style={{ color: "var(--text-muted)" }}
              >
                Profit
              </th>
              <th
                className="text-center px-2 py-2 font-medium"
                style={{ color: "var(--text-muted)" }}
              >
                Streak
              </th>
              <th
                className="text-center px-2 py-2 font-medium"
                style={{ color: "var(--text-muted)" }}
              >
                Recent
              </th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="text-center py-6"
                  style={{ color: "var(--text-muted)" }}
                >
                  No leaderboard data yet. Start an arena session!
                </td>
              </tr>
            ) : (
              entries.map((entry, idx) => {
                const isAgent = entry.playerType === "agent";
                const rankColors = ["#FFD700", "#C0C0C0", "#CD7F32"];
                const rankColor =
                  idx < 3 ? rankColors[idx] : "var(--text-muted)";

                return (
                  <tr
                    key={entry.playerId}
                    className="transition-colors"
                    style={{
                      borderBottom: "1px solid rgba(131, 110, 249, 0.06)",
                      background: isAgent
                        ? "rgba(131, 110, 249, 0.06)"
                        : "transparent",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background =
                        "rgba(131, 110, 249, 0.08)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = isAgent
                        ? "rgba(131, 110, 249, 0.06)"
                        : "transparent";
                    }}
                  >
                    {/* Rank */}
                    <td
                      className="px-4 py-2 font-bold"
                      style={{ color: rankColor }}
                    >
                      {idx + 1}
                    </td>

                    {/* Player */}
                    <td className="px-2 py-2">
                      <div className="flex items-center gap-1.5">
                        {isAgent && (
                          <span
                            className="text-[9px] px-1.5 py-0.5 rounded font-bold uppercase"
                            style={{
                              background:
                                "linear-gradient(135deg, #836EF9 0%, #E84393 100%)",
                              color: "#fff",
                            }}
                          >
                            AI
                          </span>
                        )}
                        <div>
                          <div
                            className="font-semibold"
                            style={{
                              color: isAgent
                                ? "var(--monad-bright)"
                                : "var(--text-primary)",
                            }}
                          >
                            {entry.playerName}
                          </div>
                          <div
                            className="text-[10px]"
                            style={{ color: "var(--text-muted)" }}
                          >
                            {entry.style}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* W/L */}
                    <td className="text-center px-2 py-2">
                      <span
                        className="font-bold"
                        style={{ color: "#34D399" }}
                      >
                        {entry.wins}
                      </span>
                      <span style={{ color: "var(--text-muted)" }}>
                        /
                      </span>
                      <span
                        className="font-bold"
                        style={{ color: "#F87171" }}
                      >
                        {entry.losses}
                      </span>
                    </td>

                    {/* Win Rate */}
                    <td className="text-center px-2 py-2">
                      <span
                        className="font-bold"
                        style={{ color: "#A78BFA" }}
                      >
                        {entry.winRate.toFixed(1)}%
                      </span>
                    </td>

                    {/* Profit */}
                    <td className="text-center px-2 py-2">
                      <span
                        className="font-bold"
                        style={{
                          color:
                            entry.totalProfit > 0
                              ? "#34D399"
                              : entry.totalProfit < 0
                              ? "#F87171"
                              : "var(--text-muted)",
                        }}
                      >
                        {entry.totalProfit > 0 ? "+" : ""}
                        {entry.totalProfit.toFixed(0)}
                      </span>
                    </td>

                    {/* Streak */}
                    <td className="text-center px-2 py-2">
                      <span
                        style={{
                          color:
                            entry.currentStreak > 0
                              ? "#34D399"
                              : entry.currentStreak < 0
                              ? "#F87171"
                              : "var(--text-muted)",
                        }}
                      >
                        {entry.currentStreak > 0
                          ? `+${entry.currentStreak}`
                          : entry.currentStreak}
                      </span>
                    </td>

                    {/* Recent Results */}
                    <td className="text-center px-2 py-2">
                      <div className="flex gap-px justify-center">
                        {entry.recentResults.slice(-10).map((r, i) => (
                          <div
                            key={i}
                            className="w-1.5 h-3 rounded-sm"
                            style={{
                              background:
                                r === "W" ? "#34D399" : "#F87171",
                              opacity: 0.8,
                            }}
                          />
                        ))}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Summary footer */}
      {entries.length > 0 && (
        <div
          className="px-4 py-2 flex justify-between text-[10px]"
          style={{
            borderTop: "1px solid var(--panel-border)",
            color: "var(--text-muted)",
          }}
        >
          <span>{entries.length} players</span>
          <span>
            Total hands:{" "}
            {entries.reduce((sum, e) => sum + e.totalHands, 0)}
          </span>
        </div>
      )}
    </div>
  );
}
