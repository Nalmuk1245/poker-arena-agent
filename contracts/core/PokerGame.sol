// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../libraries/GameStructs.sol";
import "./TokenVault.sol";

contract PokerGame {
    using GameStructs for GameStructs.Game;

    TokenVault public vault;
    uint256 public gameCount;
    uint256 public constant TIMEOUT_DURATION = 5 minutes;

    // gameId => Game
    mapping(uint256 => GameStructs.Game) public games;
    // Track action counts per phase for advancing
    mapping(uint256 => mapping(uint8 => uint8)) public phaseActionCount;

    // Leaderboard
    mapping(address => uint256) public wins;
    mapping(address => uint256) public losses;
    mapping(address => uint256) public totalWagered;

    event GameCreated(uint256 indexed gameId, address indexed player1, uint256 wager);
    event PlayerJoined(uint256 indexed gameId, address indexed player2);
    event SeedCommitted(uint256 indexed gameId, address indexed player);
    event SeedRevealed(uint256 indexed gameId, address indexed player);
    event DeckSeeded(uint256 indexed gameId, bytes32 combinedSeed);
    event CardsCommitted(uint256 indexed gameId, address indexed player);
    event ActionSubmitted(
        uint256 indexed gameId,
        address indexed player,
        GameStructs.PlayerAction action,
        uint256 amount
    );
    event PhaseAdvanced(uint256 indexed gameId, GameStructs.GamePhase newPhase);
    event CardsRevealed(uint256 indexed gameId, address indexed player, uint8 handRank);
    event GameComplete(uint256 indexed gameId, address indexed winner, uint256 payout);
    event GameDraw(uint256 indexed gameId);

    constructor(address _vault) {
        vault = TokenVault(payable(_vault));
    }

    // ============ Game Lifecycle ============

    function createGame() external payable returns (uint256) {
        require(msg.value > 0, "Wager must be > 0");

        uint256 gameId = gameCount++;
        GameStructs.Game storage g = games[gameId];
        g.player1 = msg.sender;
        g.wagerAmount = msg.value;
        g.phase = GameStructs.GamePhase.WAITING;
        g.isActive = true;
        g.lastActionTime = block.timestamp;

        // Deposit wager into vault
        vault.depositWager{value: msg.value}(gameId, msg.sender);
        totalWagered[msg.sender] += msg.value;

        emit GameCreated(gameId, msg.sender, msg.value);
        return gameId;
    }

    /**
     * Create a free game (no token wager). Results are recorded on-chain
     * but no tokens are staked or transferred.
     */
    function createFreeGame() external returns (uint256) {
        uint256 gameId = gameCount++;
        GameStructs.Game storage g = games[gameId];
        g.player1 = msg.sender;
        g.wagerAmount = 0;
        g.phase = GameStructs.GamePhase.WAITING;
        g.isActive = true;
        g.lastActionTime = block.timestamp;

        emit GameCreated(gameId, msg.sender, 0);
        return gameId;
    }

    function joinGame(uint256 gameId) external payable {
        GameStructs.Game storage g = games[gameId];
        require(g.isActive, "Game not active");
        require(g.phase == GameStructs.GamePhase.WAITING, "Game already started");
        require(msg.sender != g.player1, "Cannot join own game");
        require(msg.value == g.wagerAmount, "Must match wager amount");

        g.player2 = msg.sender;
        g.phase = GameStructs.GamePhase.PREFLOP;
        g.currentTurn = g.player1;
        g.lastActionTime = block.timestamp;

        if (g.wagerAmount > 0) {
            vault.depositWager{value: msg.value}(gameId, msg.sender);
            totalWagered[msg.sender] += msg.value;
        }

        emit PlayerJoined(gameId, msg.sender);
        emit PhaseAdvanced(gameId, GameStructs.GamePhase.PREFLOP);
    }

    // ============ Seed Commit-Reveal (Fair Card Dealing) ============

    /**
     * Step 1: Each player commits a hash of their random seed.
     * Both seeds will be combined to determine the deck shuffle.
     * Neither player can manipulate the outcome alone.
     */
    function commitSeed(uint256 gameId, bytes32 seedHash) external {
        GameStructs.Game storage g = games[gameId];
        require(g.isActive, "Game not active");
        require(g.phase == GameStructs.GamePhase.PREFLOP, "Must be preflop");
        require(_isPlayer(g, msg.sender), "Not a player");

        if (msg.sender == g.player1) {
            require(g.player1SeedCommit == bytes32(0), "Already committed");
            g.player1SeedCommit = seedHash;
        } else {
            require(g.player2SeedCommit == bytes32(0), "Already committed");
            g.player2SeedCommit = seedHash;
        }

        g.lastActionTime = block.timestamp;
        emit SeedCommitted(gameId, msg.sender);
    }

    /**
     * Step 2: After both seeds are committed, each player reveals their seed.
     * The contract verifies the seed matches the committed hash.
     * Once both are revealed, combinedSeed = keccak256(seed1 + seed2).
     */
    function revealSeed(uint256 gameId, bytes32 seed) external {
        GameStructs.Game storage g = games[gameId];
        require(g.isActive, "Game not active");
        require(_isPlayer(g, msg.sender), "Not a player");
        // Both must have committed before either reveals
        require(
            g.player1SeedCommit != bytes32(0) && g.player2SeedCommit != bytes32(0),
            "Both players must commit seeds first"
        );

        bytes32 seedHash = keccak256(abi.encodePacked(seed));

        if (msg.sender == g.player1) {
            require(!g.player1SeedRevealed, "Already revealed");
            require(seedHash == g.player1SeedCommit, "Seed does not match commitment");
            g.player1Seed = seed;
            g.player1SeedRevealed = true;
        } else {
            require(!g.player2SeedRevealed, "Already revealed");
            require(seedHash == g.player2SeedCommit, "Seed does not match commitment");
            g.player2Seed = seed;
            g.player2SeedRevealed = true;
        }

        g.lastActionTime = block.timestamp;
        emit SeedRevealed(gameId, msg.sender);

        // If both revealed, compute the combined seed
        if (g.player1SeedRevealed && g.player2SeedRevealed) {
            g.combinedSeed = keccak256(abi.encodePacked(g.player1Seed, g.player2Seed));
            emit DeckSeeded(gameId, g.combinedSeed);
        }
    }

    /**
     * Get the combined seed for a game (available after both players reveal).
     */
    function getCombinedSeed(uint256 gameId) external view returns (bytes32) {
        GameStructs.Game storage g = games[gameId];
        require(g.combinedSeed != bytes32(0), "Seeds not yet revealed");
        return g.combinedSeed;
    }

    // ============ Hand Result Commit-Reveal (Showdown) ============

    function commitCards(uint256 gameId, bytes32 cardHash) external {
        GameStructs.Game storage g = games[gameId];
        require(g.isActive, "Game not active");
        require(_isPlayer(g, msg.sender), "Not a player");

        if (msg.sender == g.player1) {
            require(g.player1CardCommit == bytes32(0), "Already committed");
            g.player1CardCommit = cardHash;
        } else {
            require(g.player2CardCommit == bytes32(0), "Already committed");
            g.player2CardCommit = cardHash;
        }

        g.lastActionTime = block.timestamp;
        emit CardsCommitted(gameId, msg.sender);
    }

    // ============ Betting Actions ============

    function submitAction(
        uint256 gameId,
        GameStructs.PlayerAction action,
        uint256 raiseAmount
    ) external payable {
        GameStructs.Game storage g = games[gameId];
        require(g.isActive, "Game not active");
        require(
            g.phase != GameStructs.GamePhase.WAITING &&
            g.phase != GameStructs.GamePhase.SHOWDOWN &&
            g.phase != GameStructs.GamePhase.COMPLETE,
            "Invalid phase for action"
        );
        require(msg.sender == g.currentTurn, "Not your turn");

        g.lastActionTime = block.timestamp;

        if (action == GameStructs.PlayerAction.FOLD) {
            _handleFold(gameId, g);
            return;
        }

        // Mark player has acted this round
        if (msg.sender == g.player1) {
            g.player1Acted = true;
        } else {
            g.player2Acted = true;
        }

        if (action == GameStructs.PlayerAction.RAISE || action == GameStructs.PlayerAction.ALL_IN) {
            require(raiseAmount > 0, "Raise amount must be > 0");
            g.pot += raiseAmount;
            // Reset opponent's acted flag (they must respond to raise)
            if (msg.sender == g.player1) {
                g.player2Acted = false;
            } else {
                g.player1Acted = false;
            }
        } else if (action == GameStructs.PlayerAction.CALL) {
            // Call matches the current bet (handled off-chain, on-chain just tracks)
        }
        // CHECK requires no additional action

        // Switch turns
        g.currentTurn = (msg.sender == g.player1) ? g.player2 : g.player1;

        emit ActionSubmitted(gameId, msg.sender, action, raiseAmount);

        // Check if both players have acted - advance phase
        if (g.player1Acted && g.player2Acted) {
            _advancePhase(gameId, g);
        }
    }

    // ============ Showdown: Reveal Cards ============

    function revealCards(
        uint256 gameId,
        uint8 handRank,
        uint256 handScore,
        bytes32 salt
    ) external {
        GameStructs.Game storage g = games[gameId];
        require(g.isActive, "Game not active");
        require(g.phase == GameStructs.GamePhase.SHOWDOWN, "Not showdown phase");
        require(_isPlayer(g, msg.sender), "Not a player");

        // Verify commitment
        bytes32 commitment = keccak256(abi.encodePacked(handRank, handScore, salt));
        if (msg.sender == g.player1) {
            require(!g.player1Revealed, "Already revealed");
            require(commitment == g.player1CardCommit, "Commitment mismatch");
            g.player1HandRank = handRank;
            g.player1HandScore = handScore;
            g.player1Revealed = true;
        } else {
            require(!g.player2Revealed, "Already revealed");
            require(commitment == g.player2CardCommit, "Commitment mismatch");
            g.player2HandRank = handRank;
            g.player2HandScore = handScore;
            g.player2Revealed = true;
        }

        g.lastActionTime = block.timestamp;
        emit CardsRevealed(gameId, msg.sender, handRank);

        // If both revealed, determine winner
        if (g.player1Revealed && g.player2Revealed) {
            _determineWinner(gameId, g);
        }
    }

    // ============ Timeout ============

    function claimTimeout(uint256 gameId) external {
        GameStructs.Game storage g = games[gameId];
        require(g.isActive, "Game not active");
        require(_isPlayer(g, msg.sender), "Not a player");
        require(
            block.timestamp > g.lastActionTime + TIMEOUT_DURATION,
            "Timeout not reached"
        );

        // The player who DID NOT time out wins
        address winner = msg.sender;

        // Effects before interactions
        g.phase = GameStructs.GamePhase.COMPLETE;
        g.isActive = false;
        wins[winner]++;
        address loser = (winner == g.player1) ? g.player2 : g.player1;
        if (loser != address(0)) losses[loser]++;

        emit GameComplete(gameId, winner, g.pot);

        // Interaction last
        if (g.wagerAmount > 0) {
            vault.distributePayout(gameId, winner);
        }
    }

    // ============ View Functions ============

    function getGame(uint256 gameId) external view returns (GameStructs.Game memory) {
        return games[gameId];
    }

    function getOpenGames() external view returns (uint256[] memory) {
        uint256 count = 0;
        for (uint256 i = 0; i < gameCount; i++) {
            if (games[i].phase == GameStructs.GamePhase.WAITING && games[i].isActive) {
                count++;
            }
        }

        uint256[] memory openGames = new uint256[](count);
        uint256 idx = 0;
        for (uint256 i = 0; i < gameCount; i++) {
            if (games[i].phase == GameStructs.GamePhase.WAITING && games[i].isActive) {
                openGames[idx++] = i;
            }
        }
        return openGames;
    }

    function getPlayerStats(address player) external view returns (
        uint256 _wins,
        uint256 _losses,
        uint256 _totalWagered
    ) {
        return (wins[player], losses[player], totalWagered[player]);
    }

    // ============ Internal ============

    function _handleFold(uint256 gameId, GameStructs.Game storage g) internal {
        address winner;
        if (msg.sender == g.player1) {
            g.player1Folded = true;
            winner = g.player2;
        } else {
            g.player2Folded = true;
            winner = g.player1;
        }

        // Effects before interactions
        g.phase = GameStructs.GamePhase.COMPLETE;
        g.isActive = false;
        wins[winner]++;
        losses[msg.sender]++;

        emit GameComplete(gameId, winner, g.pot);

        // Interaction last
        if (g.wagerAmount > 0) {
            vault.distributePayout(gameId, winner);
        }
    }

    function _advancePhase(uint256 gameId, GameStructs.Game storage g) internal {
        // Reset acted flags for next round
        g.player1Acted = false;
        g.player2Acted = false;
        g.currentTurn = g.player1; // Player 1 acts first each round

        if (g.phase == GameStructs.GamePhase.PREFLOP) {
            g.phase = GameStructs.GamePhase.FLOP;
        } else if (g.phase == GameStructs.GamePhase.FLOP) {
            g.phase = GameStructs.GamePhase.TURN;
        } else if (g.phase == GameStructs.GamePhase.TURN) {
            g.phase = GameStructs.GamePhase.RIVER;
        } else if (g.phase == GameStructs.GamePhase.RIVER) {
            g.phase = GameStructs.GamePhase.SHOWDOWN;
        }

        emit PhaseAdvanced(gameId, g.phase);
    }

    function _determineWinner(uint256 gameId, GameStructs.Game storage g) internal {
        g.phase = GameStructs.GamePhase.COMPLETE;
        g.isActive = false;

        address winner;

        if (g.player1HandRank > g.player2HandRank) {
            winner = g.player1;
        } else if (g.player2HandRank > g.player1HandRank) {
            winner = g.player2;
        } else {
            if (g.player1HandScore > g.player2HandScore) {
                winner = g.player1;
            } else if (g.player2HandScore > g.player1HandScore) {
                winner = g.player2;
            } else {
                // True tie - split pot
                emit GameDraw(gameId);
                if (g.wagerAmount > 0) {
                    vault.distributeSplitPot(gameId, g.player1, g.player2);
                }
                return;
            }
        }

        // Effects before interactions
        wins[winner]++;
        address loser = (winner == g.player1) ? g.player2 : g.player1;
        losses[loser]++;

        emit GameComplete(gameId, winner, g.pot);

        // Interaction last
        if (g.wagerAmount > 0) {
            vault.distributePayout(gameId, winner);
        }
    }

    function _isPlayer(GameStructs.Game storage g, address addr) internal view returns (bool) {
        return addr == g.player1 || addr == g.player2;
    }
}
