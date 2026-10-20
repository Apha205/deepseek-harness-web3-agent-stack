/**
 * Haven-AOL holding attestation: canister-signed membership receipts for
 * media records (`payload.attn`, the haven-dapp single shape).
 *
 * Sourcing rules (same as aol.ts, do not break):
 * - The EIP-712 `AttestRequest` type and digest are byte-identical to
 *   Fairhaven/Redhaven `board-core`/`vote-core` `attest.ts`
 *   (`attestRequestDigest`): domain `HavenAOL`, NO `version` field,
 *   `AttestRequest(address evmAddress,bytes32 cidHash,uint256 nonce)`.
 * - The Candid shapes are copied from `src/backend/backend.did`
 *   (`AttestRequest` / `AttestResult`, same records dsh-board hand-writes),
 *   following this package's IDL-factory pattern. Upstream to the haven-aol
 *   SDK when convenient; until then they live here.
 * - The receipt shape is haven-cli's single-CID attestation
 *   (`attest_holding` in `haven_cli/services/haven_aol_icp.py`), which is
 *   what Fairhaven/Redhaven lenses verify for `haven.*` media records
 *   (`verifyHavenAttestation`, bound to the record's `sha256_ct`).
 *
 * The canister only binds the caller-chosen `cidHash`. For media records
 * that is ALWAYS the record's `sha256_ct` (sha256 hex of the root locator
 * string, haven-cli `_request_attestation` precedent) — never the
 * Fairhaven member `cidHash` (per-member-per-epoch, board posts only).
 *
 * @module dsh-haven-aol/attest
 */

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { ActorMethod, ActorSubclass, HttpAgent } from '@icp-sdk/core/agent'
import { Actor } from '@icp-sdk/core/agent'
import { IDL } from '@icp-sdk/core/candid'
import { TypedDataEncoder } from 'ethers'
import type { Chain } from 'haven-aol'

// ── EIP-712 (fairhaven board-core compatible) ───────────────────────────

export const ATTEST_EIP712_NAME = 'HavenAOL'

export const ATTEST_EIP712_TYPES = {
  EIP712Domain: [
    { name: 'name', type: 'string' },
    { name: 'chainId', type: 'uint256' },
    { name: 'verifyingContract', type: 'address' },
  ],
  AttestRequest: [
    { name: 'evmAddress', type: 'address' },
    { name: 'cidHash', type: 'bytes32' },
    { name: 'nonce', type: 'uint256' },
  ],
} as const

export interface AttestDigestInput {
  evmAddress: string
  /** 64 lowercase hex (no 0x). */
  cidHash: string
  nonce: bigint
  eip712ChainId: bigint
  eip712VerifyingContract: string
}

/** EIP-712 digest the wallet signs raw (ethers, like eth_account). */
export function attestRequestDigest(input: AttestDigestInput): `0x${string}` {
  const { EIP712Domain: _omit, ...types } = ATTEST_EIP712_TYPES
  return TypedDataEncoder.hash(
    { name: ATTEST_EIP712_NAME, chainId: input.eip712ChainId, verifyingContract: input.eip712VerifyingContract } as never,
    types as never,
    { evmAddress: input.evmAddress, cidHash: `0x${input.cidHash}`, nonce: input.nonce } as never,
  ) as `0x${string}`
}

// ── Candid (backend.did AttestRequest/AttestResult) ──────────────────────

const ChainVariant = IDL.Variant({
  EthMainnet: IDL.Null,
  EthSepolia: IDL.Null,
  ArbitrumOne: IDL.Null,
  BaseMainnet: IDL.Null,
  OptimismMainnet: IDL.Null,
})

const AttestRequestType = IDL.Record({
  chain: ChainVariant,
  tokenAddress: IDL.Text,
  threshold: IDL.Nat,
  cidHash: IDL.Text,
  evmAddress: IDL.Text,
  nonce: IDL.Nat,
  signature: IDL.Vec(IDL.Nat8),
  eip712ChainId: IDL.Nat,
  eip712VerifyingContract: IDL.Text,
})

