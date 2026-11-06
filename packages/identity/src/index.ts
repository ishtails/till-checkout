import { createPublicClient, defineChain, hexToString, http, isAddressEqual, parseAbi, type Address } from "viem"

// The agent's identity: an ERC-8004 entry in the Identity Registry already deployed on Hedera
// testnet. The entry is an NFT held by the agent's owner, and it names the wallet the agent pays
// from (set with that wallet's own signature, so no one can claim someone else's wallet). A
// merchant who gets paid can check the payer against it: "agent #N, owned by 0x…".
// Spec: https://eips.ethereum.org/EIPS/eip-8004 · contracts: github.com/erc-8004/erc-8004-contracts

export const hederaTestnet = defineChain({
  id: 296,
  name: "Hedera Testnet",
  nativeCurrency: { name: "HBAR", symbol: "HBAR", decimals: 18 },
  rpcUrls: { default: { http: ["https://testnet.hashio.io/api"] } },
  blockExplorers: { default: { name: "HashScan", url: "https://hashscan.io/testnet" } },
})

/** ERC-8004 IdentityRegistry on Hedera testnet (contract 0.0.7919997). */
export const IDENTITY_REGISTRY: Address = "0x8004A818BFB912233c491871b3d84c89A494BD9e"
/** How the registry is named in payloads and docs: CAIP-10 style, chain then contract. */
export const REGISTRY_ID = `eip155:${hederaTestnet.id}:${IDENTITY_REGISTRY}`
/** The key the agent's identity travels under in an x402 payment payload's `extensions`. */
export const EXTENSION_KEY = "erc8004"

export type AgentClaim = { registry: string; agentId: string }

export const identityAbi = parseAbi([
  "struct MetadataEntry { string metadataKey; bytes metadataValue; }",
  "function register(string agentURI, MetadataEntry[] metadata) returns (uint256 agentId)",
  "function setAgentWallet(uint256 agentId, address newWallet, uint256 deadline, bytes signature)",
  "function getAgentWallet(uint256 agentId) view returns (address)",
  "function getMetadata(uint256 agentId, string metadataKey) view returns (bytes)",
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function tokenURI(uint256 tokenId) view returns (string)",
  "event Registered(uint256 indexed agentId, string agentURI, address indexed owner)",
])

/** What the agent's wallet signs so the owner can set it as the agent's wallet (EIP-712). */
export const agentWalletTypedData = (agentId: bigint, newWallet: Address, owner: Address, deadline: bigint) =>
  ({
    domain: { name: "ERC8004IdentityRegistry", version: "1", chainId: hederaTestnet.id, verifyingContract: IDENTITY_REGISTRY },
    types: {
      AgentWalletSet: [
        { name: "agentId", type: "uint256" },
        { name: "newWallet", type: "address" },
        { name: "owner", type: "address" },
        { name: "deadline", type: "uint256" },
      ],
    },
    primaryType: "AgentWalletSet",
    message: { agentId, newWallet, owner, deadline },
  }) as const

export const registryClient = () => createPublicClient({ chain: hederaTestnet, transport: http() })

export type AgentIdentity = {
  agentId: string
  owner: Address
  wallet: Address
  hcsTopic?: string
  hederaAccount?: string
  registry: string
  explorerUrl: string
}

const text = (hex: `0x${string}`) => (hex === "0x" ? undefined : hexToString(hex))

/** Reads an agent's entry from the registry: owner, the wallet it pays from, and its log topic. */
export async function readAgent(agentId: string | bigint): Promise<AgentIdentity> {
  const client = registryClient()
  const id = BigInt(agentId)
  const [owner, wallet, topic, account] = await Promise.all([
    client.readContract({ address: IDENTITY_REGISTRY, abi: identityAbi, functionName: "ownerOf", args: [id] }),
    client.readContract({ address: IDENTITY_REGISTRY, abi: identityAbi, functionName: "getAgentWallet", args: [id] }),
    client.readContract({ address: IDENTITY_REGISTRY, abi: identityAbi, functionName: "getMetadata", args: [id, "hcsTopic"] }),
    client.readContract({ address: IDENTITY_REGISTRY, abi: identityAbi, functionName: "getMetadata", args: [id, "hederaAccount"] }),
  ])
  return {
    agentId: id.toString(),
    owner,
    wallet,
    hcsTopic: text(topic),
    hederaAccount: text(account),
    registry: REGISTRY_ID,
    explorerUrl: `https://hashscan.io/testnet/contract/${IDENTITY_REGISTRY}`,
  }
}

/**
 * Checks a payment's claimed identity: the payer must be the agent's registered wallet (on
 * Whitechain) or its registered Hedera account. Returns the agent's entry if it checks out.
 * The claim itself is unsigned; what makes it trustworthy is that the registry entry was set
 * with the payer's own signature.
 */
export async function verifyPayer(claim: AgentClaim, network: string, payer: string): Promise<AgentIdentity | undefined> {
  if (claim.registry.toLowerCase() !== REGISTRY_ID.toLowerCase() || !/^\d+$/.test(claim.agentId)) return undefined
  const agent = await readAgent(claim.agentId)
  const ok = network.startsWith("eip155:")
    ? /^0x[0-9a-fA-F]{40}$/.test(payer) && isAddressEqual(agent.wallet, payer as Address)
    : agent.hederaAccount === payer
  return ok ? agent : undefined
}

/** Till's research agent, registered by apps/agent/scripts/identity-register.ts (6 Nov 2026). */
export const RESEARCH_AGENT_ID = "154"
