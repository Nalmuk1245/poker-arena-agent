# Poker Arena Agent

AI-powered Texas Hold'em poker agent that competes on the **Monad blockchain** with real token wagers, adaptive strategy, and bankroll management.

## Features

- **Monte Carlo Equity Engine** — 5,000-iteration simulations for accurate hand strength estimation
- **4-Archetype Opponent Modeling** — Classifies opponents as ROCK / TAG / LAG / Calling Station and adapts play accordingly
- **GTO-Based Bluffing** — Game-theory optimal bluff frequencies adjusted per opponent tendencies
- **Kelly Criterion Bankroll Management** — Fractional Kelly sizing with loss-streak dampening and stop-loss
- **Self-Evolving Strategy** — Automatically tunes aggression, bluff frequency, and risk parameters based on match history
- **On-Chain Commit-Reveal** — Fair deck shuffling via dual-seed commitment; hand verification at showdown
- **MCP Server** — 10-tool Model Context Protocol server for Claude Desktop integration
- **Moltbook Social** — Posts game results, trash-talks opponents, and issues open challenges

## Architecture

```
agent/src/
├── blockchain/          # Contract interaction, event listening, game actions
├── engine/              # Dealer, Deck, HandEvaluator, OddsCalculator, GameRules
├── strategy/            # StrategyEngine, OpponentModel, BluffEngine, EVCalculator,
│                        # BankrollManager, StrategyEvolver
├── social/              # Moltbook API client
├── types/               # TypeScript interfaces (cards, game, strategy)
├── utils/               # Logger (Winston)
└── index.ts             # Main agent entry point

contracts/
├── core/
│   ├── PokerGame.sol    # Game lifecycle, betting, commit-reveal
│   └── TokenVault.sol   # Wager escrow & payouts (ReentrancyGuard)
└── libraries/
    └── GameStructs.sol  # Shared enums & structs

mcp/src/
└── index.ts             # MCP server (stdio transport, 10 tools)

scripts/
├── deploy.ts            # Contract deployment to Monad
├── runMatch.ts          # AI vs AI match runner
└── simulateGames.ts     # Offline simulation
```

## Prerequisites

- **Node.js** >= 18
- **npm**
- A Monad testnet wallet with MON tokens

## Setup

1. **Install dependencies**

```bash
npm install
```

2. **Configure environment**

```bash
cp .env.example .env
```

Edit `.env` with your values:

```
PRIVATE_KEY=your_private_key_here
MONAD_RPC_URL=https://testnet-rpc.monad.xyz
POKER_GAME_ADDRESS=
TOKEN_VAULT_ADDRESS=
LOG_LEVEL=info
MOLTBOOK_API_KEY=
MOLTBOOK_AGENT_NAME=PokerArenaMolty
```

3. **Compile contracts**

```bash
npm run compile
```

4. **Deploy contracts** (testnet or local)

```bash
# Monad testnet
npm run deploy:testnet

# Local Hardhat node
npm run deploy:local
```

Copy the output addresses into your `.env`:

```
TOKEN_VAULT_ADDRESS=0x...
POKER_GAME_ADDRESS=0x...
```

## Usage

### Run the Agent

```bash
npm run agent
```

The agent will continuously look for open games, join or create matches, and play autonomously.

### Run a Simulation

```bash
npm run simulate
```

### Run an AI vs AI Match

```bash
npm run match
```

### Run Tests

```bash
npm run test
```

## MCP Server (Claude Desktop)

The MCP server exposes 10 tools for interacting with the agent through Claude Desktop.

### Build & Start

```bash
npm run mcp:build
npm run mcp:start
```

### Claude Desktop Configuration

Add to your Claude Desktop config (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "poker-arena": {
      "command": "node",
      "args": ["<path-to-project>/mcp/build/mcp/src/index.js"]
    }
  }
}
```

### Available Tools

| Tool | Description |
|------|-------------|
| `get_mon_balance` | Check MON balance on Monad testnet |
| `run_simulation` | Offline poker simulation vs bot archetypes |
| `run_match` | AI vs AI poker match with hand display |
| `analyze_opponent` | View learned opponent profile |
| `post_to_moltbook` | Post to Moltbook social network |
| `check_moltbook_feed` | Get latest Moltbook posts |
| `search_moltbook` | Semantic search on Moltbook |
| `post_poker_challenge` | Post open poker challenge |
| `play_poker` | Full match with analysis and Moltbook posting |
| `evolution_status` | Check strategy evolution parameters |

## Strategy Overview

The agent follows a 6-step decision process each turn:

1. **Equity Calculation** — Monte Carlo simulation (5,000 iterations) estimates win probability
2. **Opponent Adjustment** — Equity adjusted based on classified archetype (+5% vs ROCK, -5% vs Calling Station, etc.)
3. **EV Calculation** — Expected value computed for fold, call, and raise
4. **Bluff Check** — GTO bluff frequency with semi-bluff preference (flush/straight draws)
5. **Bankroll Sizing** — Kelly Criterion determines max bet, capped by risk parameters
6. **Decision** — Best action selected from EV analysis, bluff opportunities, and hand strength

### Self-Evolution

The `StrategyEvolver` monitors performance every N games and auto-tunes:

- Monte Carlo simulation count (1,000–8,000)
- Bluff multiplier (0.2–2.0)
- Value bet threshold (45–75%)
- Aggression factor (0.5–1.5)
- Kelly fraction (0.2–0.7)

## Smart Contracts

**PokerGame.sol** manages the full game lifecycle:

- `WAITING → PREFLOP → FLOP → TURN → RIVER → SHOWDOWN → COMPLETE`
- Dual-seed commit-reveal for provably fair deck shuffling
- Hand commit-reveal for trustless showdown verification
- 5-minute timeout protection
- On-chain leaderboard (wins, losses, total wagered)

**TokenVault.sol** handles escrow:

- Wager deposits with per-game accounting
- Winner-take-all and split-pot payouts
- Refunds for cancelled games
- Reentrancy protection (OpenZeppelin)

## Tech Stack

- **TypeScript** / **Node.js**
- **Hardhat** — Solidity compilation, testing, deployment
- **ethers.js** — Blockchain interaction
- **pokersolver** — Hand evaluation
- **OpenZeppelin** — Smart contract security
- **Winston** — Logging
- **@modelcontextprotocol/sdk** — MCP server
- **Monad** — L1 blockchain (testnet chain ID 10143)

## License

MIT
