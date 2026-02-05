import TelegramBotApi from "node-telegram-bot-api";
import { config } from "../config";
import logger from "../utils/logger";

/**
 * Agent state snapshot exposed to the telegram bot for /status, /stats, etc.
 */
export interface AgentStateSnapshot {
  isRunning: boolean;
  isPaused: boolean;
  isFreePlay: boolean;
  currentGameId: number;
  currentPhase: string;
  matchesPlayed: number;
  wins: number;
  losses: number;
  bankroll: number;
  riskLevel: string;
  consecutiveLosses: number;
  myAddress: string;
  opponentCount: number;
}

export type AgentStateGetter = () => AgentStateSnapshot;
export type PauseHandler = () => void;
export type ResumeHandler = () => void;

/**
 * Telegram bot for real-time notifications and agent control.
 */
export class TelegramBot {
  private bot: TelegramBotApi | null = null;
  private chatId: string = "";
  private getState: AgentStateGetter;
  private onPause: PauseHandler;
  private onResume: ResumeHandler;
  private getBotPoolStatus: () => Promise<string>;
  private getQueueStatus: () => string;
  private getOpponentsSummary: () => string;

  constructor(opts: {
    getState: AgentStateGetter;
    onPause: PauseHandler;
    onResume: ResumeHandler;
    getBotPoolStatus: () => Promise<string>;
    getQueueStatus: () => string;
    getOpponentsSummary: () => string;
  }) {
    this.getState = opts.getState;
    this.onPause = opts.onPause;
    this.onResume = opts.onResume;
    this.getBotPoolStatus = opts.getBotPoolStatus;
    this.getQueueStatus = opts.getQueueStatus;
    this.getOpponentsSummary = opts.getOpponentsSummary;
  }

  async start(): Promise<void> {
    if (!config.telegram.enabled || !config.telegram.botToken) {
      logger.info("Telegram bot disabled (no TELEGRAM_BOT_TOKEN)");
      return;
    }

    try {
      this.bot = new TelegramBotApi(config.telegram.botToken, { polling: true });
      this.chatId = config.telegram.chatId;

      this.registerCommands();
      this.registerTextHandler();

      const me = await this.bot.getMe();
      logger.info(`Telegram bot started: @${me.username}`);

      if (this.chatId) {
        await this.send("🟢 Poker Arena 에이전트가 시작되었습니다.");
      }
    } catch (err: any) {
      logger.error(`Telegram bot init failed: ${err.message}`);
      this.bot = null;
    }
  }

  stop(): void {
    if (this.bot) {
      this.bot.stopPolling();
      this.bot = null;
      logger.info("Telegram bot stopped");
    }
  }

  // ============ Commands ============

