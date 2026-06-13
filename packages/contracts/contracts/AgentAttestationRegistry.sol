// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title AgentAttestationRegistry
/// @notice On-chain commitment log for MantleAgents agent decision/outcome
/// attestations. Each entry anchors an off-chain attestation (computed in
/// apps/api/src/services/attestation-service.ts) to Mantle via a content
/// hash, giving judges a permanent, queryable on-chain record per the
/// Turing Test Hackathon's "on-chain agent benchmarking" requirement.
///
/// This is intentionally minimal (append-only event log + read-back
/// mappings) — full verification logic stays off-chain; this contract is
/// the verifiable anchor.
contract AgentAttestationRegistry {
    /// @param agentId    ERC-8004 agent NFT id (IdentityRegistry tokenId)
    /// @param runId      keccak256 hash of the off-chain run id (UUID/string)
    /// @param eventsHash sha256 (as bytes32) of the canonicalized timeline
    ///                    events for this run — must match the
    ///                    `eventsHash` field in the off-chain attestation
    ///                    payload so anyone can recompute and verify.
    /// @param decisionHash sha256 (as bytes32) of the decision input
    ///                     snapshot `{ signal, guardrailParams,
    ///                     marketDataSnapshot }` used for this run.
    /// @param tradeCount number of trade-type events in this run
    /// @param timestamp  block timestamp of the commit
    event AttestationCommitted(
        address indexed committer,
        uint256 indexed agentId,
        bytes32 indexed runId,
        bytes32 eventsHash,
        bytes32 decisionHash,
        uint256 tradeCount,
        uint256 timestamp
    );

    struct Attestation {
        bytes32 eventsHash;
        bytes32 decisionHash;
        uint64 tradeCount;
        uint64 timestamp;
        bool exists;
    }

    /// agentId => runId => Attestation
    mapping(uint256 => mapping(bytes32 => Attestation)) public attestations;

    /// agentId => list of runIds committed (for enumeration)
    mapping(uint256 => bytes32[]) public agentRunIds;

    error AlreadyCommitted();

    /// @notice Commit an attestation for a given agent + run.
    /// @dev No access control: any address can commit on behalf of an
    /// agentId. The attestation is only meaningful in conjunction with the
    /// off-chain signed payload (HMAC, see attestation-service.ts) — this
    /// just provides the immutable on-chain timestamp + hash anchor.
    function commitAttestation(
        uint256 agentId,
        bytes32 runId,
        bytes32 eventsHash,
        bytes32 decisionHash,
        uint64 tradeCount
    ) external {
        Attestation storage existing = attestations[agentId][runId];
        if (existing.exists) revert AlreadyCommitted();

        attestations[agentId][runId] = Attestation({
            eventsHash: eventsHash,
            decisionHash: decisionHash,
            tradeCount: tradeCount,
            timestamp: uint64(block.timestamp),
            exists: true
        });
        agentRunIds[agentId].push(runId);

        emit AttestationCommitted(
            msg.sender,
            agentId,
            runId,
            eventsHash,
            decisionHash,
            tradeCount,
            block.timestamp
        );
    }

    function getAttestation(uint256 agentId, bytes32 runId)
        external
        view
        returns (
            bytes32 eventsHash,
            bytes32 decisionHash,
            uint64 tradeCount,
            uint64 timestamp,
            bool exists
        )
    {
        Attestation storage a = attestations[agentId][runId];
        return (a.eventsHash, a.decisionHash, a.tradeCount, a.timestamp, a.exists);
    }

    function getRunCount(uint256 agentId) external view returns (uint256) {
        return agentRunIds[agentId].length;
    }

    function getRunIdAt(uint256 agentId, uint256 index) external view returns (bytes32) {
        return agentRunIds[agentId][index];
    }
}
