import { motion, AnimatePresence } from "framer-motion";
import { CardComponent } from "../poker-table/CardComponent";
import type { ArenaHandResultPayload } from "../../types/dashboard";

interface ArenaHandResultProps {
  result: ArenaHandResultPayload | null;
}

export function ArenaHandResult({ result }: ArenaHandResultProps) {
  if (!result) return null;

  const agentWon = result.winners.some((w) => w.playerId === "agent");
  const accentColor = agentWon ? "#34D399" : "#F87171";
  const glowColor = agentWon ? "rgba(52, 211, 153, 0.3)" : "rgba(248, 113, 113, 0.3)";

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.4 }}
        className="absolute inset-0 z-30 flex items-center justify-center"
        style={{
          background: "rgba(7, 5, 24, 0.75)",
          backdropFilter: "blur(8px)",
          borderRadius: "inherit",
        }}
      >
        <motion.div
          initial={{ scale: 0.85, y: 20 }}
          animate={{ scale: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 25, delay: 0.1 }}
          className="flex flex-col items-center gap-3 px-8 py-5 rounded-2xl max-w-md"
          style={{
            background: "rgba(15, 12, 46, 0.95)",
            border: `1px solid ${accentColor}40`,
            boxShadow: `0 0 40px ${glowColor}, 0 0 80px ${glowColor}`,
          }}
        >
          {/* Title */}
          <h3
            className="text-lg font-bold tracking-wide"
            style={{ color: accentColor }}
          >
            Hand #{result.handNumber} — {agentWon ? "Agent Wins!" : "Agent Lost"}
          </h3>

          {/* Winners */}
          {result.winners.map((w, i) => (
            <div key={i} className="flex items-center gap-3">
              <span className="text-sm font-semibold" style={{ color: "#F1F0FF" }}>
                {w.playerId}
              </span>
              <span className="text-sm font-bold" style={{ color: "#FBBF24" }}>
                +{w.amount.toLocaleString()}
              </span>
              <span className="text-xs" style={{ color: "#A78BFA" }}>
                {w.handDescription}
              </span>
            </div>
          ))}

          {/* Showdown hands */}
          {result.showdownPlayers.length > 0 && (
            <div className="flex flex-col gap-2 mt-1">
              {result.showdownPlayers.map((sp, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-xs min-w-[60px]" style={{ color: "#A5A0D6" }}>
                    {sp.playerId}
                  </span>
                  <div
                    className="flex gap-0.5"
                    style={{
                      transform: "scale(0.4)",
                      transformOrigin: "left center",
                      marginRight: -35,
                    }}
                  >
                    {sp.holeCards.map((card, ci) => (
                      <CardComponent key={ci} card={card} index={0} />
                    ))}
                  </div>
                  <span className="text-[10px]" style={{ color: "#A78BFA" }}>
                    {sp.handDescription}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Board */}
          {result.boardCards.length > 0 && (
            <div
              className="flex gap-1 mt-1"
              style={{
                transform: "scale(0.4)",
                transformOrigin: "center center",
                marginTop: -5,
                marginBottom: -20,
              }}
            >
              {result.boardCards.map((card, i) => (
                <CardComponent key={i} card={card} index={0} />
              ))}
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