  private registerCommands(): void {
    if (!this.bot) return;

    this.bot.onText(/\/start/, (msg) => {
      this.chatId = msg.chat.id.toString();
      logger.info(`Telegram chat registered: ${this.chatId}`);
      this.bot!.sendMessage(
        msg.chat.id,
        "🃏 Poker Arena 에이전트에 연결되었습니다.\n/help 로 명령어를 확인하세요."
      );
    });

    this.bot.onText(/\/help/, (msg) => {
      const text = [
        "📋 사용 가능한 명령어:",
        "",
        "/status - 에이전트 상태",
        "/stats - 전적 및 뱅크롤",
        "/game - 현재 게임 정보",
        "/opponents - 상대 분석 요약",
        "/botpool - 봇 풀 상태",
        "/queue - 매칭 대기열",
        "/pause - 에이전트 일시정지",
        "/resume - 에이전트 재개",
        "/help - 도움말",
      ].join("\n");
      this.bot!.sendMessage(msg.chat.id, text);
    });

    this.bot.onText(/\/status/, (msg) => {
      const s = this.getState();
      const status = s.isPaused
        ? "⏸ 일시정지"
        : s.currentGameId >= 0
        ? "🎮 게임 중"
        : "💤 대기 중";
      const mode = s.isFreePlay ? "무료 플레이" : "토큰 베팅";
      const text = [
        `상태: ${status}`,
        `모드: ${mode}`,
        `주소: ${s.myAddress ? this.shortAddr(s.myAddress) : "N/A"}`,
        `게임 ID: ${s.currentGameId >= 0 ? `#${s.currentGameId}` : "없음"}`,
        `페이즈: ${s.currentPhase}`,
      ].join("\n");
      this.bot!.sendMessage(msg.chat.id, text);
    });

    this.bot.onText(/\/stats/, (msg) => {
      const s = this.getState();
      const winRate =
        s.matchesPlayed > 0
          ? ((s.wins / s.matchesPlayed) * 100).toFixed(1)
          : "0.0";
      const text = [
        "📊 전적 현황",
        "",
        `총 대국: ${s.matchesPlayed}`,
        `승/패: ${s.wins}승 ${s.losses}패 (승률 ${winRate}%)`,
        `뱅크롤: ${s.bankroll.toFixed(4)} MON`,
        `리스크: ${s.riskLevel}`,
        `연속 패배: ${s.consecutiveLosses}회`,
      ].join("\n");
      this.bot!.sendMessage(msg.chat.id, text);
    });

    this.bot.onText(/\/game/, (msg) => {
      const s = this.getState();
      if (s.currentGameId < 0) {
        this.bot!.sendMessage(msg.chat.id, "현재 진행 중인 게임이 없습니다.");
        return;
      }
      const mode = s.isFreePlay ? "무료 플레이" : "토큰 베팅";
      const text = [
        `🎮 게임 #${s.currentGameId}`,
        `페이즈: ${s.currentPhase}`,
        `모드: ${mode}`,
      ].join("\n");
      this.bot!.sendMessage(msg.chat.id, text);
    });

    this.bot.onText(/\/opponents/, (msg) => {
      const summary = this.getOpponentsSummary();
      this.bot!.sendMessage(msg.chat.id, summary || "상대 데이터가 없습니다.");
    });

    this.bot.onText(/\/botpool/, async (msg) => {
      try {
        const status = await this.getBotPoolStatus();
        this.bot!.sendMessage(msg.chat.id, status || "봇 풀이 비어있습니다.");
      } catch (err: any) {
        this.bot!.sendMessage(msg.chat.id, `오류: ${err.message}`);
      }
    });

    this.bot.onText(/\/queue/, (msg) => {
      const status = this.getQueueStatus();
      this.bot!.sendMessage(msg.chat.id, status || "대기열이 비어있습니다.");
    });

    this.bot.onText(/\/pause/, (msg) => {
      this.onPause();
      this.bot!.sendMessage(msg.chat.id, "⏸ 에이전트가 일시정지되었습니다.");
    });

    this.bot.onText(/\/resume/, (msg) => {
      this.onResume();
      this.bot!.sendMessage(msg.chat.id, "▶️ 에이전트가 재개되었습니다.");
    });
  }

  private registerTextHandler(): void {
    if (!this.bot) return;

    this.bot.on("message", (msg) => {
      if (!msg.text || msg.text.startsWith("/")) return;
      const s = this.getState();
      const winRate =
        s.matchesPlayed > 0
          ? ((s.wins / s.matchesPlayed) * 100).toFixed(1)
          : "0.0";
      const mode = s.isFreePlay ? "무료 플레이" : "토큰 베팅";

      let statusEmoji: string;
      let statusText: string;
      if (s.isPaused) {
        statusEmoji = "⏸";
        statusText = "일시정지 중";
      } else if (s.currentGameId >= 0) {
        statusEmoji = "🎮";
        statusText = `게임 #${s.currentGameId} (${s.currentPhase})`;
      } else {
        statusEmoji = "💤";
        statusText = "상대 탐색 중";
      }

      const lines = [
        `${statusEmoji} ${statusText}`,
        `📊 ${s.wins}승 ${s.losses}패 (승률 ${winRate}%)`,
        `💰 ${s.bankroll.toFixed(4)} MON | ${mode}`,
        `🎯 리스크: ${s.riskLevel}`,
        `👥 상대 ${s.opponentCount}명 기록`,
        "",
        "명령어: /status /stats /game /pause /resume",
      ];
      this.bot!.sendMessage(msg.chat.id, lines.join("\n"));
    });
  }

  // ============ Notifications ============

  async notifyGameCreated(gameId: number): Promise<void> {
    await this.send(`🆕 게임 #${gameId} 생성 — 상대 대기 중...`);
  }

  async notifyGameJoined(gameId: number, opponent?: string): Promise<void> {
    const opp = opponent ? ` (상대: ${this.shortAddr(opponent)})` : "";
    await this.send(`🎮 게임 #${gameId} 참여${opp}`);
  }

