import { motion, AnimatePresence } from "framer-motion";

interface PotDisplayProps {
  pot: number;
}

export function PotDisplay({ pot }: PotDisplayProps) {
  if (pot <= 0) return null;

  return (
    <AnimatePresence>
      <motion.div
        key={pot}
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="flex items-center gap-2 px-5 py-2 rounded-full"
        style={{
          background: "rgba(131, 110, 249, 0.15)",
          border: "1px solid rgba(131, 110, 249, 0.3)",
          boxShadow: "0 0 20px rgba(131, 110, 249, 0.1)",
        }}
      >
        <span className="text-base" style={{ color: "#FBBF24" }}>$</span>
        <span className="font-bold text-lg" style={{ color: "#F1F0FF" }}>
          {pot.toLocaleString()}
        </span>
      </motion.div>
    </AnimatePresence>
  );
}
