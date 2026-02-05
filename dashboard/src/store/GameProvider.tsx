import React, { createContext, useReducer, useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import { DashboardEvents } from "../types/dashboard";
import { GameState, GameAction, gameReducer, initialState } from "./gameStore";

interface GameContextValue {
  state: GameState;
  dispatch: React.Dispatch<GameAction>;
  socket: Socket | null;
}

export const GameContext = createContext<GameContextValue | null>(null);

export function GameProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(gameReducer, initialState);
  const [socketState, setSocketState] = useState<Socket | null>(null);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    const socket = io("/", {
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionDelay: 1000,
    });

    socketRef.current = socket;
    setSocketState(socket);

    socket.on("connect", () => {
      dispatch({ type: "SET_CONNECTED", payload: true });
    });

    socket.on("disconnect", () => {
      dispatch({ type: "SET_CONNECTED", payload: false });
    });

    // Initial state
    socket.on(DashboardEvents.INITIAL_STATE, (data) => {
      dispatch({ type: "INITIAL_STATE", payload: data });
    });

    // Game lifecycle
    socket.on(DashboardEvents.GAME_CREATED, (data) => {
      dispatch({ type: "GAME_CREATED", payload: data });
    });

    socket.on(DashboardEvents.GAME_JOINED, (data) => {
      dispatch({ type: "GAME_JOINED", payload: data });
    });

    socket.on(DashboardEvents.GAME_RESULT, (data) => {
      dispatch({ type: "GAME_RESULT", payload: data });
    });

    // Game phases & cards
    socket.on(DashboardEvents.PHASE_CHANGE, (data) => {
      dispatch({ type: "PHASE_CHANGE", payload: data });
    });

    socket.on(DashboardEvents.HOLE_CARDS, (data) => {
      dispatch({ type: "HOLE_CARDS", payload: data });
    });

    socket.on(DashboardEvents.COMMUNITY_CARDS, (data) => {
      dispatch({ type: "COMMUNITY_CARDS", payload: data });
    });

    socket.on(DashboardEvents.HAND_STRENGTH, (data) => {
      dispatch({ type: "HAND_STRENGTH", payload: data });
    });

    socket.on(DashboardEvents.VIRTUAL_CHIPS, (data) => {
      dispatch({ type: "VIRTUAL_CHIPS", payload: data });
    });

    socket.on(DashboardEvents.BOT_MATCH, (data) => {
      dispatch({ type: "BOT_MATCH", payload: data });
    });

    socket.on(DashboardEvents.SHOWDOWN, (data) => {
      dispatch({ type: "SHOWDOWN", payload: data });
    });

    // Stats
    socket.on(DashboardEvents.STATS_AGENT_UPDATE, (data) => {
      dispatch({ type: "AGENT_STATS", payload: data });
    });

    socket.on(DashboardEvents.STATS_BOT_UPDATE, (data) => {
      dispatch({ type: "BOT_STATS", payload: data });
    });

    // Arena events
    socket.on(DashboardEvents.ARENA_TABLE_STATE, (data) => {
      dispatch({ type: "ARENA_TABLE_STATE", payload: data });
    });

    socket.on(DashboardEvents.ARENA_HAND_RESULT, (data) => {
      dispatch({ type: "ARENA_HAND_RESULT", payload: data });
      // Auto-clear result after 3 seconds
      setTimeout(() => {
        dispatch({ type: "ARENA_CLEAR_RESULT" });
      }, 3000);
    });

    // Arena control
    socket.on("arena:status", (data) => {
      dispatch({ type: "ARENA_STATUS", payload: data });
    });

    // Rooms
    socket.on("room:list", (data) => {
      dispatch({ type: "SET_ROOMS", payload: data });
    });

    // Leaderboard
    socket.on("leaderboard:update", (data) => {
      dispatch({ type: "SET_LEADERBOARD", payload: data });
    });

    // Settlement events
    socket.on(DashboardEvents.SETTLEMENT_PROGRESS, (data) => {
      dispatch({ type: "SETTLEMENT_PROGRESS", payload: data });
    });

    socket.on(DashboardEvents.SETTLEMENT_COMPLETE, (data) => {
      dispatch({ type: "SETTLEMENT_COMPLETE", payload: data });
      setTimeout(() => dispatch({ type: "SETTLEMENT_FLASH_CLEAR" }), 2000);
    });

    socket.on(DashboardEvents.SETTLEMENT_ERROR, (data) => {
      dispatch({ type: "SETTLEMENT_ERROR", payload: data });
    });

    // Agent intent
    socket.on(DashboardEvents.AGENT_INTENT, (data) => {
      dispatch({ type: "AGENT_INTENT", payload: data });
    });

    // Wallet info
    socket.on(DashboardEvents.WALLET_INFO, (data) => {
      dispatch({ type: "WALLET_INFO", payload: data });
    });

    // Log entries
    socket.on("log", (entry) => {
      dispatch({ type: "ADD_LOG", payload: entry });
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  return (
    <GameContext.Provider value={{ state, dispatch, socket: socketState }}>
      {children}
    </GameContext.Provider>
  );
}
