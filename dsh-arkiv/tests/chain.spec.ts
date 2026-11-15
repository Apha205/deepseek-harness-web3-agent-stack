/**
 * Chain-resolution proofs for dsh-arkiv.
 *
 * The backend used to import `cheesecake`/`arkiv` from
 * @arkiv-network/sdk/chains, which the SDK did not export — every real
 * call built a client with an undefined chain. These specs pin the
 * resolver against the real SDK exports: no chain, no network.
 * SDK 1.x ships `rabdi` (testnet, access-key gated function) +
 * `localhost` — there is no mainnet export.
 */

import { describe, expect, it } from 'vitest'
import { resolveChainForRpcUrl } from '../src/arkiv.ts'

describe('arkiv chain resolution', () => {
  it('resolves the real rabdi export for testnet URLs', async () => {
    const chains = await import('@arkiv-network/sdk/chains')
    expect(chains).toHaveProperty('rabdi')
    const chain = resolveChainForRpcUrl('https://rpc.rabdi.db-chain.testnet.arkiv.network', chains, '')
    expect(chain.id).toBe(7794095)
  })

  it('resolves localhost for loopback URLs', async () => {
    const chains = await import('@arkiv-network/sdk/chains')
    expect(resolveChainForRpcUrl('http://localhost:8545', chains, '').id).toBe(1337)
    expect(resolveChainForRpcUrl('http://127.0.0.1:8545', chains, '').id).toBe(1337)
  })

  it('refuses mainnet URLs without a mainnet chain in the SDK', async () => {
    const chains = await import('@arkiv-network/sdk/chains')
    expect(() => resolveChainForRpcUrl('https://rpc.mainnet.arkiv.network', chains, '')).toThrow('no mainnet chain')
  })
})
