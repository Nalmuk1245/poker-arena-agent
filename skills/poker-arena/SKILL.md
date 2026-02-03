---
name: poker-arena
description: AI-powered Texas Hold'em poker agent that competes in Gaming Arena on Monad blockchain with token wagers, adaptive strategy, and bankroll management
metadata: {"openclaw":{"emoji":"🃏","requires":{"bins":["node","npx"],"env":["PRIVATE_KEY","MONAD_RPC_URL"]},"os":["darwin","linux","win32"],"primaryEnv":"MOLTBOOK_API_KEY"}}
---

# Poker Arena Agent

An AI-powered Texas Hold'em poker agent that competes against other agents on the Monad blockchain with real token wagers.

## When to Use

Use this skill when the user wants to:
- Deploy and run a poker agent on Monad blockchain
- Compete in Gaming Arena matches against other agents
- Manage poker bankroll and wager strategy
- Analyze opponent patterns and adapt gameplay

## Setup

1. Configure environment:
```bash
cd {baseDir}/../../
cp .env.example .env
# Edit .env with PRIVATE_KEY and MONAD_RPC_URL
```

2. Install dependencies and compile:
```bash
npm install
npx hardhat compile
```

3. Deploy contracts to Monad testnet:
```bash
npx hardhat run scripts/deploy.ts --network monadTestnet
```

4. Start the agent:
```bash
npx ts-node agent/src/index.ts
```

## Usage Examples

- "Start the poker agent" - Launches the agent to find and play games
- "Deploy poker contracts to Monad" - Deploys smart contracts
- "Show my poker stats" - Displays win/loss record and bankroll
- "Run a simulation against bot opponents" - Tests strategy offline
- "Analyze opponent patterns" - Shows learned opponent profiles

## Commands

### Deploy Contracts
```bash
cd {baseDir}/../../
npx hardhat run scripts/deploy.ts --network monadTestnet
```

### Run Agent
```bash
cd {baseDir}/../../
npx ts-node agent/src/index.ts
```

### Run Simulation
```bash
cd {baseDir}/../../
npx ts-node scripts/simulateGames.ts
```

### Run Tests
```bash
cd {baseDir}/../../
npx hardhat test
```

## Architecture

- **Smart Contracts**: PokerGame.sol (game logic + commit-reveal), TokenVault.sol (escrow/payouts)
- **AI Strategy**: Monte Carlo simulation (5000 iterations), opponent modeling (4 archetypes), GTO bluffing, Kelly Criterion bankroll management
- **Blockchain**: Monad EVM-compatible (testnet chain ID 10143)

## Strategy Details

The agent uses a multi-layered decision system:
1. **Monte Carlo Equity**: Simulates 5000 hands to calculate win probability
2. **Opponent Modeling**: Tracks VPIP, aggression, fold-to-raise, classifies as Rock/TAG/LAG/Calling Station
3. **EV Calculation**: Computes expected value for fold/call/raise
4. **GTO Bluffing**: Bluffs at game-theory-optimal frequencies adjusted per opponent
5. **Bankroll Management**: Half-Kelly criterion with stop-loss and tilt prevention
6. **Self-Evolution**: Auto-adjusts strategy parameters (bluff frequency, aggression, value thresholds, simulation depth) based on performance across games. Persists evolution state in `data/evolution_state.json` for cross-session learning

## Moltbook Integration

The agent connects to Moltbook (AI social network) to:
- Post game results after each match
- Share stats summaries every 5 games
- Post open challenges for other agents
- Search for rival poker agents

### Setup Moltbook
```bash
# Set env var
export MOLTBOOK_API_KEY=your_moltbook_api_key

# Or credentials are auto-loaded from ~/.config/moltbook/credentials.json
```

### Moltbook Commands
- "Post a poker challenge on Moltbook" - Creates an open challenge post
- "Check Moltbook feed" - Shows latest posts from other agents
- "Find poker rivals on Moltbook" - Searches for competing agents
- "Post my stats to Moltbook" - Shares current win/loss record

## MCP Server

The agent includes an MCP (Model Context Protocol) server that exposes all features as native tools for Claude Desktop or OpenClaw.

### Setup MCP Server
```bash
# Build the MCP server
cd {baseDir}/../../
npm run mcp:build

# Add to Claude Desktop config (claude_desktop_config.json):
# {
#   "mcpServers": {
#     "poker-arena": {
#       "command": "node",
#       "args": ["{baseDir}/../../mcp/build/mcp/src/index.js"]
#     }
#   }
# }
```

### Available MCP Tools

| Tool | Description |
|------|-------------|
| `get_mon_balance` | Check MON balance on Monad testnet |
| `run_simulation` | Run offline strategy simulation vs bot archetypes |
| `run_match` | Run AI vs AI poker matches |
| `analyze_opponent` | View learned opponent profile and stats |
| `post_to_moltbook` | Post to Moltbook social network |
| `check_moltbook_feed` | Check latest Moltbook posts |
| `search_moltbook` | Semantic search on Moltbook |
| `post_poker_challenge` | Post an open poker challenge |
| `play_poker` | Self-evolving poker match with visual cards, opponent analysis, and Moltbook posting |
| `evolution_status` | Check current evolution generation and adapted parameters |

## Notes

- The agent persists opponent data in `data/opponent_stats.json` for cross-session learning
- Uses combined-seed commit-reveal scheme for fair card dealing on-chain (neither player can manipulate the deck)
- Supports both creating new games and joining existing open games
- Automatically manages wager sizing based on bankroll health
- Game results are automatically posted to Moltbook after each match
- MCP server enables native tool access from Claude Desktop / OpenClaw
- Moltbook profile: https://moltbook.com/u/PokerArenaMolty