const AttestationType = IDL.Record({
  evmAddress: IDL.Text,
  chain: ChainVariant,
  tokenAddress: IDL.Text,
  threshold: IDL.Nat,
  balanceAtCheck: IDL.Nat,
  cidHash: IDL.Text,
  timestamp: IDL.Nat,
})

const AttestErrorVariant = IDL.Variant({
  InsufficientBalance: IDL.Record({ required: IDL.Nat, actual: IDL.Nat }),
  InvalidAddress: IDL.Text,
  InvalidThreshold: IDL.Null,
  EvmRpcError: IDL.Text,
  VetKDError: IDL.Text,
  InvalidSignature: IDL.Text,
  NonceAlreadyUsed: IDL.Null,
  InvalidEpoch: IDL.Null,
  MarketCapNotReached: IDL.Record({ required: IDL.Nat, actual: IDL.Nat }),
  InvalidOracle: IDL.Text,
})

const AttestResultVariant = IDL.Variant({
  ok: IDL.Record({ attestation: AttestationType, signature: IDL.Vec(IDL.Nat8) }),
  err: AttestErrorVariant,
})

interface AttestActor {
  attestHolding: ActorMethod<[Record<string, unknown>], { ok: { attestation: AttestHoldingOk['attestation']; signature: Uint8Array | number[] } } | { err: Record<string, unknown> }>
}

const idlFactoryAttest = () => IDL.Service({ attestHolding: IDL.Func([AttestRequestType], [AttestResultVariant], []) })

const actorCache = new WeakMap<HttpAgent, Map<string, ActorSubclass<AttestActor>>>()

function getAttestActor(agent: HttpAgent, canisterId: string): ActorSubclass<AttestActor> {
  let byCanister = actorCache.get(agent)
  if (!byCanister) {
    byCanister = new Map()
    actorCache.set(agent, byCanister)
  }
  let actor = byCanister.get(canisterId)
  if (!actor) {
    actor = Actor.createActor<AttestActor>(idlFactoryAttest, { agent, canisterId })
    byCanister.set(canisterId, actor)
  }
  return actor
}

export interface AttestHoldingParams {
  chain: Chain
  tokenAddress: string
  threshold: bigint
  /** 64 lowercase hex (no 0x): the record's sha256_ct for media records. */
  cidHash: string
  evmAddress: string
  nonce: bigint
  signature: Uint8Array
  eip712ChainId: bigint
  eip712VerifyingContract: string
}

/** Canister `#ok` payload, as decoded from Candid. */
export interface AttestHoldingOk {
  attestation: {
    evmAddress: string
    tokenAddress: string
    threshold: bigint
    balanceAtCheck: bigint
    cidHash: string
    timestamp: bigint
  }
  signature: Uint8Array
}

export type AttestFn = (
  agent: HttpAgent,
  canisterId: string,
  request: AttestHoldingParams,
) => Promise<{ ok: AttestHoldingOk } | { err: Record<string, unknown> }>

export async function liveAttestHolding(
  agent: HttpAgent,
  canisterId: string,
  request: AttestHoldingParams,
): Promise<{ ok: AttestHoldingOk } | { err: Record<string, unknown> }> {
  const actor = getAttestActor(agent, canisterId)
  const raw = await actor.attestHolding({
    chain: { [request.chain]: null },
    tokenAddress: request.tokenAddress,
    threshold: request.threshold,
    cidHash: request.cidHash,
    evmAddress: request.evmAddress,
    nonce: request.nonce,
    signature: request.signature,
    eip712ChainId: request.eip712ChainId,
    eip712VerifyingContract: request.eip712VerifyingContract,
  })
  if ('ok' in raw) {
    return {
      ok: {
        attestation: {
          evmAddress: raw.ok.attestation.evmAddress,
          tokenAddress: raw.ok.attestation.tokenAddress,
          threshold: BigInt(raw.ok.attestation.threshold),
          balanceAtCheck: BigInt(raw.ok.attestation.balanceAtCheck),
          cidHash: raw.ok.attestation.cidHash,
          timestamp: BigInt(raw.ok.attestation.timestamp),
        },
        signature: new Uint8Array(raw.ok.signature),
      },
    }
  }
  return { err: (raw as { err: Record<string, unknown> }).err }
}

// ── Result shape (haven-cli single-CID attestation, payload-ready) ───────

