// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract TokenVault is ReentrancyGuard {
    // gameId => total pot
    mapping(uint256 => uint256) public gamePots;
    // gameId => player => deposit
    mapping(uint256 => mapping(address => uint256)) public playerDeposits;
    // Authorized game contracts
    mapping(address => bool) public authorizedGames;

    address public owner;

    event WagerDeposited(uint256 indexed gameId, address indexed player, uint256 amount);
    event PayoutDistributed(uint256 indexed gameId, address indexed winner, uint256 amount);
    event Refunded(uint256 indexed gameId, address indexed player, uint256 amount);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    modifier onlyAuthorized() {
        require(authorizedGames[msg.sender] || msg.sender == owner, "Not authorized");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    function authorizeGame(address gameContract) external onlyOwner {
        authorizedGames[gameContract] = true;
    }

    function revokeGame(address gameContract) external onlyOwner {
        authorizedGames[gameContract] = false;
    }

    function depositWager(uint256 gameId, address player) external payable onlyAuthorized {
        require(msg.value > 0, "Must deposit > 0");
        playerDeposits[gameId][player] += msg.value;
        gamePots[gameId] += msg.value;
        emit WagerDeposited(gameId, player, msg.value);
    }

    function distributePayout(
        uint256 gameId,
        address winner
    ) external onlyAuthorized nonReentrant {
        uint256 pot = gamePots[gameId];
        require(pot > 0, "No pot to distribute");
        gamePots[gameId] = 0;
        (bool sent, ) = winner.call{value: pot}("");
        require(sent, "Payout failed");
        emit PayoutDistributed(gameId, winner, pot);
    }

    function distributeSplitPot(
        uint256 gameId,
        address player1,
        address player2
    ) external onlyAuthorized nonReentrant {
        uint256 pot = gamePots[gameId];
        require(pot > 0, "No pot to split");
        gamePots[gameId] = 0;
        uint256 half = pot / 2;
        (bool sent1, ) = player1.call{value: half}("");
        require(sent1, "Split payout 1 failed");
        (bool sent2, ) = player2.call{value: pot - half}("");
        require(sent2, "Split payout 2 failed");
        emit PayoutDistributed(gameId, player1, half);
        emit PayoutDistributed(gameId, player2, pot - half);
    }

    function refund(
        uint256 gameId,
        address player
    ) external onlyAuthorized nonReentrant {
        uint256 deposit = playerDeposits[gameId][player];
        require(deposit > 0, "No deposit to refund");
        playerDeposits[gameId][player] = 0;
        gamePots[gameId] -= deposit;
        (bool sent, ) = player.call{value: deposit}("");
        require(sent, "Refund failed");
        emit Refunded(gameId, player, deposit);
    }

    receive() external payable {}
}
