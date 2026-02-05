import { motion } from "framer-motion";
import { CardComponent } from "../poker-table/CardComponent";
import type { ArenaSeatInfo } from "../../types/dashboard";

interface ArenaPlayerSeatProps {
  seat: ArenaSeatInfo;
  isActive: boolean;
  isShowdown: boolean;
  showdownCards?: { rank: string; suit: string }[];
  showdownHand?: string;
}

const POSITION_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  BTN: { bg: "rgba(251, 191, 36, 0.15)", border: "rgba(251, 191, 36, 0.4)", text: "#FBBF24" },
  SB: { bg: "rgba(131, 110, 249, 0.15)", border: "rgba(131, 110, 249, 0.4)", text: "#A78BFA" },
  BB: { bg: "rgba(168, 85, 247, 0.15)", border: "rgba(168, 85, 247, 0.4)", text: "#C084FC" },
  UTG: { bg: "rgba(232, 67, 147, 0.15)", border: "rgba(232, 67, 147, 0.4)", text: "#F472B6" },
  UTG1: { bg: "rgba(232, 67, 147, 0.15)", border: "rgba(232, 67, 147, 0.4)", text: "#F472B6" },
  CO: { bg: "rgba(52, 211, 153, 0.15)", border: "rgba(52, 211, 153, 0.4)", text: "#34D399" },
};

export function ArenaPlayerSeat({
  seat,
  isActive,
  isShowdown,
  showdownCards,
  showdownHand,
}: ArenaPlayerSeatProps) {
  if (!seat.playerId) {
    return (
      <div className="flex flex-col items-center gap-1 px-4 py-2 rounded-xl opacity-20">
        <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
          Empty
        </span>
      </div>
    );
  }

  const isFolded = seat.status === "FOLDED";
  const isAllIn = seat.status === "ALL_IN";
  const isSittingOut = seat.status === "SITTING_OUT";
  const isAgent = seat.playerId === "agent";
  const posColor = seat.position ? POSITION_COLORS[seat.position] : null;

  const cardsToShow = isShowdown && showdownCards ? showdownCards : seat.holeCards;
  const showFaceUp = isAgent || (isShowdown && showdownCards);

  return (
    <motion.div
      className="flex flex-col items-center gap-0.5 relative"
      animate={{
        opacity: isFolded || isSittingOut ? 0.3 : 1,
        filter: isFolded ? "grayscale(0.7) brightness(0.6)" : "none",
      }}
      transition={{ duration: 0.4 }}
    >
      {/* Active turn glow ring */}
      {isActive && (
        <motion.div
          className="absolute -inset-3 rounded-2xl"
          animate={{ opacity: [0.3, 0.7, 0.3] }}
          transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
          style={{
            background: "radial-gradient(ellipse, rgba(131,110,249,0.3) 0%, transparent 70%)",
            zIndex: 0,
          }}
        />
      )}

      {/* Hole cards */}
      <div
        className="flex gap-0.5 mb-0.5 relative z-10"
        style={{
          transform: "scale(0.5)",
          transformOrigin: "center bottom",
          marginTop: -22,
          marginBottom: -8,
        }}
      >
        {cardsToShow && cardsToShow.length > 0 ? (
          cardsToShow.map((card, i) => (
            <CardComponent
              key={`${seat.index}-${i}-${card.rank}${card.suit}`}
              card={card}
              index={0}
              faceDown={!showFaceUp}
            />
          ))
        ) : seat.status === "ACTIVE" || isAllIn ? (
          <>
            <CardComponent card={{ rank: "?", suit: "s" }} index={0} faceDown />
            <CardComponent card={{ rank: "?", suit: "s" }} index={0} faceDown />
          </>
        ) : null}
      </div>

      {/* Player info box */}
      <div
        className="flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl relative z-10 transition-all duration-300"
        style={{
          background: isAgent
            ? "rgba(131, 110, 249, 0.2)"
            : "rgba(15, 12, 46, 0.85)",
          border: isAllIn
            ? "1px solid rgba(251, 191, 36, 0.5)"
            : isActive
            ? "1px solid rgba(131, 110, 249, 0.5)"
            : `1px solid ${isAgent ? "rgba(131, 110, 249, 0.3)" : "rgba(131, 110, 249, 0.1)"}`,
          backdropFilter: "blur(12px)",
          boxShadow: isAllIn
            ? "0 0 20px rgba(251, 191, 36, 0.2)"
            : isActive
            ? "0 0 20px rgba(131, 110, 249, 0.25)"
            : "0 4px 16px rgba(0,0,0,0.3)",
          minWidth: 80,
        }}
      >
        {/* Name + Position */}
        <div className="flex items-center gap-1">
          {seat.isDealer && (
            <span
              className="w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold"
              style={{
                background: "rgba(251, 191, 36, 0.2)",
                border: "1px solid rgba(251, 191, 36, 0.5)",
                color: "#FBBF24",
              }}
            >
              D
            </span>
          )}
          <span
            className="text-[10px] font-semibold truncate max-w-[70px]"
            style={{ color: isAgent ? "#F1F0FF" : "#A5A0D6" }}
          >
            {seat.playerName || seat.playerId}
          </span>
          {seat.position && posColor && (
            <span
              className="text-[8px] font-bold px-1 rounded"
              style={{
                background: posColor.bg,
                border: `1px solid ${posColor.border}`,
                color: posColor.text,
              }}
            >
              {seat.position}
            </span>
          )}
        </div>

        {/* Stack */}
        <span
          className="text-xs font-bold"
          style={{ color: isAgent ? "#A78BFA" : "#836EF9" }}
        >
          {seat.stack.toLocaleString()}
        </span>

        {/* ALL-IN badge */}
        {isAllIn && (
          <span
            className="text-[8px] font-bold px-1.5 rounded"
            style={{
              background: "rgba(251, 191, 36, 0.15)",
              border: "1px solid rgba(251, 191, 36, 0.4)",
              color: "#FBBF24",
            }}
          >
            ALL IN
          </span>
        )}

        {/* Showdown hand description */}
        {isShowdown && showdownHand && (
          <span
            className="text-[8px] font-medium"
            style={{ color: "#A78BFA" }}
          >
            {showdownHand}
          </span>
        )}
      </div>

      {/* Bet chip */}
      {seat.betThisRound > 0 && (
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 300, damping: 20 }}
          className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full mt-0.5"
          style={{
            background: "rgba(131, 110, 249, 0.15)",
            border: "1px solid rgba(131, 110, 249, 0.25)",
            fontSize: 10,
          }}
        >
          <span style={{ color: "#FBBF24" }}>$</span>
          <span className="font-bold" style={{ color: "#F1F0FF" }}>
            {seat.betThisRound}
          </span>
        </motion.div>
      )}
    </motion.div>
  );
}
