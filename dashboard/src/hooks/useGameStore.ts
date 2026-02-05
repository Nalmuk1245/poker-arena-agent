import { useContext } from "react";
import { GameContext } from "../store/GameProvider";

export function useGameStore() {
  const context = useContext(GameContext);
  if (!context) {
    throw new Error("useGameStore must be used within GameProvider");
  }
  return context;
}
