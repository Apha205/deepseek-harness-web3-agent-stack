/**
 * The exactly-once wrapper (`ctx.exactlyOnce`): a `tools/execute`
 * around-guard for write tools, shaped after timeout-policy.
 *
 * Three mechanisms, all model-invisible:
 *
 * 1. **Redelivery dedup by call identity.** The agent loop assigns one
 *    `callId` per model call block, so the same call dispatched twice
 *    shares `(agent, rootCallId, callId)` while a model retry is a new
 *    block. A repeat of an in-flight call attaches to it; a repeat of a
 *    settled call replays the recorded result. The tool body runs once.
 * 2. **Session ledger repeat evidence.** Canonical values are
 *    deliberately omitted from durable events, so settled successes
 *    cannot rebuild from the log — and need not: the harness never
 *    re-dispatches a settled callId after restart (repair closes
 *    dangling calls with synthetic `TOOL_OUTCOME_UNKNOWN` /
 *    `TOOL_NOT_STARTED` errors instead). What survives a restart is the
 *    repeat question, answered by the `exactlyOnce` session projection:
 *    last-outcome evidence per (tool, canonical arguments) folded
 *    incrementally from `tool/call` + `tool/result` events.
 * 3. **Repeat-after-ambiguous checks.** An exact `(agent, tool,
 *    canonical-args)` repeat following a non-success consults that
 *    tool's read-back hook when one is registered
 *    (`registerCheck`); without a hook the call dispatches and the
 *    attempt is recorded. Ambiguous errors (timeout, abort, unclassified
 *    throws — never validation errors, never denials, which bypass this
 *    stage) carry an attempt trailer so the model knows a retry of the
 *    exact call is ledger-checked first.
 *
 * Reads and unlisted tools pass straight through with zero tracking.
 *
 * @module dsh-exactly-once/guard
 */

import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import type { Session } from '@deepseek-ai/dsh-session'
import type { ToolDispatchExecution, ToolExecutionResult } from '@deepseek-ai/dsh-tools'
import { canonicalize } from './canonical.ts'
import type { OutcomeRecord } from './projection.ts'
import type { CheckCommittedFn, LastOutcome } from './types.ts'

/**
 * Error codes whose effects may already have committed: a retry must be
 * checked, never blind. `undefined` (an unclassified throw, which carries
 * no structured identity) counts as ambiguous too. Classified tool and
 * validation failures (`INVALID_ARGS`, treasury denials, `ACQUIRE_*`)
 * are never stamped.
 */
const AMBIGUOUS_CODES = new Set(['TOOL_TIMEOUT', 'ABORTED', 'ABORTED_BEFORE_DISPATCH'])

/** Options for {@link ExactlyOnceRuntime}. */
export interface GuardOptions {
  /** Compiled `*`-wildcard patterns selecting the guarded write tools. */
  readonly writes: readonly RegExp[]
  /** Compiled patterns fully transparent to the guard (neither deduped nor tracked). */
  readonly exempt: readonly RegExp[]
  /** Clock (tests pin this; production uses `Date.now`). */
  readonly now?: () => number
}

interface SettledEntry {
  readonly result: ToolExecutionResult
  readonly at: number
}

interface OutcomeEntry extends LastOutcome {
  readonly name: string
}

/** Reads one session's projected last-outcome records (`name|argsKey` → outcome). */
export type RepeatEvidenceReader = (session: Session) => Readonly<Record<string, OutcomeRecord>>

/** Lossless clone through JSON (results are lossless-JSON by contract). */
function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

/** The `ctx.exactlyOnce` seam: the wrapper plus the read-back registry. */
export class ExactlyOnceRuntime {
  private readonly writes: readonly RegExp[]
  private readonly exempt: readonly RegExp[]
  private readonly now: () => number
  private readonly checks = new Map<string, CheckCommittedFn>()
  private readonly inFlight = new Map<string, Promise<ToolExecutionResult>>()
  private readonly settled = new Map<string, SettledEntry>()
  private readonly outcomes = new Map<string, OutcomeEntry>()
  private readonly agentIds = new WeakMap<object, string>()
  private repeatEvidence: RepeatEvidenceReader | undefined
  private agentSeq = 0
  private attempts = 0

  constructor(options: GuardOptions) {
    this.writes = options.writes
    this.exempt = options.exempt
    this.now = options.now ?? Date.now
  }

  /** Whether a tool name is guarded (exempt wins over writes). */
  isWrite(name: string): boolean {
    if (this.exempt.some(pattern => pattern.test(name))) return false
    return this.writes.some(pattern => pattern.test(name))
  }

  /**
   * Register one tool's commit check, consulted before re-dispatching an
   * exact repeat that follows a non-success.
   * @param name - guarded tool name.
   * @param fn - the read-back hook.
   * @returns the disposer that unregisters the hook.
   */
  registerCheck(name: string, fn: CheckCommittedFn): () => void {
    this.checks.set(name, fn)
    return () => {
      if (this.checks.get(name) === fn) this.checks.delete(name)
    }
  }

  /**
   * Forget one agent's repeat chains. A user interjection starts a new
   * context; repetition across it is not a retry (repeat-tool-reminder
   * parity). In-flight and settled call records are untouched — redelivery
   * dedup must survive interjections.
   * @param agent - the agent scope whose chains reset.
   */
  resetAgent(agent: object): void {
    const id = this.agentIds.get(agent)
    if (id === undefined) return
    const prefix = `${id}|`
    for (const key of [...this.outcomes.keys()]) {
      if (key.startsWith(prefix)) this.outcomes.delete(key)
    }
  }

