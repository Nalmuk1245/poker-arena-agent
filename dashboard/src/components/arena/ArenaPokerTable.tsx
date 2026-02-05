import { useGameStore } from "../../hooks/useGameStore";
import { CommunityCards } from "../poker-table/CommunityCards";
import { PhaseIndicator } from "../poker-table/PhaseIndicator";
import { ArenaPlayerSeat } from "./ArenaPlayerSeat";
import { ArenaHandResult } from "./ArenaHandResult";
import { motion, AnimatePresence } from "framer-motion";

/**
 * 6-max seat positions around the elliptical table.
 *
 *         [Seat 2]     [Seat 3]
 *    [Seat 1]               [Seat 4]
 *         [Seat 0=Agent]  [Seat 5]
 */
const SEAT_POSITIONS: { top: string; left: string }[] = [
  { top: "82%", left: "30%" },
  { top: "45%", left: "2%" },
  { top: "5%", left: "20%" },
  { top: "5%", left: "68%" },
  { top: "45%", left: "88%" },
  { top: "82%", left: "65%" },
];

export function ArenaPokerTable() {
  const { state } = useGameStore();
  const {
    arenaSeats,
    arenaCommunityCards,
    arenaPhase,
    arenaActivePlayerId,
    arenaPots,
    arenaHandNumber,
    arenaLastResult,
  } = state;

  const totalPot = arenaPots.reduce((sum, p) => sum + p.amount, 0)
    + arenaSeats.reduce((sum, s) => sum + s.betThisRound, 0);

  const showdownMap = new Map<string, { cards: { rank: string; suit: string }[]; hand: string }>();
  if (arenaLastResult && arenaLastResult.showdownPlayers) {
    for (const sp of arenaLastResult.showdownPlayers) {
      showdownMap.set(sp.playerId, { cards: sp.holeCards, hand: sp.handDescription });
    }
  }

  const isShowdown = arenaPhase === "SHOWDOWN" || arenaPhase === "COMPLETE" || !!arenaLastResult;

  return (
    <div className="glass-panel p-5 glow-purple">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h3
            className="text-sm font-semibold uppercase tracking-wider"
            style={{ color: "var(--text-muted)" }}
          >
            Arena Table
          </h3>
          {arenaHandNumber > 0 && (
            <span
              className="text-[10px] px-2 py-0.5 rounded-full font-medium"
              style={{
                background: "rgba(131, 110, 249, 0.15)",
                border: "1px solid rgba(131, 110, 249, 0.25)",
                color: "#A78BFA",
              }}
            >
              Hand #{arenaHandNumber}
            </span>
          )}
        </div>
        <PhaseIndicator currentPhase={arenaPhase} />
      </div>

      {/* Table felt */}
      <div
        className="relative rounded-[50%/40%] mx-auto arena-table-felt"
        style={{
          background: "radial-gradient(ellipse at center, #2E1F6E 0%, #1A1145 40%, #0D0A2A 100%)",
          border: "2px solid rgba(131, 110, 249, 0.15)",
          boxShadow:
            "inset 0 0 100px rgba(0,0,0,0.5), 0 0 60px rgba(131, 110, 249, 0.06)",
          minHeight: 480,
          padding: "40px 20px",
        }}
      >
        {/* Inner ring with subtle glow */}
        <div
          className="absolute inset-6 rounded-[50%/40%] pointer-events-none"
          style={{
            border: "1px solid rgba(131, 110, 249, 0.06)",
            boxShadow: "inset 0 0 40px rgba(131, 110, 249, 0.03)",
          }}
        />

        {/* Community cards & pot - center */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-2">
          <CommunityCards cards={arenaCommunityCards} />

          {totalPot > 0 && (
            <AnimatePresence>
              <motion.div
                key={totalPot}
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-full"
                style={{
                  background: "rgba(131, 110, 249, 0.15)",
                  border: "1px solid rgba(131, 110, 249, 0.3)",
                  boxShadow: "0 0 20px rgba(131, 110, 249, 0.1)",
                }}
              >
                <span className="text-sm" style={{ color: "#FBBF24" }}>$</span>
                <span className="font-bold text-sm" style={{ color: "#F1F0FF" }}>
                  {totalPot.toLocaleString()}
                </span>
                {arenaPots.length > 1 && (
                  <span className="text-[9px] ml-1" style={{ color: "#A78BFA" }}>
                    ({arenaPots.length} pots)
                  </span>
                )}
              </motion.div>
            </AnimatePresence>
          )}
        </div>

        {/* Player seats */}
        {SEAT_POSITIONS.map((pos, i) => {
          const seat = arenaSeats[i];
          if (!seat) return null;

          const sdInfo = showdownMap.get(seat.playerId || "");

          return (
            <div
              key={i}
              className="absolute -translate-x-1/2 -translate-y-1/2"
              style={{ top: pos.top, left: pos.left }}
            >
              <ArenaPlayerSeat
                seat={seat}
                isActive={seat.playerId === arenaActivePlayerId}
                isShowdown={isShowdown}
                showdownCards={sdInfo?.cards}
                showdownHand={sdInfo?.hand}
              />
            </div>
          );
        })}

        {/* Hand result overlay */}
        <ArenaHandResult result={arenaLastResult} />
      </div>
    </div>
  );
}
