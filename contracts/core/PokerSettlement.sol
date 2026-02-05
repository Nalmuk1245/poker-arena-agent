// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title PokerSettlement
 * @notice Batch settlement for off-chain poker games.
 *         Game logic runs off-chain; results are batch-recorded on-chain
 *         for transparency and auditability.
 */
contract PokerSettlement {
    struct HandSummary {
        uint32 handNumber;
        address[] winners;
        uint256[] amounts;
        bytes32 actionLogHash;
    }

    struct Session {
        bytes32 sessionId;
        uint32 totalHands;
        uint64 startTime;
        uint64 endTime;
        bool settled;
    }

    struct PlayerStats {
        uint256 totalHands;
        uint256 totalWon;
        uint256 totalLost;
    }

    // Storage
    mapping(bytes32 => Session) public sessions;
    mapping(bytes32 => mapping(uint32 => HandSummary)) private handSummaries;
    mapping(address => PlayerStats) public playerStats;

    address public owner;
    mapping(address => bool) public authorizedServers;

    // Events
    event SessionSettled(bytes32 indexed sessionId, uint32 totalHands, bytes32 merkleRoot);
    event HandRecorded(bytes32 indexed sessionId, uint32 handNumber, address[] winners);
    event ServerAuthorized(address indexed server);
    event ServerRevoked(address indexed server);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    modifier onlyAuthorized() {
        require(authorizedServers[msg.sender] || msg.sender == owner, "Not authorized");
        _;
    }

    constructor() {
        owner = msg.sender;
        authorizedServers[msg.sender] = true;
    }

    // ============ Admin ============

    function authorizeServer(address server) external onlyOwner {
        authorizedServers[server] = true;
        emit ServerAuthorized(server);
    }

    function revokeServer(address server) external onlyOwner {
        authorizedServers[server] = false;
        emit ServerRevoked(server);
    }

    // ============ Settlement ============

    /**
     * @notice Settle a batch of hands from an off-chain session.
     * @param sessionId Unique session identifier (keccak256 of roomId + timestamp)
     * @param handNumbers Array of hand numbers in this batch
     * @param winners Array of winner address arrays (one per hand)
     * @param amounts Array of amount arrays (one per hand, matching winners)
     * @param actionLogHashes Array of action log hashes (one per hand)
     * @param players All players who participated
     * @param chipDeltas Net profit/loss per player (signed, encoded as int256)
     * @param merkleRoot Merkle root of all action logs for verifiability
     */
    function settleSession(
        bytes32 sessionId,
        uint32[] calldata handNumbers,
        address[][] calldata winners,
        uint256[][] calldata amounts,
        bytes32[] calldata actionLogHashes,
        address[] calldata players,
        int256[] calldata chipDeltas,
        bytes32 merkleRoot
    ) external onlyAuthorized {
        require(!sessions[sessionId].settled, "Session already settled");
        require(handNumbers.length > 0, "No hands to settle");
        require(handNumbers.length == winners.length, "Length mismatch: winners");
        require(handNumbers.length == amounts.length, "Length mismatch: amounts");
        require(handNumbers.length == actionLogHashes.length, "Length mismatch: hashes");
        require(players.length == chipDeltas.length, "Length mismatch: deltas");

        uint32 totalHands = uint32(handNumbers.length);

        // Record session
        sessions[sessionId] = Session({
            sessionId: sessionId,
            totalHands: totalHands,
            startTime: uint64(block.timestamp),
            endTime: uint64(block.timestamp),
            settled: true
        });

        // Record each hand summary
        for (uint256 i = 0; i < totalHands; i++) {
            handSummaries[sessionId][handNumbers[i]] = HandSummary({
                handNumber: handNumbers[i],
                winners: winners[i],
                amounts: amounts[i],
                actionLogHash: actionLogHashes[i]
            });
            emit HandRecorded(sessionId, handNumbers[i], winners[i]);
        }

        // Update per-player cumulative stats
        for (uint256 i = 0; i < players.length; i++) {
            playerStats[players[i]].totalHands += totalHands;
            if (chipDeltas[i] > 0) {
                playerStats[players[i]].totalWon += uint256(chipDeltas[i]);
            } else if (chipDeltas[i] < 0) {
                playerStats[players[i]].totalLost += uint256(-chipDeltas[i]);
            }
        }

        emit SessionSettled(sessionId, totalHands, merkleRoot);
    }

    // ============ View ============

    function getSession(bytes32 sessionId) external view returns (Session memory) {
        return sessions[sessionId];
    }

    function getHandSummary(bytes32 sessionId, uint32 handNumber) external view returns (
        uint32,
        address[] memory,
        uint256[] memory,
        bytes32
    ) {
        HandSummary storage h = handSummaries[sessionId][handNumber];
        return (h.handNumber, h.winners, h.amounts, h.actionLogHash);
    }

    function getPlayerStats(address player) external view returns (
        uint256 totalHands,
        uint256 totalWon,
        uint256 totalLost
    ) {
        PlayerStats storage s = playerStats[player];
        return (s.totalHands, s.totalWon, s.totalLost);
    }
}