  async notifyGameResult(
    gameId: number,
    won: boolean,
    payout: number
  ): Promise<void> {
    if (won) {
      await this.send(
        `🏆 게임 #${gameId}: 승리! (+${payout.toFixed(4)} MON)`
      );
    } else {
      await this.send(
        `💀 게임 #${gameId}: 패배 (${payout.toFixed(4)} MON)`
      );
    }
  }

  async notifyMatchmaking(status: string): Promise<void> {
    await this.send(`🔍 매칭: ${status}`);
  }

  async notifyBotPoolMatch(gameId: number, botLabel: string): Promise<void> {
    await this.send(`🤖 봇 "${botLabel}"이 게임 #${gameId}에 참여 (연습 매치)`);
  }

  async notifyError(message: string): Promise<void> {
    const timestamp = new Date().toLocaleTimeString("ko-KR", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    const lines = [
      `❌ 오류 발생 [${timestamp}]`,
      `━━━━━━━━━━━━━━━`,
      message,
      `━━━━━━━━━━━━━━━`,
    ];
    await this.send(lines.join("\n"));
  }

  async notifyWarning(message: string): Promise<void> {
    await this.send(`⚠️ 경고: ${message}`);
  }

  async notifyRiskLevel(level: string): Promise<void> {
    const emoji = level === "HIGH" ? "🔴" : level === "MEDIUM" ? "🟡" : "🟢";
    await this.send(`${emoji} 뱅크롤 리스크 변경: ${level}`);
  }

  async notifyPhaseChange(gameId: number, phase: string): Promise<void> {
    const phaseEmojis: Record<string, string> = {
      WAITING: "⏳",
      PREFLOP: "🃏",
      FLOP: "🔵",
      TURN: "🟡",
      RIVER: "🔴",
      SHOWDOWN: "🎭",
      COMPLETE: "✅",
    };
    const emoji = phaseEmojis[phase] || "📍";
    await this.send(`${emoji} 게임 #${gameId}: ${phase} 페이즈`);
  }

  async notifyAction(
    gameId: number,
    action: string,
    amount: number,
    reasoning: string
  ): Promise<void> {
    const actionEmojis: Record<string, string> = {
      FOLD: "🏳️",
      CHECK: "✋",
      CALL: "📞",
      RAISE: "💰",
      ALL_IN: "🔥",
    };
    const emoji = actionEmojis[action] || "🎯";
    const amountStr = amount > 0 ? ` (${amount})` : "";
    await this.send(
      `${emoji} 게임 #${gameId}: ${action}${amountStr}\n📝 ${reasoning}`
    );
  }

  async notifyShowdown(gameId: number, handName: string): Promise<void> {
    await this.send(`🎭 게임 #${gameId} 쇼다운: ${handName}`);
  }

  async notifyOpponentAction(gameId: number, phase: string): Promise<void> {
    await this.send(`👤 게임 #${gameId}: 상대방 액션 완료 (${phase})`);
  }

  async notifyHoleCards(gameId: number, cardsDisplay: string): Promise<void> {
    await this.send(`🃏 게임 #${gameId} 홀카드: ${cardsDisplay}`);
  }

  async notifyCommunityCards(gameId: number, cardsDisplay: string, phase: string): Promise<void> {
    await this.send(`🎴 게임 #${gameId} ${phase}: ${cardsDisplay}`);
  }

  async notifyHandStrength(gameId: number, handName: string): Promise<void> {
    await this.send(`💪 게임 #${gameId} 핸드: ${handName}`);
  }

  async notifyVirtualChips(gameId: number, myStack: number, oppStack: number, pot: number): Promise<void> {
    await this.send(
      `💰 게임 #${gameId}\n내 칩: ${myStack} | 상대 칩: ${oppStack} | 팟: ${pot}`
    );
  }

  // ============ Helpers ============

  private async send(text: string): Promise<void> {
    if (!this.bot || !this.chatId) return;
    try {
      await this.bot.sendMessage(this.chatId, text);
    } catch (err: any) {
      logger.warn(`Telegram send failed: ${err.message}`);
    }
  }

  private shortAddr(addr: string): string {
    if (addr.length <= 10) return addr;
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  }
}
