/**
 * The `exactlyOnce` session projection: durable repeat evidence for the
 * exactly-once guard, folded from committed `tool/call` + `tool/result`
 * events instead of rescanning the log.
 *
 * State is host-only (no `wire` block): the guard reads it through
 * `handle.stateOf(session)`; clients never see it. The fold tracks only
 * tools the guard selects, so `last` grows with distinct guarded-write
 * identities — the same bound the in-memory outcome map already carries —
 * while `calls` holds only unsettled write calls and drains on each
 * `tool/result`. A `user/message` whose source kind is `user` (a human
 * interjection, never a compaction checkpoint or injected context) clears
 * `last`, matching `resetAgent`: repetition across an interjection is a new
 * intent, not a retry.
 *
 * @module dsh-exactly-once/projection
 */

import { z as zod } from 'zod'
import type { ZodType } from 'zod'
import type { ProjectionDefinition } from '@deepseek-ai/dsh-session-projection'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { canonicalize } from './canonical.ts'

/** One unsettled guarded write call, keyed by `callId`. */
export interface PendingCall {
  readonly name: string
  readonly argsKey: string
}

/** Last settled outcome of one (tool, canonical-args) identity within a session. */
export interface OutcomeRecord {
  readonly isError: boolean
  readonly code: string | null
  readonly at: number
}

/** Projection state: pending write calls plus last outcomes. Plain JSON. */
export interface RepeatEvidence {
  readonly calls: Record<string, PendingCall>
  readonly last: Record<string, OutcomeRecord>
}

const pendingCallSchema = zod.object({
  name: zod.string(),
  argsKey: zod.string(),
})

const outcomeSchema = zod.object({
  isError: zod.boolean(),
  code: zod.string().nullable(),
  at: zod.number(),
})

const repeatEvidenceSchema: ZodType<RepeatEvidence> = zod.object({
  calls: zod.record(zod.string(), pendingCallSchema),
  last: zod.record(zod.string(), outcomeSchema),
})

/**
 * Parse model arguments exactly as the tool batch does before dispatch
 * (`JSON.parse`, `{}` for empty input, the raw string on parse failure), so
 * projection identities match the wrapper's `exec.arguments` keys.
 */
function parseArguments(raw: string): unknown {
  try {
    return raw ? JSON.parse(raw) : {}
  } catch (_error: unknown) {
    // Preserve malformed model input for tool-owned argument diagnostics.
    return raw
  }
}

/** Identity of one retry chain inside a session: tool name + canonical args. */
function outcomeKey(name: string, argsKey: string): string {
  return `${name}|${argsKey}`
}

/**
 * The synchronous fold. Unrelated events return the same state reference;
 * every returned state is plain JSON the schema accepts.
 */
function applyRepeatEvidence(
  state: RepeatEvidence,
  event: SessionEvent,
  isWrite: (name: string) => boolean,
): RepeatEvidence {
  if (event.type === 'tool/call') {
    const { callId, name, arguments: raw } = event.data
    if (!isWrite(name)) return state
    const argsKey = canonicalize(parseArguments(raw))
    const key = String(callId)
    const pending = state.calls[key]
    if (pending !== undefined && pending.name === name && pending.argsKey === argsKey) return state
    return { ...state, calls: { ...state.calls, [key]: { name, argsKey } } }
  }
  if (event.type === 'tool/result') {
    const { message, error } = event.data
    const callId = String(message.toolCallId)
    const pending = state.calls[callId]
    if (pending === undefined) return state
    const { [callId]: _settled, ...calls } = state.calls
    return {
      calls,
      last: {
        ...state.last,
        [outcomeKey(pending.name, pending.argsKey)]: {
          isError: message.isError === true,
          code: error?.code ?? null,
          at: event.time,
        },
      },
    }
  }
  if (event.type === 'user/message' && event.data.source.kind === 'user') {
    if (Object.keys(state.last).length === 0) return state
    return { calls: state.calls, last: {} }
  }
  return state
}

/**
 * Build the repeat-evidence unit for one guard configuration.
 * @param isWrite - the guard's write/exempt predicate; only selected tools
 *   enter the fold, keeping `last` bounded by guarded-write identities.
 * @returns the host-only projection definition.
 */
export function repeatEvidenceDefinition(
  isWrite: (name: string) => boolean,
): ProjectionDefinition<'exactlyOnce', RepeatEvidence> {
  return {
    key: 'exactlyOnce',
    stateSchema: repeatEvidenceSchema,
    stateVersion: 1,
    init: () => ({ calls: {}, last: {} }),
    apply: (state, event) => applyRepeatEvidence(state, event, isWrite),
  }
}
