import express, { Request, Response } from "express";
import http from "http";
import cors from "cors";
import { ethers } from "ethers";
import { Server as SocketIOServer } from "socket.io";
import { DashboardEvents } from "../types/dashboard";
import type { WalletAuthPayload, WalletAuthResponse } from "../types/dashboard";
import { DashboardEventEmitter } from "./DashboardEventEmitter";
import { ExternalAgentRegistry } from "../arena/ExternalAgentRegistry";
import { PlayerAction } from "../types/game";
import { config } from "../config";
import logger from "../utils/logger";
import * as path from "path";
import * as fs from "fs";

interface ArenaControl {
  start: (cfg: any) => Promise<{ status?: string; error?: string }>;
  stop: () => void;
  getStatus: () => any;
  getLeaderboard: (sortBy?: string) => any[];
}

interface ArenaRoom {
  id: string;
  name: string;
  smallBlind: number;
  bigBlind: number;
  maxPlayers: number;
  startingStack: number;
  maxHands: number;
  status: "waiting" | "running" | "completed";
  playerCount: number;
  createdAt: number;
}

/**
 * HTTP API server for the Poker Arena platform.
 * Serves the dashboard via Socket.IO and provides REST endpoints
 * for external AI agents to register and play via the arena system.
 */
export class GameAPI {
  private app: express.Application;
  private httpServer!: http.Server;
  private io!: SocketIOServer;
  private arenaControl: ArenaControl | null = null;
  private rooms: ArenaRoom[] = [];
  private roomCounter = 0;
  private externalRegistry: ExternalAgentRegistry;
  private walletAuthHandler: ((address: string) => void) | null = null;
  private authenticatedWallet: string | null = null;

  constructor(externalRegistry?: ExternalAgentRegistry) {
    this.app = express();
    this.app.use(express.json());
    this.app.use(cors({
      origin: ["http://localhost:5173", "http://localhost:5174", "http://localhost:5175", "http://localhost:3000"],
      credentials: true,
    }));
    this.externalRegistry = externalRegistry || new ExternalAgentRegistry();
    this.setupRoutes();
    this.setupDashboardRoutes();
    this.setupExternalAgentRoutes();
  }

  getExternalRegistry(): ExternalAgentRegistry {
    return this.externalRegistry;
  }

  private setupRoutes(): void {
    // Health check
    this.app.get("/api/health", (_req: Request, res: Response) => {
      res.json({ status: "ok" });
    });

    // API documentation
    this.app.get("/api", (_req: Request, res: Response) => {
      res.json({
        name: "Poker Arena API",
        description: "Platform API for AI agents to play poker via the arena system",
        endpoints: [
          { method: "GET", path: "/api/health", description: "Health check" },
          { method: "GET", path: "/api/arena/status", description: "Arena status" },
          { method: "POST", path: "/api/arena/start", description: "Start arena session" },
          { method: "POST", path: "/api/arena/stop", description: "Stop arena session" },
          { method: "GET", path: "/api/leaderboard", description: "Leaderboard" },
          { method: "GET", path: "/api/rooms", description: "List rooms" },
          { method: "POST", path: "/api/rooms", description: "Create a room" },
          {
            method: "POST", path: "/api/agents/register",
            body: { agentName: "string", mode: "callback|polling", callbackUrl: "string (for callback mode)" },
            description: "Register an external AI agent",
          },
          { method: "GET", path: "/api/agents", description: "List registered agents" },
          { method: "GET", path: "/api/agents/:agentId/turn", description: "Poll for turn (polling mode)" },
          {
            method: "POST", path: "/api/agents/:agentId/action",
            body: { action: "FOLD|CHECK|CALL|RAISE|ALL_IN", amount: "number", reasoning: "string" },
            description: "Submit action (polling mode)",
          },
          { method: "GET", path: "/api/dashboard/stats", description: "Agent statistics" },
          { method: "GET", path: "/api/dashboard/bots", description: "Bot pool statistics" },
          { method: "GET", path: "/api/dashboard/history", description: "Win rate chart data" },
          { method: "GET", path: "/api/dashboard/log", description: "Recent action log" },
        ],
        chain: `Monad Testnet (${config.chainId})`,
      });
    });
  }

