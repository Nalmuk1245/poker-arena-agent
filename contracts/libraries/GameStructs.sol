// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

library GameStructs {
    enum GamePhase {
        WAITING,
        PREFLOP,
        FLOP,
        TURN,
        RIVER,
        SHOWDOWN,
        COMPLETE
    }

    enum PlayerAction {
        NONE,
        FOLD,
        CHECK,
        CALL,
        RAISE,
        ALL_IN
    }

    struct Game {
        address player1;
        address player2;
        uint256 wagerAmount;
        uint256 pot;
        GamePhase phase;
        address currentTurn;
        uint256 lastActionTime;
        // Seed commit-reveal: each player commits a seed hash, reveals seed later
        // Combined seed = keccak256(seed1 + seed2) determines the deck shuffle
        bytes32 player1SeedCommit;   // hash of player1's seed
        bytes32 player2SeedCommit;   // hash of player2's seed
        bytes32 player1Seed;         // revealed seed
        bytes32 player2Seed;         // revealed seed
        bytes32 combinedSeed;        // keccak256(seed1 + seed2) — set after both reveal
        bool player1SeedRevealed;
        bool player2SeedRevealed;
        // Hand result commit-reveal (used at showdown)
        bytes32 player1CardCommit;
        bytes32 player2CardCommit;
        uint8 player1HandRank;
        uint8 player2HandRank;
        uint256 player1HandScore;
        uint256 player2HandScore;
        bool player1Folded;
        bool player2Folded;
        bool player1Revealed;
        bool player2Revealed;
        bool player1Acted;
        bool player2Acted;
        bool isActive;
    }
}
