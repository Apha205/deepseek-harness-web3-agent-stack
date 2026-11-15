/**
 * Arkiv entity schemas for Haven writes — SDK 1.x `defineSchema` declarations.
 *
 * Three schemas cover the three wire shapes `validateHavenWrite` produces:
 * - `HavenFullSchema` — full/generic groups (video, audio, image, text, file, custom)
 * - `HavenSeriesSchema` — drip series headers
 * - `HavenPartSchema` — drip parts
 *
 * `payload` and `content_type` are ordinary columns — SDK 1.x has no system
 * payload/contentType fields; they are just `bytes` and `str` attributes.
 *
 * Column types follow the workspace wire convention (see haven-dapp
 * `lib/arkiv-attrs`): comparisons are type-exact, so every writer stores
 * the same attribute under the same type — strings as `str`, counts as
 * `i32`, token thresholds as `u256`. SDK 1.0.1 exposes no `bytes32`
 * column, and `series_ref`, `gate_token` and `sha256_ct` are `str` on
 * every Haven surface (the Python CLI can only write `str`/`int`).
 */

import { defineSchema, str, i32, u256, bytes, type Schema } from '@arkiv-network/sdk/schema';

/** Full/generic groups: video, audio, image, text, file, custom dot hierarchies. */
export const HavenFullSchema: Schema = defineSchema('haven-full', {
  grp: str().indexed(),
  title: str(),
  gate_type: i32().optional(),
  gate_token: str().optional(),
  gate_chain: i32().optional(),
  gate_threshold: u256().optional(),
  gate_epoch: i32().optional(),
  sha256_ct: str().indexed(),
  mime: i32().optional(),
  dur_s: i32().optional(),
  payload: bytes(),
  content_type: str(),
});

/** Drip series headers: `haven.video.drip.series`. */
export const HavenSeriesSchema: Schema = defineSchema('haven-series', {
  grp: str().indexed(),
  title: str(),
  gate_type: i32(),
  gate_token: str(),
  gate_chain: i32(),
  gate_threshold: u256(),
  drip_id: str().indexed(),
  drip_total: i32(),
  payload: bytes(),
  content_type: str(),
});

/** Drip parts: `haven.video.drip.part`. */
export const HavenPartSchema: Schema = defineSchema('haven-part', {
  grp: str().indexed(),
  gate_type: i32(),
  drip_id: str().indexed(),
  drip_idx: i32(),
  series_ref: str().indexed(),
  mcap_usd: i32(),
  sha256_ct: str().indexed(),
  payload: bytes(),
  content_type: str(),
});

/** Pick the schema for a normalized write's `grp` value. */
export function schemaForGrp(grp: string): Schema {
  if (grp === 'haven.video.drip.series') return HavenSeriesSchema;
  if (grp === 'haven.video.drip.part') return HavenPartSchema;
  return HavenFullSchema;
}
