import { useState } from "react";
import { useGameStore } from "../../hooks/useGameStore";

export function ArenaControls() {
  const { state, socket } = useGameStore();
  const arenaStatus = state.arenaStatus;
  const isRunning = arenaStatus?.running ?? false;

  const [settings, setSettings] = useState({
    maxHands: 100,
    botCount: 5,
    smallBlind: 5,
    bigBlind: 10,
    startingStack: 1000,
    tableCount: 1,
  });

  const handleStart = () => {
    if (!socket) return;
    socket.emit("arena:start", settings);
  };

  const handleStop = () => {
    if (!socket) return;
    socket.emit("arena:stop");
  };

  return (
    <div className="glass-panel">
      <div
        className="px-4 py-3 flex items-center justify-between"
        style={{ borderBottom: "1px solid var(--panel-border)" }}
      >
        <h3
          className="text-xs font-semibold uppercase tracking-widest"
          style={{ color: "var(--text-muted)" }}
        >
          Arena Control
        </h3>
        <div className="flex items-center gap-2">
          <div
            className="w-2 h-2 rounded-full"
            style={{
              background: isRunning ? "#34D399" : "rgba(165, 160, 214, 0.3)",
              boxShadow: isRunning ? "0 0 8px rgba(52, 211, 153, 0.5)" : "none",
            }}
          />
          <span
            className="text-[10px] font-bold uppercase tracking-wider"
            style={{ color: isRunning ? "#34D399" : "var(--text-muted)" }}
          >
            {isRunning ? "Running" : "Idle"}
          </span>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Live Stats */}
        {arenaStatus && (
          <div className="grid grid-cols-3 gap-3">
            <div className="text-center">
              <div
                className="text-lg font-bold"
                style={{ color: "var(--monad-bright)" }}
              >
                {arenaStatus.handsPlayed}
              </div>
              <div
                className="text-[10px] uppercase tracking-wider"
                style={{ color: "var(--text-muted)" }}
              >
                Hands
              </div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold" style={{ color: "#34D399" }}>
                {arenaStatus.agentWins}
              </div>
              <div
                className="text-[10px] uppercase tracking-wider"
                style={{ color: "var(--text-muted)" }}
              >
                Wins
              </div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold" style={{ color: "#F87171" }}>
                {arenaStatus.agentLosses}
              </div>
              <div
                className="text-[10px] uppercase tracking-wider"
                style={{ color: "var(--text-muted)" }}
              >
                Losses
              </div>
            </div>
          </div>
        )}

        {/* Settings (only when idle) */}
        {!isRunning && (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <label className="block">
                <span
                  className="text-[10px] uppercase tracking-wider block mb-1"
                  style={{ color: "var(--text-muted)" }}
                >
                  Tables
                </span>
                <input
                  type="number"
                  min={1}
                  max={4}
                  value={settings.tableCount}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      tableCount: Math.min(4, Math.max(1, Number(e.target.value))),
                    }))
                  }
                  className="w-full px-3 py-1.5 rounded-lg text-xs font-mono"
                  style={{
                    background: "rgba(15, 12, 46, 0.8)",
                    border: "1px solid rgba(131, 110, 249, 0.2)",
                    color: "var(--text-primary)",
                    outline: "none",
                  }}
                />
              </label>
              <label className="block">
                <span
                  className="text-[10px] uppercase tracking-wider block mb-1"
                  style={{ color: "var(--text-muted)" }}
                >
                  Max Hands
                </span>
                <input
                  type="number"
                  value={settings.maxHands}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      maxHands: Number(e.target.value),
                    }))
                  }
                  className="w-full px-3 py-1.5 rounded-lg text-xs font-mono"
                  style={{
                    background: "rgba(15, 12, 46, 0.8)",
                    border: "1px solid rgba(131, 110, 249, 0.2)",
                    color: "var(--text-primary)",
                    outline: "none",
                  }}
                />
              </label>
              <label className="block">
                <span
                  className="text-[10px] uppercase tracking-wider block mb-1"
                  style={{ color: "var(--text-muted)" }}
                >
                  Bots
                </span>
                <input
                  type="number"
                  min={1}
                  max={5}
                  value={settings.botCount}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      botCount: Math.min(5, Math.max(1, Number(e.target.value))),
                    }))
                  }
                  className="w-full px-3 py-1.5 rounded-lg text-xs font-mono"
                  style={{
                    background: "rgba(15, 12, 46, 0.8)",
                    border: "1px solid rgba(131, 110, 249, 0.2)",
                    color: "var(--text-primary)",
                    outline: "none",
                  }}
                />
              </label>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <label className="block">
                <span
                  className="text-[10px] uppercase tracking-wider block mb-1"
                  style={{ color: "var(--text-muted)" }}
                >
                  SB
                </span>
                <input
                  type="number"
                  value={settings.smallBlind}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      smallBlind: Number(e.target.value),
                    }))
                  }
                  className="w-full px-3 py-1.5 rounded-lg text-xs font-mono"
                  style={{
                    background: "rgba(15, 12, 46, 0.8)",
                    border: "1px solid rgba(131, 110, 249, 0.2)",
                    color: "var(--text-primary)",
                    outline: "none",
                  }}
                />
              </label>
              <label className="block">
                <span
                  className="text-[10px] uppercase tracking-wider block mb-1"
                  style={{ color: "var(--text-muted)" }}
                >
                  BB
                </span>
                <input
                  type="number"
                  value={settings.bigBlind}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      bigBlind: Number(e.target.value),
                    }))
                  }
                  className="w-full px-3 py-1.5 rounded-lg text-xs font-mono"
                  style={{
                    background: "rgba(15, 12, 46, 0.8)",
                    border: "1px solid rgba(131, 110, 249, 0.2)",
                    color: "var(--text-primary)",
                    outline: "none",
                  }}
                />
              </label>
              <label className="block">
                <span
                  className="text-[10px] uppercase tracking-wider block mb-1"
                  style={{ color: "var(--text-muted)" }}
                >
                  Stack
                </span>
                <input
                  type="number"
                  value={settings.startingStack}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      startingStack: Number(e.target.value),
                    }))
                  }
                  className="w-full px-3 py-1.5 rounded-lg text-xs font-mono"
                  style={{
                    background: "rgba(15, 12, 46, 0.8)",
                    border: "1px solid rgba(131, 110, 249, 0.2)",
                    color: "var(--text-primary)",
                    outline: "none",
                  }}
                />
              </label>
            </div>
          </div>
        )}

        {/* Action Button */}
        {isRunning ? (
          <button
            onClick={handleStop}
            className="w-full py-2.5 rounded-lg text-xs font-bold uppercase tracking-widest cursor-pointer transition-all"
            style={{
              background: "rgba(248, 113, 113, 0.15)",
              color: "#F87171",
              border: "1px solid rgba(248, 113, 113, 0.3)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(248, 113, 113, 0.25)";
              e.currentTarget.style.boxShadow =
                "0 0 20px rgba(248, 113, 113, 0.2)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "rgba(248, 113, 113, 0.15)";
              e.currentTarget.style.boxShadow = "none";
            }}
          >
            Stop Arena
          </button>
        ) : (
          <button
            onClick={handleStart}
            className="w-full py-2.5 rounded-lg text-xs font-bold uppercase tracking-widest cursor-pointer transition-all"
            style={{
              background: "linear-gradient(135deg, #836EF9 0%, #E84393 100%)",
              color: "#fff",
              border: "none",
              boxShadow: "0 0 15px rgba(131, 110, 249, 0.3)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.boxShadow =
                "0 0 25px rgba(131, 110, 249, 0.5)";
              e.currentTarget.style.transform = "translateY(-1px)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.boxShadow =
                "0 0 15px rgba(131, 110, 249, 0.3)";
              e.currentTarget.style.transform = "translateY(0)";
            }}
          >
            Start Arena
          </button>
        )}
      </div>
    </div>
  );
}
