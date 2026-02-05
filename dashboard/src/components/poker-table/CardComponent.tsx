import { motion } from "framer-motion";
import type { DashboardCard } from "../../types/dashboard";

const SUIT_SYMBOLS: Record<string, string> = {
  h: "\u2665",
  d: "\u2666",
  c: "\u2663",
  s: "\u2660",
};

const SUIT_COLORS: Record<string, string> = {
  h: "#F472B6",
  d: "#F472B6",
  c: "#C4B5FD",
  s: "#C4B5FD",
};

const RANK_DISPLAY: Record<string, string> = {
  T: "10",
};

interface CardComponentProps {
  card: DashboardCard;
  index?: number;
  faceDown?: boolean;
}

export function CardComponent({ card, index = 0, faceDown = false }: CardComponentProps) {
  const suitSymbol = SUIT_SYMBOLS[card.suit] || card.suit;
  const suitColor = SUIT_COLORS[card.suit] || "#C4B5FD";
  const rankDisplay = RANK_DISPLAY[card.rank] || card.rank;

  return (
    <motion.div
      initial={{ x: 100, y: -100, rotateY: faceDown ? 0 : 180, opacity: 0 }}
      animate={{ x: 0, y: 0, rotateY: 0, opacity: 1 }}
      transition={{
        type: "spring",
        stiffness: 260,
        damping: 22,
        delay: index * 0.12,
      }}
      style={{ perspective: 800 }}
      className="relative"
    >
      {faceDown ? (
        <div
          className="w-[72px] h-[108px] rounded-lg flex items-center justify-center"
          style={{
            background: "linear-gradient(135deg, #1A1145 0%, #2E1F6E 50%, #1A1145 100%)",
            border: "1px solid rgba(131, 110, 249, 0.3)",
            boxShadow: "0 4px 16px rgba(0,0,0,0.4), inset 0 1px 0 rgba(131,110,249,0.1)",
          }}
        >
          <div
            className="w-14 h-24 rounded border flex items-center justify-center"
            style={{ borderColor: "rgba(131, 110, 249, 0.2)" }}
          >
            <span
              className="text-xl font-bold"
              style={{
                background: "linear-gradient(135deg, #836EF9, #E84393)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              M
            </span>
          </div>
        </div>
      ) : (
        <div
          className="w-[72px] h-[108px] rounded-lg flex flex-col items-center justify-between p-2"
          style={{
            background: "linear-gradient(180deg, #1C1740 0%, #0F0C2A 100%)",
            border: "1px solid rgba(131, 110, 249, 0.25)",
            boxShadow: "0 4px 16px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)",
            color: suitColor,
          }}
        >
          <div className="text-left w-full">
            <div className="text-base font-bold leading-none">{rankDisplay}</div>
            <div className="text-sm leading-none">{suitSymbol}</div>
          </div>
          <div className="text-3xl" style={{ textShadow: `0 0 12px ${suitColor}40` }}>
            {suitSymbol}
          </div>
          <div className="text-right w-full rotate-180">
            <div className="text-base font-bold leading-none">{rankDisplay}</div>
            <div className="text-sm leading-none">{suitSymbol}</div>
          </div>
        </div>
      )}
    </motion.div>
  );
}
