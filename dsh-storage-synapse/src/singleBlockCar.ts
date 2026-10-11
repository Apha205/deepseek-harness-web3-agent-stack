/**
 * Single-block CAR packing for every store.
 *
 * Port of haven-cli `js-services/single-block-car.ts` (`packSingleBlockCar`
 * byte-for-byte: CARv1 header with tag-42 + multibase-identity-prefixed
 * root, one raw-codec frame). One deliberate deviation: haven-cli packs
 * single-block only at or under 32 MiB and chunked-UnixFS above. The
 * chunked shape cannot play on current readers — the CAR header's
 * tag-42-wrapped dag-pb root fails their root check ("Nested CAR
 * container: only flat raw-leaf pieces are supported") — while the
 * single-block shape strips and decrypts at any size. So every store
 * packs single-block, no threshold. Node-native (sync SHA-256, no Deno).
 *
 * @module dsh-storage-synapse/singleBlockCar
 */

import { createHash } from 'node:crypto'
import { CID } from 'multiformats/cid'

/** Unsigned LEB128 (varint) encoding used by CARv1 length prefixes. */
export function encodeVarint(value: number): Uint8Array {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`dsh-storage-synapse: encodeVarint expects a non-negative safe integer, got ${value}`)
  }
  const out: number[] = []
  let v = value
  do {
    let b = v % 128
    v = Math.floor(v / 128)
    if (v > 0) b |= 0x80
    out.push(b)
  } while (v > 0)
  return new Uint8Array(out)
}

// A2 map(2) | 65 "roots" | 81 array(1) | D8 2A tag(42) | 58 25 bytes(37) |
// 00 multibase-identity | 01 v1 | 55 raw | 12 20 sha2-256 32 B — then digest.
const HEADER_PREFIX = new Uint8Array([
  0xa2, 0x65, 0x72, 0x6f, 0x6f, 0x74, 0x73, 0x81,
  0xd8, 0x2a, 0x58, 0x25, 0x00, 0x01, 0x55, 0x12, 0x20,
])
// 67 "version" | 01.
const HEADER_SUFFIX = new Uint8Array([
  0x67, 0x76, 0x65, 0x72, 0x73, 0x69, 0x6f, 0x6e, 0x01,
])

/**
 * Pack bytes as a single-raw-block CARv1.
 * @returns the CAR bytes plus the root CID string (base32 CIDv1, raw codec, sha2-256).
 */
export function packSingleBlockCar(data: Uint8Array): { carBytes: Uint8Array; rootCid: string } {
  const digest = new Uint8Array(createHash('sha256').update(data).digest())
  // CIDv1 bytes: 0x01 (version) 0x55 (raw) 0x12 0x20 (sha2-256, 32 B) + digest.
  const cidBytes = new Uint8Array(4 + digest.length)
  cidBytes.set([0x01, 0x55, 0x12, 0x20], 0)
  cidBytes.set(digest, 4)
  const rootCid = CID.decode(cidBytes).toString()

  // CARv1 header: dag-cbor {roots: [cid], version: 1} (canonical key order:
  // "roots" before "version"). CID is tag 42 + 0x00-prefixed CID bytes.
  const headerBody = new Uint8Array(HEADER_PREFIX.length + digest.length + HEADER_SUFFIX.length)
  headerBody.set(HEADER_PREFIX, 0)
  headerBody.set(digest, HEADER_PREFIX.length)
  headerBody.set(HEADER_SUFFIX, HEADER_PREFIX.length + digest.length)

  const headerLen = encodeVarint(headerBody.length)
  const blockLen = encodeVarint(cidBytes.length + data.length)
  const carBytes = new Uint8Array(
    headerLen.length + headerBody.length + blockLen.length + cidBytes.length + data.length,
  )
  let o = 0
  carBytes.set(headerLen, o)
  o += headerLen.length
  carBytes.set(headerBody, o)
  o += headerBody.length
  carBytes.set(blockLen, o)
  o += blockLen.length
  carBytes.set(cidBytes, o)
  o += cidBytes.length
  carBytes.set(data, o)
  return { carBytes, rootCid }
}