/** `payload.attn` for Haven media records (Fairhaven `HavenSingleAttestation`). */
export interface HavenSingleAttestation {
  evmAddress: string
  chain: string
  tokenAddress: string
  /** Decimal string, raw token units. */
  threshold: string
  /** Decimal string, raw token units. */
  balanceAtCheck: string
  /** 64 lowercase hex: the record's sha256_ct. */
  cidHash: string
  /** Unix seconds. */
  timestamp: number
  /** Canister Ed25519 signature, 64 bytes bare lowercase hex. */
  signature: string
}

const HEX = '0123456789abcdef'

function toHex(bytes: Uint8Array): string {
  let out = ''
  for (const b of bytes) out += HEX[b >> 4]! + HEX[b & 15]!
  return out
}

/**
 * Turn the canister's answer into the receipt readers verify. Throws if
 * the canister echoed other fields than requested (fairhaven
 * `receiptFromAttestation` precedent).
 */
export function havenSingleAttestation(params: AttestHoldingParams, ok: AttestHoldingOk): HavenSingleAttestation {
  const a = ok.attestation
  if (a.cidHash.toLowerCase().replace(/^0x/, '') !== params.cidHash.toLowerCase()) {
    throw new Error('dsh-haven-aol: canister bound a different cidHash')
  }
  if (a.evmAddress.toLowerCase() !== params.evmAddress.toLowerCase()) {
    throw new Error('dsh-haven-aol: canister attested a different address')
  }
  if (a.tokenAddress.toLowerCase() !== params.tokenAddress.toLowerCase() || a.threshold !== params.threshold) {
    throw new Error('dsh-haven-aol: canister attested a different gate')
  }
  if (ok.signature.length !== 64) throw new Error('dsh-haven-aol: canister attestation signature is not 64 bytes')
  return {
    evmAddress: params.evmAddress,
    chain: params.chain,
    tokenAddress: params.tokenAddress,
    threshold: params.threshold.toString(),
    balanceAtCheck: a.balanceAtCheck.toString(),
    cidHash: params.cidHash.toLowerCase(),
    timestamp: Number(a.timestamp),
    signature: toHex(ok.signature),
  }
}

/**
 * Durable receipt ledger: canister attest calls are expensive (update call
 * + the canister's own EVM balance check), so a minted receipt is NEVER
 * re-minted for the same record. The ledger key is the full binding —
 * (chain, token, threshold, cidHash) — and a hit returns the stored
 * receipt with no signature and no canister call.
 *
 * Reuse here is CORRECT, not a replay hole: the stored receipt binds
 * exactly the record being attested (same cidHash), so reader binding
 * holds. A repeat call for the same record replays the identical receipt;
 * a call for another record (another cidHash) misses and mints.
 *
 * Conventions follow the keyStore house pattern (small persisted state):
 * - Versioned JSON: `{ version: 1, receipts: [...] }`.
 * - Load is best-effort: missing/corrupt starts empty (and logs), never
 *   blocks attesting. Invalid entries are skipped individually; entries
 *   older than one epoch past mint are pruned (readers stop trusting
 *   them, so keeping them would serve unvalidatable receipts).
 * - Saves are atomic (tmp + rename), file created 0600, parents made
 *   recursively. A failed save degrades to memory-only for that call —
 *   the minted receipt is still returned (it is valid; only the reuse
 *   is lost).
 * - Merge-on-save: re-read + union with memory before every write,
 *   first-persisted-wins per slot. Callers must pass their in-memory
 *   hits along so concurrent runtimes do not drop each other's receipts
 *   last-writer-wins.
 *
 * Honest bound: a mint whose RESPONSE is lost (crash between canister
 * accept and ledger save) re-mints on retry — the canister has no
 * idempotency key (nonces are single-use by design). Duplicates are
 * therefore possible only on response-loss races, never on plain
 * retries, restarts, or agent double-calls.
 */

/** Receipt reliance horizon: one Haven-AOL epoch (30 days). */
export const RECEIPT_LEDGER_TTL_SECONDS = 2592000

export const RECEIPT_LEDGER_VERSION = 1

