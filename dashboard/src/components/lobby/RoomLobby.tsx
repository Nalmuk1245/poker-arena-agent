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
          <h4
            className="text-sm font-bold"
            style={{ color: "var(--text-primary)" }}
          >
            {room.name}
          </h4>
          <span
            className="text-[10px] font-mono"
            style={{ color: "var(--text-muted)" }}
          >
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
        <div className="text-center">
          <div
            className="text-xs font-bold"
            style={{ color: "var(--monad-bright)" }}
          >
            {room.smallBlind}/{room.bigBlind}
          </div>
          <div
            className="text-[9px] uppercase"
            style={{ color: "var(--text-muted)" }}
          >
            Blinds
          </div>
        </div>
        <div className="text-center">
          <div
            className="text-xs font-bold"
            style={{ color: "var(--text-primary)" }}
          >
            {room.maxPlayers}
          </div>
          <div
            className="text-[9px] uppercase"
            style={{ color: "var(--text-muted)" }}
          >
            Players
          </div>
        </div>
        <div className="text-center">
          <div
            className="text-xs font-bold"
            style={{ color: "var(--text-primary)" }}
          >
            {room.startingStack}
          </div>
          <div
            className="text-[9px] uppercase"
            style={{ color: "var(--text-muted)" }}
          >
            Stack
          </div>
        </div>
        <div className="text-center">
          <div
            className="text-xs font-bold"
            style={{ color: "var(--text-primary)" }}
          >
            {room.maxHands}
          </div>
          <div
            className="text-[9px] uppercase"
            style={{ color: "var(--text-muted)" }}
          >
            Hands
          </div>
        </div>
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
              e.currentTarget.style.boxShadow =
                "0 0 20px rgba(131, 110, 249, 0.4)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.boxShadow =
                "0 0 10px rgba(131, 110, 249, 0.2)";
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

export function RoomLobby() {
  const { state, socket } = useGameStore();
  const [showCreateModal, setShowCreateModal] = useState(false);

  const handleCreate = (config: {
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

  return (
    <>
      <div className="glass-panel">
        <div
          className="px-4 py-3 flex items-center justify-between"
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
              e.currentTarget.style.boxShadow =
                "0 0 15px rgba(131, 110, 249, 0.4)";
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
              <div className="text-2xl mb-2" style={{ opacity: 0.3 }}>
                ~
              </div>
              No rooms yet. Create one to get started!
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

      <CreateRoomModal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreate={handleCreate}
      />
    </>
  );
}