  /**
   * Guard one dispatch: attach, replay, check, or run.
   * @param exec - the pending write call (name, parsed arguments, caller agent).
   * @param next - the downstream pipeline (further wrappers, then the body).
   * @returns the dispatch outcome, possibly replayed without running the body.
   */
  async wrap(exec: ToolDispatchExecution, next: () => Promise<ToolExecutionResult>): Promise<ToolExecutionResult> {
    if (!this.isWrite(exec.name)) return next()
    const key = this.callKey(exec)
    const inflight = this.inFlight.get(key)
    if (inflight !== undefined) return inflight
    const prior = this.settled.get(key)
    if (prior !== undefined) return cloneJson(prior.result)
    const identity = this.identityKey(exec)
    const last = this.outcomes.get(identity) ?? this.coldLast(exec)
    if (last !== undefined && last.isError) {
      const hook = this.checks.get(exec.name)
      if (hook !== undefined) {
        const decision = await hook({ args: exec.arguments, callId: String(exec.callId), lastOutcome: last })
        if (decision.kind === 'replay') {
          // The value rides back through registry normalization, which
          // validates it against the tool's output schema and renders it;
          // wrapper-authored content would be discarded there anyway.
          const replayed: ToolExecutionResult = {
            content: [],
            isError: false,
            value: cloneJson(decision.value) as Exclude<ToolExecutionResult['value'], undefined>,
          }
          this.settled.set(key, { result: cloneJson(replayed), at: this.now() })
          this.outcomes.set(identity, { name: exec.name, isError: false, code: undefined, at: this.now() })
          return replayed
        }
        // 'proceed' and 'unknown' both dispatch: liveness wins and the
        // attempt is recorded below for the next repeat.
      }
    }
    let resolveAttempt!: (result: ToolExecutionResult) => void
    let rejectAttempt!: (error: unknown) => void
    const attempt = new Promise<ToolExecutionResult>((resolve, reject) => {
      resolveAttempt = resolve
      rejectAttempt = reject
    })
    // An unwaited rejection must never surface as unhandled: waiters attach
    // by awaiting the same promise, which remains legal alongside this sink.
    void attempt.catch(() => undefined)
    this.inFlight.set(key, attempt)
    try {
      const result = await next()
      const stamped = this.maybeStamp(result)
      this.settled.set(key, { result: cloneJson(stamped), at: this.now() })
      this.outcomes.set(identity, {
        name: exec.name,
        isError: stamped.isError,
        code: stamped.error?.info?.code,
        at: this.now(),
      })
      resolveAttempt(stamped)
      return stamped
    } catch (error: unknown) {
      this.outcomes.set(identity, { name: exec.name, isError: true, code: undefined, at: this.now() })
      rejectAttempt(error)
      throw error
    } finally {
      this.inFlight.delete(key)
    }
  }

  /** Stable per-agent scope tag (`-` for agentless direct callers). */
  private agentPart(agent: unknown): string {
    if (agent === null || (typeof agent !== 'object' && typeof agent !== 'function')) return '-'
    const scope = agent as object
    let id = this.agentIds.get(scope)
    if (id === undefined) {
      this.agentSeq += 1
      id = `a${this.agentSeq}`
      this.agentIds.set(scope, id)
    }
    return id
  }

  /** One model call block: shared by redeliveries, fresh on model retries. */
  private callKey(exec: ToolDispatchExecution): string {
    return `${this.agentPart(exec.agent)}|${String(exec.rootCallId)}|${String(exec.callId)}`
  }

  /** One retry identity: same agent, tool, and canonical arguments. */
  private identityKey(exec: ToolDispatchExecution): string {
    return `${this.agentPart(exec.agent)}|${exec.name}|${canonicalize(exec.arguments)}`
  }

  /**
   * Stamp ambiguous write errors with an attempt trailer so a retrying
   * model knows the exact call is ledger-checked first. Successes and
   * classified failures pass through byte-identical.
   */
  private maybeStamp(result: ToolExecutionResult): ToolExecutionResult {
    if (!result.isError) return result
    const code = result.error?.info?.code
    if (code !== undefined && !AMBIGUOUS_CODES.has(code)) return result
    this.attempts += 1
    const trailer: ContentBlock = {
      type: 'text',
      text: `[exactly-once attempt eo_${this.attempts}: effect state unknown — retrying this exact call is checked against the attempt ledger before re-dispatch.]`,
    }
    return { ...result, content: [...result.content, trailer] }
  }

  /**
   * Attach the session-projection repeat-evidence reader. The plugin calls
   * this after `sessionProjections.register` resolves; until then (and for
   * agentless executions) cold evidence is simply absent and repeats
   * dispatch — liveness wins, same as a session with no history.
   * @param read - `(session) => last-outcome records` from the projection.
   */
  attachRepeatEvidence(read: RepeatEvidenceReader): void {
    this.repeatEvidence = read
  }

  /**
   * Last outcome for this call's retry identity from the session
   * projection: per-session state keyed `name|canonicalArgs`, so it
   * survives restarts and checkpoint restores without rescanning the log.
   */
  private coldLast(exec: ToolDispatchExecution): LastOutcome | undefined {
    const read = this.repeatEvidence
    const session = exec.agent?.session
    if (read === undefined || session === undefined) return undefined
    const record = read(session)[`${exec.name}|${canonicalize(exec.arguments)}`]
    if (record === undefined) return undefined
    return { isError: record.isError, code: record.code ?? undefined, at: record.at }
  }
}