/** Ledger slot: the full receipt binding (lowercased, exact). */
export function receiptSlot(chain: string, tokenAddress: string, threshold: string, cidHash: string): string {
  return `${chain}|${tokenAddress.toLowerCase()}|${threshold}|${cidHash.toLowerCase()}`
}

interface StoredReceipt {
  slot: string
  receipt: HavenSingleAttestation
}

interface StoredLedger {
  version: number
  receipts: StoredReceipt[]
}

function isStoredReceipt(x: unknown): x is StoredReceipt {
  if (typeof x !== 'object' || x === null) return false
  const r = (x as StoredReceipt).receipt
  if (typeof (x as StoredReceipt).slot !== 'string' || typeof r !== 'object' || r === null) return false
  return typeof r.evmAddress === 'string' && typeof r.chain === 'string'
    && typeof r.tokenAddress === 'string' && typeof r.threshold === 'string'
    && typeof r.balanceAtCheck === 'string' && typeof r.cidHash === 'string'
    && typeof r.timestamp === 'number' && typeof r.signature === 'string'
}

/** Load the ledger, best-effort. Expired and invalid entries are dropped. */
export async function loadReceiptLedger(path: string, nowUnix: number): Promise<Map<string, HavenSingleAttestation>> {
  const out = new Map<string, HavenSingleAttestation>()
  let parsed: unknown
  try {
    parsed = JSON.parse(await readFile(path, 'utf8'))
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT') {
      console.log(`[dsh-haven-aol] receipt ledger unreadable (${path}), starting empty`)
    }
    return out
  }
  const receipts = (parsed as Partial<StoredLedger>).receipts
  if (!Array.isArray(receipts)) {
    console.log(`[dsh-haven-aol] receipt ledger corrupt (${path}), starting empty`)
    return out
  }
  for (const entry of receipts) {
    if (!isStoredReceipt(entry)) continue
    if (nowUnix - entry.receipt.timestamp > RECEIPT_LEDGER_TTL_SECONDS) continue
    if (!out.has(entry.slot)) out.set(entry.slot, entry.receipt)
  }
  return out
}

/**
 * Merge memory hits into the file ledger and save atomically (0600).
 * First-persisted-wins per slot; the merged map is returned so the caller
 * can serve the file's receipt on conflict (same binding either way).
 */
export async function saveReceiptLedger(
  path: string,
  memory: Map<string, HavenSingleAttestation>,
  nowUnix: number,
): Promise<Map<string, HavenSingleAttestation>> {
  const merged = await loadReceiptLedger(path, nowUnix)
  for (const [slot, receipt] of memory) {
    if (!merged.has(slot)) merged.set(slot, receipt)
  }
  const file: StoredLedger = {
    version: RECEIPT_LEDGER_VERSION,
    receipts: [...merged.entries()].map(([slot, receipt]) => ({ slot, receipt })),
  }
  try {
    await mkdir(dirname(path), { recursive: true })
    const tmp = join(dirname(path), `.receipts.${Date.now()}.${Math.floor(Math.random() * 1e9)}.tmp`)
    await writeFile(tmp, JSON.stringify(file), { mode: 0o600 })
    await rename(tmp, path)
  } catch (error: unknown) {
    console.log(`[dsh-haven-aol] receipt ledger save failed (${path}), memory-only: ${error instanceof Error ? error.message : String(error)}`)
  }
  return merged
}

/** Human-readable canister refusal (fairhaven `describeAttestError` precedent). */
export function describeAttestError(err: Record<string, unknown>): string {
  if ('InsufficientBalance' in err) {
    const e = err.InsufficientBalance as { required: bigint; actual: bigint }
    return `wallet holds ${e.actual.toString()} of the ${e.required.toString()} required`
  }
  if ('EvmRpcError' in err) return `canister could not read the gate chain (${String(err.EvmRpcError)})`
  if ('InvalidSignature' in err) return `canister rejected the wallet signature (${String(err.InvalidSignature)})`
  if ('NonceAlreadyUsed' in err) return 'nonce reused'
  const k = Object.keys(err)[0] ?? 'unknown'
  return `canister refused: ${k}${typeof err[k] === 'string' ? ` (${err[k] as string})` : ''}`
}
