import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface CreateRoomModalProps {
  open: boolean;
  onClose: () => void;
  onCreate: (config: {
    name: string;
    smallBlind: number;
    bigBlind: number;
    maxPlayers: number;
    startingStack: number;
    maxHands: number;
  }) => void;
}

export function CreateRoomModal({ open, onClose, onCreate }: CreateRoomModalProps) {
  const [name, setName] = useState("");
  const [smallBlind, setSmallBlind] = useState(5);
  const [bigBlind, setBigBlind] = useState(10);
  const [maxPlayers, setMaxPlayers] = useState(6);
  const [startingStack, setStartingStack] = useState(1000);
  const [maxHands, setMaxHands] = useState(100);

  const handleCreate = () => {
    onCreate({
      name: name || `Room #${Date.now() % 1000}`,
      smallBlind,
      bigBlind,
      maxPlayers,
      startingStack,
      maxHands,
    });
    setName("");
    onClose();
  };

  const inputStyle: React.CSSProperties = {
    background: "rgba(15, 12, 46, 0.8)",
    border: "1px solid rgba(131, 110, 249, 0.2)",
    color: "var(--text-primary)",
    outline: "none",
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50"
          style={{
            background: "rgba(0, 0, 0, 0.6)",
            backdropFilter: "blur(4px)",
            overflowY: "auto",
          }}
          onClick={onClose}
        >
          <div
            style={{
              minHeight: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "24px 16px",
            }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="glass-panel w-full max-w-md"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div
                className="px-5 py-4 flex items-center justify-between"
                style={{ borderBottom: "1px solid var(--panel-border)" }}
              >
                <h3
                  className="text-sm font-bold"
                  style={{ color: "var(--text-primary)" }}
                >
                  Create Game Room
                </h3>
                <button
                  onClick={onClose}
                  className="w-7 h-7 flex items-center justify-center rounded-lg cursor-pointer transition-colors"
                  style={{ color: "var(--text-muted)" }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "rgba(131, 110, 249, 0.1)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "transparent";
                  }}
                >
                  x
                </button>
              </div>

              {/* Form */}
              <div className="p-5 space-y-3">
                {/* Room Name */}
                <label className="block">
                  <span
                    className="text-[10px] uppercase tracking-wider block mb-1"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Room Name
                  </span>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="My Poker Room"
                    className="w-full px-3 py-1.5 rounded-lg text-xs font-mono"
                    style={inputStyle}
                  />
                </label>

                {/* Blinds */}
                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span
                      className="text-[10px] uppercase tracking-wider block mb-1"
                      style={{ color: "var(--text-muted)" }}
                    >
                      Small Blind
                    </span>
                    <input
                      type="number"
                      value={smallBlind}
                      onChange={(e) => setSmallBlind(Number(e.target.value))}
                      className="w-full px-3 py-1.5 rounded-lg text-xs font-mono"
                      style={inputStyle}
                    />
                  </label>
                  <label className="block">
                    <span
                      className="text-[10px] uppercase tracking-wider block mb-1"
                      style={{ color: "var(--text-muted)" }}
                    >
                      Big Blind
                    </span>
                    <input
                      type="number"
                      value={bigBlind}
                      onChange={(e) => setBigBlind(Number(e.target.value))}
                      className="w-full px-3 py-1.5 rounded-lg text-xs font-mono"
                      style={inputStyle}
                    />
                  </label>
                </div>

                {/* Players & Stack */}
                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span
                      className="text-[10px] uppercase tracking-wider block mb-1"
                      style={{ color: "var(--text-muted)" }}
                    >
                      Max Players
                    </span>
                    <select
                      value={maxPlayers}
                      onChange={(e) => setMaxPlayers(Number(e.target.value))}
                      className="w-full px-3 py-1.5 rounded-lg text-xs font-mono"
                      style={inputStyle}
                    >
                      <option value={2}>2 Players</option>
                      <option value={3}>3 Players</option>
                      <option value={4}>4 Players</option>
                      <option value={5}>5 Players</option>
                      <option value={6}>6 Players</option>
                    </select>
                  </label>
                  <label className="block">
                    <span
                      className="text-[10px] uppercase tracking-wider block mb-1"
                      style={{ color: "var(--text-muted)" }}
                    >
                      Starting Stack
                    </span>
                    <input
                      type="number"
                      value={startingStack}
                      onChange={(e) => setStartingStack(Number(e.target.value))}
                      className="w-full px-3 py-1.5 rounded-lg text-xs font-mono"
                      style={inputStyle}
                    />
                  </label>
                </div>

                {/* Max Hands */}
                <label className="block">
                  <span
                    className="text-[10px] uppercase tracking-wider block mb-1"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Max Hands
                  </span>
                  <input
                    type="number"
                    value={maxHands}
                    onChange={(e) => setMaxHands(Number(e.target.value))}
                    className="w-full px-3 py-1.5 rounded-lg text-xs font-mono"
                    style={inputStyle}
                  />
                </label>

                {/* Create Button */}
                <button
                  onClick={handleCreate}
                  className="w-full py-2.5 rounded-lg text-xs font-bold uppercase tracking-widest cursor-pointer transition-all"
                  style={{
                    marginTop: "12px",
                    background: "linear-gradient(135deg, #836EF9 0%, #E84393 100%)",
                    color: "#fff",
                    border: "none",
                    boxShadow: "0 0 15px rgba(131, 110, 249, 0.3)",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.boxShadow =
                      "0 0 25px rgba(131, 110, 249, 0.5)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.boxShadow =
                      "0 0 15px rgba(131, 110, 249, 0.3)";
                  }}
                >
                  Create Room
                </button>
              </div>
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