  /**
   * Set arena control callbacks for dashboard commands.
   */
  setArenaControl(ctrl: ArenaControl): void {
    this.arenaControl = ctrl;
  }

  /**
   * Set wallet auth handler for registering user wallets.
   */
  setWalletAuthHandler(handler: (address: string) => void): void {
    this.walletAuthHandler = handler;
  }

  getAuthenticatedWallet(): string | null {
    return this.authenticatedWallet;
  }

  /**
   * Emit arena status to all connected clients.
   */
  emitArenaStatus(): void {
    if (this.arenaControl && this.io) {
      this.io.emit("arena:status", this.arenaControl.getStatus());
    }
  }

  /**
   * Emit room list to all connected clients.
   */
  private emitRoomList(): void {
    if (this.io) {
      this.io.emit("room:list", this.rooms);
    }
  }

  private setupDashboardRoutes(): void {
    const emitter = DashboardEventEmitter.getInstance();

    this.app.get("/api/dashboard/stats", (_req: Request, res: Response) => {
      const stats = emitter.getLatestAgentStats();
      res.json(stats || { error: "No stats available yet" });
    });

    this.app.get("/api/dashboard/bots", (_req: Request, res: Response) => {
      const bots = emitter.getLatestBotStats();
      res.json(bots || { bots: [], timestamp: Date.now() });
    });

    this.app.get("/api/dashboard/history", (_req: Request, res: Response) => {
      res.json(emitter.getWinHistory());
    });

    this.app.get("/api/dashboard/log", (_req: Request, res: Response) => {
      res.json(emitter.getRecentLog());
    });

    // Arena control REST endpoints
    this.app.get("/api/arena/status", (_req: Request, res: Response) => {
      if (!this.arenaControl) {
        res.json({ running: false, error: "Arena not configured" });
        return;
      }
      res.json(this.arenaControl.getStatus());
    });

    this.app.post("/api/arena/start", async (req: Request, res: Response) => {
      if (!this.arenaControl) {
        res.status(400).json({ error: "Arena not configured" });
        return;
      }
      const result = await this.arenaControl.start(req.body);
      this.emitArenaStatus();
      res.json(result);
    });

    this.app.post("/api/arena/stop", (_req: Request, res: Response) => {
      if (!this.arenaControl) {
        res.status(400).json({ error: "Arena not configured" });
        return;
      }
      this.arenaControl.stop();
      this.emitArenaStatus();
      res.json({ status: "stopping" });
    });

    // Room REST endpoints
    this.app.get("/api/rooms", (_req: Request, res: Response) => {
      res.json(this.rooms);
    });

    this.app.post("/api/rooms", (req: Request, res: Response) => {
      const { name, smallBlind, bigBlind, maxPlayers, startingStack, maxHands } = req.body;
      const room: ArenaRoom = {
        id: `room-${++this.roomCounter}`,
        name: name || `Room #${this.roomCounter}`,
        smallBlind: smallBlind ?? 5,
        bigBlind: bigBlind ?? 10,
        maxPlayers: Math.min(maxPlayers ?? 6, 6),
        startingStack: startingStack ?? 1000,
        maxHands: maxHands ?? 100,
        status: "waiting",
        playerCount: 0,
        createdAt: Date.now(),
      };
      this.rooms.push(room);
      this.emitRoomList();
      res.json(room);
    });

    this.app.post("/api/rooms/:roomId/join", async (req: Request, res: Response) => {
      const room = this.rooms.find(r => r.id === req.params.roomId);
      if (!room) {
        res.status(404).json({ error: "Room not found" });
        return;
      }
      if (room.status === "running") {
        res.status(400).json({ error: "Room already running" });
        return;
      }
      if (!this.arenaControl) {
        res.status(400).json({ error: "Arena not configured" });
        return;
      }
      room.status = "running";
      room.playerCount = room.maxPlayers;
      this.emitRoomList();
      const result = await this.arenaControl.start({
        botCount: room.maxPlayers - 1,
        maxHands: room.maxHands,
        smallBlind: room.smallBlind,
        bigBlind: room.bigBlind,
        startingStack: room.startingStack,
      });
      if (result.error) {
        room.status = "waiting";
        this.emitRoomList();
      }
      res.json(result);
    });

    this.app.delete("/api/rooms/:roomId", (req: Request, res: Response) => {
      const idx = this.rooms.findIndex(r => r.id === req.params.roomId);
      if (idx === -1) {
        res.status(404).json({ error: "Room not found" });
        return;
      }
      this.rooms.splice(idx, 1);
      this.emitRoomList();
      res.json({ status: "deleted" });
    });

    // Leaderboard REST endpoint
    this.app.get("/api/leaderboard", (_req: Request, res: Response) => {
      if (!this.arenaControl) {
        res.json([]);
        return;
      }
      const sortBy = (_req.query.sortBy as string) || "winRate";
      res.json(this.arenaControl.getLeaderboard(sortBy));
    });

    // Serve dashboard static files in production
    if (config.dashboard.serveStatic) {
      const distPath = path.resolve(__dirname, "../../../dashboard/dist");
      if (fs.existsSync(distPath)) {
        this.app.use(express.static(distPath));
        this.app.get("*", (_req: Request, res: Response) => {
          res.sendFile(path.join(distPath, "index.html"));
        });
        logger.info(`Serving dashboard static files from ${distPath}`);
      }
    }
  }

