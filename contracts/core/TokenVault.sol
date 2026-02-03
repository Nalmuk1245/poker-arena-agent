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

    // Dealer fee configuration
    address public dealerAddress;
    uint256 public dealerFeeBps; // basis points (100 = 1%, 250 = 2.5%)
    uint256 public constant MAX_FEE_BPS = 1000; // max 10%
    uint256 public totalFeesCollected;

    event WagerDeposited(uint256 indexed gameId, address indexed player, uint256 amount);
    event PayoutDistributed(uint256 indexed gameId, address indexed winner, uint256 amount);
    event DealerFeeCollected(uint256 indexed gameId, address indexed dealer, uint256 fee);
    event Refunded(uint256 indexed gameId, address indexed player, uint256 amount);
    event DealerFeeUpdated(uint256 newFeeBps);
    event DealerAddressUpdated(address newDealer);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    modifier onlyAuthorized() {
        require(authorizedGames[msg.sender] || msg.sender == owner, "Not authorized");
        _;
    }

    constructor(address _dealerAddress, uint256 _dealerFeeBps) {
        require(_dealerFeeBps <= MAX_FEE_BPS, "Fee too high");
        owner = msg.sender;
        dealerAddress = _dealerAddress;
        dealerFeeBps = _dealerFeeBps;
    }

    // ============ Admin ============

    function authorizeGame(address gameContract) external onlyOwner {
        authorizedGames[gameContract] = true;
    }

    function revokeGame(address gameContract) external onlyOwner {
        authorizedGames[gameContract] = false;
    }

    function setDealerFee(uint256 _feeBps) external onlyOwner {
        require(_feeBps <= MAX_FEE_BPS, "Fee too high");
        dealerFeeBps = _feeBps;
        emit DealerFeeUpdated(_feeBps);
    }

    function setDealerAddress(address _dealer) external onlyOwner {
        require(_dealer != address(0), "Invalid address");
        dealerAddress = _dealer;
        emit DealerAddressUpdated(_dealer);
    }

    // ============ Deposits ============

    function depositWager(uint256 gameId, address player) external payable onlyAuthorized {
        require(msg.value > 0, "Must deposit > 0");
        playerDeposits[gameId][player] += msg.value;
        gamePots[gameId] += msg.value;
        emit WagerDeposited(gameId, player, msg.value);
    }

    // ============ Payouts (with dealer fee) ============

    function distributePayout(
        uint256 gameId,
        address winner
    ) external onlyAuthorized nonReentrant {
        uint256 pot = gamePots[gameId];
        require(pot > 0, "No pot to distribute");
        gamePots[gameId] = 0;

        uint256 fee = _calculateFee(pot);
        uint256 winnerPayout = pot - fee;

        // Send fee to dealer
        if (fee > 0 && dealerAddress != address(0)) {
            (bool feeSent, ) = dealerAddress.call{value: fee}("");
            require(feeSent, "Dealer fee transfer failed");
            totalFeesCollected += fee;
            emit DealerFeeCollected(gameId, dealerAddress, fee);
        }

        // Send remainder to winner
        (bool sent, ) = winner.call{value: winnerPayout}("");
        require(sent, "Payout failed");
        emit PayoutDistributed(gameId, winner, winnerPayout);
    }

    function distributeSplitPot(
        uint256 gameId,
        address player1,
        address player2
    ) external onlyAuthorized nonReentrant {
        uint256 pot = gamePots[gameId];
        require(pot > 0, "No pot to split");
        gamePots[gameId] = 0;

        uint256 fee = _calculateFee(pot);
        uint256 netPot = pot - fee;

        // Send fee to dealer
        if (fee > 0 && dealerAddress != address(0)) {
            (bool feeSent, ) = dealerAddress.call{value: fee}("");
            require(feeSent, "Dealer fee transfer failed");
            totalFeesCollected += fee;
            emit DealerFeeCollected(gameId, dealerAddress, fee);
        }

        // Split remainder
        uint256 half = netPot / 2;
        (bool sent1, ) = player1.call{value: half}("");
        require(sent1, "Split payout 1 failed");
        (bool sent2, ) = player2.call{value: netPot - half}("");
        require(sent2, "Split payout 2 failed");
        emit PayoutDistributed(gameId, player1, half);
        emit PayoutDistributed(gameId, player2, netPot - half);
    }

    // ============ Refunds ============

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

    // ============ View ============

    function getDealerInfo() external view returns (
        address _dealer,
        uint256 _feeBps,
        uint256 _totalCollected
    ) {
        return (dealerAddress, dealerFeeBps, totalFeesCollected);
    }

    // ============ Internal ============

    function _calculateFee(uint256 amount) internal view returns (uint256) {
        if (dealerFeeBps == 0 || dealerAddress == address(0)) return 0;
        return (amount * dealerFeeBps) / 10000;
    }

    receive() external payable {}
}
