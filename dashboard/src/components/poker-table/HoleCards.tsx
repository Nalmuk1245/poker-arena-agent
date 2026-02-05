import { AnimatePresence } from "framer-motion";
import { CardComponent } from "./CardComponent";
import type { DashboardCard } from "../../types/dashboard";

interface HoleCardsProps {
  cards: DashboardCard[];
}

export function HoleCards({ cards }: HoleCardsProps) {
  if (cards.length === 0) return null;

  return (
    <div className="flex gap-2 justify-center">
      <AnimatePresence>
        {cards.map((card, i) => (
          <CardComponent key={`hole-${i}-${card.rank}${card.suit}`} card={card} index={i} />
        ))}
      </AnimatePresence>
    </div>
  );
}