  // ============ External Agent Platform Routes ============

  private setupExternalAgentRoutes(): void {
    const registry = this.externalRegistry;

    // Register a new external agent
    this.app.post("/api/agents/register", (req: Request, res: Response) => {
      try {
        const { agentName, callbackUrl, mode, metadata, walletAddress } = req.body;
        if (!agentName || typeof agentName !== "string") {
          res.status(400).json({ error: "agentName is required" });
          return;
        }
        const agent = registry.registerAgent(agentName, callbackUrl, mode, metadata, walletAddress);
        res.json({
          agentId: agent.agentId,
          agentName: agent.agentName,
          mode: agent.mode,
          status: agent.status,
          message: "Agent registered. Use agentId for all subsequent requests.",
        });
      } catch (err: any) {
        res.status(400).json({ error: err.message });
      }
    });

    // List all registered agents
    this.app.get("/api/agents", (_req: Request, res: Response) => {
      const agents = registry.listAgents().map((a) => ({
        agentId: a.agentId,
        agentName: a.agentName,
        mode: a.mode,
        status: a.status,
        playerId: a.playerId,
        tableId: a.tableId,
        registeredAt: a.registeredAt,
        lastSeen: a.lastSeen,
        avgLatency: a.avgLatency,
      }));
      res.json(agents);
    });

    // Get agent status
    this.app.get("/api/agents/:agentId/status", (req: Request, res: Response) => {
      const agent = registry.getAgent(req.params.agentId);
      if (!agent) {
        res.status(404).json({ error: "Agent not found" });
        return;
      }
      res.json({
        agentId: agent.agentId,
        agentName: agent.agentName,
        mode: agent.mode,
        status: agent.status,
        playerId: agent.playerId,
        tableId: agent.tableId,
        registeredAt: agent.registeredAt,
        lastSeen: agent.lastSeen,
        metadata: agent.metadata,
      });
    });

    // Poll for current turn (polling mode)
    this.app.get("/api/agents/:agentId/turn", (req: Request, res: Response) => {
      const agent = registry.getAgent(req.params.agentId);
      if (!agent) {
        res.status(404).json({ error: "Agent not found" });
        return;
      }

      const pending = registry.getPendingTurn(agent.agentId);
      if (pending) {
        res.json({
          hasTurn: true,
          playerView: pending.playerView,
          timeoutMs: config.externalAgents.actionTimeoutMs,
          turnStartedAt: pending.createdAt,
          remainingMs: Math.max(0, config.externalAgents.actionTimeoutMs - (Date.now() - pending.createdAt)),
        });
      } else {
        res.json({
          hasTurn: false,
          status: agent.status,
          playerId: agent.playerId,
          tableId: agent.tableId,
        });
      }
    });

    // Submit action (polling mode)
    this.app.post("/api/agents/:agentId/action", (req: Request, res: Response) => {
      const agent = registry.getAgent(req.params.agentId);
      if (!agent) {
        res.status(404).json({ error: "Agent not found" });
        return;
      }

      const { action, amount, reasoning } = req.body;
      if (!action) {
        res.status(400).json({ error: "action is required" });
        return;
      }

      const pending = registry.getPendingTurn(agent.agentId);
      if (!pending) {
        res.status(404).json({ error: "No pending turn for this agent" });
        return;
      }

      const accepted = registry.submitAction(
        agent.agentId,
        action,
        amount ?? 0,
        reasoning
      );

      if (accepted) {
        res.json({ accepted: true, action, amount: amount ?? 0 });
      } else {
        res.status(408).json({ error: "Turn timed out or already submitted" });
      }
    });

    // Test agent callback with mock PlayerView
    this.app.post("/api/agents/:agentId/test", async (req: Request, res: Response) => {
      const agent = registry.getAgent(req.params.agentId);
      if (!agent) {
        res.status(404).json({ error: "Agent not found" });
        return;
      }

      if (agent.mode === "internal") {
        res.status(400).json({ error: "Cannot test internal agents via HTTP" });
        return;
      }

      if (agent.mode === "polling") {
        res.json({
          success: false,
          error: "Polling agents must be tested via GET /turn + POST /action flow",
          hint: "Use callback mode for automated testing",
        });
        return;
      }

      if (!agent.callbackUrl) {
        res.status(400).json({ error: "Agent has no callback URL" });
        return;
      }

      const phase = req.body?.phase || "FLOP";
      const mockView = this.generateMockPlayerView(agent.agentId, phase);

      const startMs = Date.now();
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 15000);

        const response = await fetch(agent.callbackUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "action_request",
            agentId: agent.agentId,
            tableId: "test-table",
            handNumber: 999,
            playerView: mockView,
            timeoutMs: 15000,
          }),
          signal: controller.signal,
        });

        clearTimeout(timer);
        const latencyMs = Date.now() - startMs;

        if (!response.ok) {
          res.json({
            success: false,
            latencyMs,
            error: `HTTP ${response.status}: ${response.statusText}`,
            validationErrors: [],
          });
          return;
        }

        const body = await response.json() as Record<string, any>;
        const validationErrors = this.validateDecisionResponse(body);

        res.json({
          success: validationErrors.length === 0,
          latencyMs,
          response: body,
          validationErrors,
        });
      } catch (err: any) {
        const latencyMs = Date.now() - startMs;
        res.json({
          success: false,
          latencyMs,
          error: err?.name === "AbortError" ? "Request timed out (15s)" : err?.message,
          validationErrors: [],
        });
      }
    });

    // Get agent latency stats
    this.app.get("/api/agents/:agentId/latency", (req: Request, res: Response) => {
      const agent = registry.getAgent(req.params.agentId);
      if (!agent) {
        res.status(404).json({ error: "Agent not found" });
        return;
      }

      const history = agent.latencyHistory;
      const lastLatency = history.length > 0 ? history[history.length - 1] : 0;

      // Calculate stability (stddev)
      let stability = "unknown";
      if (history.length >= 3) {
        const mean = agent.avgLatency;
        const variance = history.reduce((sum, v) => sum + (v - mean) ** 2, 0) / history.length;
        const stddev = Math.sqrt(variance);
        stability = stddev < 50 ? "stable" : "variable";
      }

      res.json({
        agentId: agent.agentId,
        avgLatency: agent.avgLatency,
        lastLatency,
        latencyHistory: history.slice(-20),
        stability,
        sampleCount: history.length,
      });
    });

    // Unregister agent
    this.app.delete("/api/agents/:agentId", (req: Request, res: Response) => {
      const removed = registry.unregisterAgent(req.params.agentId);
      if (removed) {
        res.json({ status: "unregistered" });
      } else {
        res.status(404).json({ error: "Agent not found" });
      }
    });

    logger.info("[API] External agent routes registered at /api/agents/*");
  }

  /**
   * Set up Socket.IO server and bridge DashboardEventEmitter events to clients.
   */
  private setupSocketIO(): void {
    const emitter = DashboardEventEmitter.getInstance();

    // All dashboard event names to forward
    const eventNames: string[] = Object.values(DashboardEvents);

    // Forward each event from the emitter to all Socket.IO clients
    for (const eventName of eventNames) {
      emitter.on(eventName, (payload: any) => {
        this.io.emit(eventName, payload);
      });
    }

    // Forward log entries
    emitter.on("log", (entry: any) => {
      this.io.emit("log", entry);
    });

    // Forward leaderboard updates
    emitter.on("leaderboard:update", (data: any) => {
      this.io.emit("leaderboard:update", data);
    });

    // Handle new client connections
    this.io.on("connection", (socket) => {
      logger.info(`Dashboard client connected: ${socket.id}`);

      // Send initial state
      socket.emit(DashboardEvents.INITIAL_STATE, emitter.getInitialState());

      // Send arena status
      if (this.arenaControl) {
        socket.emit("arena:status", this.arenaControl.getStatus());
      }

      // Send room list
      socket.emit("room:list", this.rooms);

      // Arena control commands
      socket.on("arena:start", async (cfg: any, callback?: (res: any) => void) => {
        if (!this.arenaControl) {
          callback?.({ error: "Arena not configured" });
          return;
        }
        const result = await this.arenaControl.start(cfg || {});
        this.emitArenaStatus();
        callback?.(result);
      });

      socket.on("arena:stop", (callback?: (res: any) => void) => {
        if (this.arenaControl) {
          this.arenaControl.stop();
          setTimeout(() => this.emitArenaStatus(), 500);
        }
        callback?.({ status: "stopping" });
      });

      socket.on("arena:status", (callback?: (res: any) => void) => {
        callback?.(this.arenaControl?.getStatus() ?? { running: false });
      });

      // Room commands
      socket.on("room:create", (data: any, callback?: (res: any) => void) => {
        const room: ArenaRoom = {
          id: `room-${++this.roomCounter}`,
          name: data?.name || `Room #${this.roomCounter}`,
          smallBlind: data?.smallBlind ?? 5,
          bigBlind: data?.bigBlind ?? 10,
          maxPlayers: Math.min(data?.maxPlayers ?? 6, 6),
          startingStack: data?.startingStack ?? 1000,
          maxHands: data?.maxHands ?? 100,
          status: "waiting",
          playerCount: 0,
          createdAt: Date.now(),
        };
        this.rooms.push(room);
        this.emitRoomList();
        callback?.(room);
      });

      socket.on("room:join", async (data: { roomId: string }, callback?: (res: any) => void) => {
        const room = this.rooms.find(r => r.id === data.roomId);
        if (!room) {
          callback?.({ error: "Room not found" });
          return;
        }
        if (room.status === "running") {
          callback?.({ error: "Room already running" });
          return;
        }
        if (!this.arenaControl) {
          callback?.({ error: "Arena not configured" });
          return;
        }
        room.status = "running";
        room.playerCount = room.maxPlayers;
        this.emitRoomList();
        const result = await this.arenaControl.start({
          botCount: room.maxPlayers - 1,
          maxHands: room.maxHands,
          smallBlind: room.smallBlind,
          bigBlind: room.bigBlind,
          startingStack: room.startingStack,
        });
        if (result.error) {
          room.status = "waiting";
          this.emitRoomList();
        }
        this.emitArenaStatus();
        callback?.(result);
      });

      socket.on("room:delete", (data: { roomId: string }, callback?: (res: any) => void) => {
        const idx = this.rooms.findIndex(r => r.id === data.roomId);
        if (idx === -1) {
          callback?.({ error: "Room not found" });
          return;
        }
        this.rooms.splice(idx, 1);
        this.emitRoomList();
        callback?.({ status: "deleted" });
      });

      socket.on("room:list", (callback?: (res: any) => void) => {
        callback?.(this.rooms);
      });

      // Leaderboard
      socket.on("leaderboard:get", (data: any, callback?: (res: any) => void) => {
        const sortBy = data?.sortBy || "winRate";
        callback?.(this.arenaControl?.getLeaderboard(sortBy) ?? []);
      });

      // Wallet auth
      socket.on("wallet:auth", (data: WalletAuthPayload, callback?: (res: WalletAuthResponse) => void) => {
        try {
          const recovered = ethers.verifyMessage(data.message, data.signature);
          if (recovered.toLowerCase() !== data.address.toLowerCase()) {
            logger.warn(`[WalletAuth] Signature mismatch: expected ${data.address}, got ${recovered}`);
            callback?.({ success: false, error: "Signature verification failed" });
            return;
          }

          this.authenticatedWallet = data.address;
          logger.info(`[WalletAuth] Wallet authenticated: ${data.address}`);

          if (this.walletAuthHandler) {
            this.walletAuthHandler(data.address);
          }

          callback?.({ success: true, address: data.address });
        } catch (err: any) {
          logger.error(`[WalletAuth] Error: ${err.message}`);
          callback?.({ success: false, error: err.message });
        }
      });

      socket.on("wallet:disconnect", (callback?: (res: any) => void) => {
        logger.info(`[WalletAuth] Wallet disconnected: ${this.authenticatedWallet}`);
        this.authenticatedWallet = null;
        callback?.({ success: true });
      });

      socket.on("disconnect", () => {
        logger.info(`Dashboard client disconnected: ${socket.id}`);
      });
    });
  }

  private generateMockPlayerView(agentId: string, phase: string): any {
    const validPhases = ["PREFLOP", "FLOP", "TURN", "RIVER"];
    const actualPhase = validPhases.includes(phase.toUpperCase()) ? phase.toUpperCase() : "FLOP";

    const communityCards = actualPhase === "PREFLOP" ? [] :
      actualPhase === "FLOP" ? [
        { rank: "Q", suit: "s" }, { rank: "J", suit: "h" }, { rank: "2", suit: "d" },
      ] : actualPhase === "TURN" ? [
        { rank: "Q", suit: "s" }, { rank: "J", suit: "h" }, { rank: "2", suit: "d" },
        { rank: "8", suit: "c" },
      ] : [
        { rank: "Q", suit: "s" }, { rank: "J", suit: "h" }, { rank: "2", suit: "d" },
        { rank: "8", suit: "c" }, { rank: "5", suit: "s" },
      ];

    return {
      tableId: "test-table",
      handNumber: 999,
      phase: actualPhase,
      myPlayerId: agentId,
      myPosition: "BTN",
      myHoleCards: [{ rank: "A", suit: "s" }, { rank: "K", suit: "h" }],
      myStack: 950,
      myBetThisRound: 0,
      communityCards,
      totalPot: 100,
      currentBet: 20,
      players: [
        {
          playerId: agentId, playerName: "Test Agent", seatIndex: 0,
          position: "BTN", stack: 950, status: "ACTIVE", betThisRound: 0, isDealer: true,
        },
        {
          playerId: "bot-1", playerName: "Bot Alpha", seatIndex: 1,
          position: "SB", stack: 800, status: "ACTIVE", betThisRound: 20, isDealer: false,
        },
        {
          playerId: "bot-2", playerName: "Bot Beta", seatIndex: 2,
          position: "BB", stack: 900, status: "ACTIVE", betThisRound: 10, isDealer: false,
        },
      ],
      isMyTurn: true,
      validActions: [PlayerAction.FOLD, PlayerAction.CALL, PlayerAction.RAISE],
      callAmount: 20,
      minRaiseAmount: 40,
      maxRaiseAmount: 950,
      actionHistory: [],
    };
  }

  private validateDecisionResponse(body: Record<string, any>): string[] {
    const errors: string[] = [];

    if (!body.action) {
      errors.push("Missing required field: action");
    } else {
      const validActions = ["FOLD", "CHECK", "CALL", "RAISE", "ALL_IN"];
      if (!validActions.includes(String(body.action).toUpperCase())) {
        errors.push(`Invalid action: "${body.action}". Must be one of: ${validActions.join(", ")}`);
      }
    }

    if (String(body.action).toUpperCase() === "RAISE") {
      if (body.amount === undefined || body.amount === null) {
        errors.push("RAISE action requires an amount field");
      } else if (typeof body.amount !== "number" || body.amount <= 0) {
        errors.push(`Invalid amount: ${body.amount}. Must be a positive number`);
      }
    }

    return errors;
  }

  async start(port: number): Promise<void> {
    this.httpServer = http.createServer(this.app);

    // Set up Socket.IO
    this.io = new SocketIOServer(this.httpServer, {
      cors: {
        origin: ["http://localhost:5173", "http://localhost:5174", "http://localhost:5175", "http://localhost:3000"],
        methods: ["GET", "POST"],
        credentials: true,
      },
    });

    this.setupSocketIO();

    return new Promise((resolve) => {
      this.httpServer.listen(port, () => {
        logger.info(`Poker API server listening on port ${port}`);
        logger.info(`API docs: http://localhost:${port}/api`);
        logger.info(`Dashboard Socket.IO ready on port ${port}`);
        resolve();
      });
    });
  }
}
