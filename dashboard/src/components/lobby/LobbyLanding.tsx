import { useState } from "react";
import { useGameStore } from "../../hooks/useGameStore";
import { CreateRoomModal } from "./CreateRoomModal";
import type { ArenaRoom } from "../../types/dashboard";

function RoomCard({
  room,
  onJoin,
  onDelete,
}: {
  room: ArenaRoom;
  onJoin: () => void;
  onDelete: () => void;
}) {
  const statusColors: Record<string, { bg: string; text: string; glow: string }> = {
    waiting: {
      bg: "rgba(251, 191, 36, 0.12)",
      text: "#FBBF24",
      glow: "0 0 8px rgba(251, 191, 36, 0.3)",
    },
    running: {
      bg: "rgba(52, 211, 153, 0.12)",
      text: "#34D399",
      glow: "0 0 8px rgba(52, 211, 153, 0.3)",
    },
    completed: {
      bg: "rgba(165, 160, 214, 0.12)",
      text: "var(--text-muted)",
      glow: "none",
    },
  };

  const sc = statusColors[room.status] || statusColors.waiting;

  return (
    <div
      className="rounded-xl p-4 transition-all"
      style={{
        background: "rgba(15, 12, 46, 0.5)",
        border: "1px solid rgba(131, 110, 249, 0.12)",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.border = "1px solid rgba(131, 110, 249, 0.3)";
        e.currentTarget.style.background = "rgba(15, 12, 46, 0.7)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.border = "1px solid rgba(131, 110, 249, 0.12)";
        e.currentTarget.style.background = "rgba(15, 12, 46, 0.5)";
      }}
    >
      <div className="flex items-start justify-between mb-3">
        <div>
          <h4 className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>
            {room.name}
          </h4>
          <span className="text-[10px] font-mono" style={{ color: "var(--text-muted)" }}>
            {room.id}
          </span>
        </div>
        <div
          className="flex items-center gap-1.5 px-2 py-0.5 rounded-full"
          style={{ background: sc.bg }}
        >
          <div
            className="w-1.5 h-1.5 rounded-full"
            style={{ background: sc.text, boxShadow: sc.glow }}
          />
          <span
            className="text-[10px] font-bold uppercase tracking-wider"
            style={{ color: sc.text }}
          >
            {room.status}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2 mb-3">
        {[
          { value: `${room.smallBlind}/${room.bigBlind}`, label: "Blinds", color: "var(--monad-bright)" },
          { value: room.maxPlayers, label: "Players", color: "var(--text-primary)" },
          { value: room.startingStack, label: "Stack", color: "var(--text-primary)" },
          { value: room.maxHands, label: "Hands", color: "var(--text-primary)" },
        ].map((stat) => (
          <div key={stat.label} className="text-center">
            <div className="text-xs font-bold" style={{ color: stat.color }}>
              {stat.value}
            </div>
            <div className="text-[9px] uppercase" style={{ color: "var(--text-muted)" }}>
              {stat.label}
            </div>
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        {room.status === "waiting" && (
          <button
            onClick={onJoin}
            className="flex-1 py-2 rounded-lg text-[11px] font-bold uppercase tracking-wider cursor-pointer transition-all"
            style={{
              background: "linear-gradient(135deg, #836EF9 0%, #E84393 100%)",
              color: "#fff",
              border: "none",
              boxShadow: "0 0 10px rgba(131, 110, 249, 0.2)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.boxShadow = "0 0 20px rgba(131, 110, 249, 0.4)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.boxShadow = "0 0 10px rgba(131, 110, 249, 0.2)";
            }}
          >
            Join & Start
          </button>
        )}
        <button
          onClick={onDelete}
          className="px-3 py-2 rounded-lg text-[11px] font-bold cursor-pointer transition-all"
          style={{
            background: "rgba(248, 113, 113, 0.1)",
            color: "#F87171",
            border: "1px solid rgba(248, 113, 113, 0.2)",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "rgba(248, 113, 113, 0.2)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "rgba(248, 113, 113, 0.1)";
          }}
        >
          Delete
        </button>
      </div>
    </div>
  );
}

export function LobbyLanding() {
  const { state, socket } = useGameStore();
  const [showCreateModal, setShowCreateModal] = useState(false);

  const [settings, setSettings] = useState({
    maxHands: 100,
    botCount: 5,
    smallBlind: 5,
    bigBlind: 10,
    startingStack: 1000,
    tableCount: 1,
  });

  const handleQuickStart = () => {
    if (!socket) return;
    socket.emit("arena:start", settings);
  };

  const handleCreateRoom = (config: {
    name: string;
    smallBlind: number;
    bigBlind: number;
    maxPlayers: number;
    startingStack: number;
    maxHands: number;
  }) => {
    if (!socket) return;
    socket.emit("room:create", config);
  };

  const handleJoin = (roomId: string) => {
    if (!socket) return;
    socket.emit("room:join", { roomId });
  };

  const handleDelete = (roomId: string) => {
    if (!socket) return;
    socket.emit("room:delete", { roomId });
  };

  const inputStyle: React.CSSProperties = {
    background: "rgba(15, 12, 46, 0.8)",
    border: "1px solid rgba(131, 110, 249, 0.2)",
    color: "var(--text-primary)",
    outline: "none",
  };

  return (
    <>
      <div className="flex flex-col items-center gap-8 sm:gap-10">
        {/* Hero */}
        <div className="text-center pt-6 sm:pt-10">
          <h2
            className="text-2xl sm:text-3xl font-bold tracking-tight mb-2"
            style={{ color: "#F1F0FF" }}
          >
            Poker Arena
          </h2>
          <p
            className="text-sm max-w-md mx-auto"
            style={{ color: "var(--text-muted)" }}
          >
            Create a room or quick-start a game. Bring your own AI agent or play against built-in bots.
          </p>
        </div>

        {/* Quick Start */}
        <div className="w-full max-w-2xl">

        {/* Quick Start Card */}
        <div
          className="glass-panel"
        >
          <div
            className="px-5 py-4 flex items-center justify-between"
            style={{ borderBottom: "1px solid var(--panel-border)" }}
          >
            <h3
              className="text-xs font-semibold uppercase tracking-widest"
              style={{ color: "var(--text-muted)" }}
            >
              Quick Start
            </h3>
            <span
              className="text-[10px] uppercase tracking-wider"
              style={{ color: "var(--text-muted)" }}
            >
              6-max Arena
            </span>
          </div>

          <div className="p-5 space-y-4">
            {/* Settings Grid */}
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
              {[
                { label: "Tables", value: settings.tableCount, key: "tableCount" as const, min: 1, max: 4 },
                { label: "Hands", value: settings.maxHands, key: "maxHands" as const, min: 10, max: 1000 },
                { label: "Bots", value: settings.botCount, key: "botCount" as const, min: 1, max: 5 },
                { label: "SB", value: settings.smallBlind, key: "smallBlind" as const, min: 1, max: 100 },
                { label: "BB", value: settings.bigBlind, key: "bigBlind" as const, min: 2, max: 200 },
                { label: "Stack", value: settings.startingStack, key: "startingStack" as const, min: 100, max: 10000 },
              ].map((field) => (
                <label key={field.key} className="block">
                  <span
                    className="text-[10px] uppercase tracking-wider block mb-1"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {field.label}
                  </span>
                  <input
                    type="number"
                    min={field.min}
                    max={field.max}
                    value={field.value}
                    onChange={(e) =>
                      setSettings((s) => ({
                        ...s,
                        [field.key]: Math.min(field.max, Math.max(field.min, Number(e.target.value))),
                      }))
                    }
                    className="w-full px-3 py-1.5 rounded-lg text-xs font-mono"
                    style={inputStyle}
                  />
                </label>
              ))}
            </div>

            {/* Start Button */}
            <button
              onClick={handleQuickStart}
              className="w-full py-3 rounded-xl text-sm font-bold uppercase tracking-widest cursor-pointer transition-all"
              style={{
                background: "linear-gradient(135deg, #836EF9 0%, #E84393 100%)",
                color: "#fff",
                border: "none",
                boxShadow: "0 0 20px rgba(131, 110, 249, 0.3)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.boxShadow = "0 0 35px rgba(131, 110, 249, 0.5)";
                e.currentTarget.style.transform = "translateY(-1px)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.boxShadow = "0 0 20px rgba(131, 110, 249, 0.3)";
                e.currentTarget.style.transform = "translateY(0)";
              }}
            >
              Start Game
            </button>
          </div>
        </div>

        </div>

        {/* Room List */}
        <div className="glass-panel w-full max-w-2xl">
          <div
            className="px-5 py-4 flex items-center justify-between"
            style={{ borderBottom: "1px solid var(--panel-border)" }}
          >
            <h3
              className="text-xs font-semibold uppercase tracking-widest"
              style={{ color: "var(--text-muted)" }}
            >
              Game Rooms
            </h3>
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-3 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider cursor-pointer transition-all"
              style={{
                background: "linear-gradient(135deg, #836EF9 0%, #E84393 100%)",
                color: "#fff",
                border: "none",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.boxShadow = "0 0 15px rgba(131, 110, 249, 0.4)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.boxShadow = "none";
              }}
            >
              + Create Room
            </button>
          </div>

          <div className="p-4">
            {state.rooms.length === 0 ? (
              <div
                className="text-center py-8 text-sm"
                style={{ color: "var(--text-muted)" }}
              >
                <div className="text-2xl mb-2" style={{ opacity: 0.3 }}>~</div>
                No rooms yet. Create one or use Quick Start above.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {state.rooms.map((room) => (
                  <RoomCard
                    key={room.id}
                    room={room}
                    onJoin={() => handleJoin(room.id)}
                    onDelete={() => handleDelete(room.id)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Leaderboard (visible in lobby too) */}
        {state.leaderboard.length > 0 && (
          <div className="w-full max-w-2xl">
            {/* Inline mini leaderboard */}
            <div className="glass-panel">
              <div
                className="px-5 py-3"
                style={{ borderBottom: "1px solid var(--panel-border)" }}
              >
                <h3
                  className="text-xs font-semibold uppercase tracking-widest"
                  style={{ color: "var(--text-muted)" }}
                >
                  Recent Leaderboard
                </h3>
              </div>
              <div className="p-4 overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr style={{ color: "var(--text-muted)" }}>
                      <th className="text-left py-1.5 font-semibold uppercase tracking-wider text-[10px]">#</th>
                      <th className="text-left py-1.5 font-semibold uppercase tracking-wider text-[10px]">Player</th>
                      <th className="text-right py-1.5 font-semibold uppercase tracking-wider text-[10px]">Win Rate</th>
                      <th className="text-right py-1.5 font-semibold uppercase tracking-wider text-[10px]">Profit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.leaderboard.slice(0, 5).map((entry, i) => (
                      <tr
                        key={entry.playerId}
                        style={{
                          borderTop: "1px solid rgba(131, 110, 249, 0.06)",
                        }}
                      >
                        <td className="py-1.5 font-mono" style={{ color: "var(--text-muted)" }}>
                          {i + 1}
                        </td>
                        <td className="py-1.5 font-bold" style={{ color: "var(--text-primary)" }}>
                          {entry.playerName}
                        </td>
                        <td className="py-1.5 text-right font-mono" style={{ color: "var(--monad-bright)" }}>
                          {(entry.winRate).toFixed(1)}%
                        </td>
                        <td
                          className="py-1.5 text-right font-mono"
                          style={{ color: entry.totalProfit >= 0 ? "#34D399" : "#F87171" }}
                        >
                          {entry.totalProfit >= 0 ? "+" : ""}{entry.totalProfit}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

      <CreateRoomModal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreate={handleCreateRoom}
      />
    </>
  );
}
