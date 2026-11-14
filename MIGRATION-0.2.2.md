# Migration: dsh 0.2.1-alpha.1 → 0.2.2-rc.3

`0.2.2-rc.3` is the current `rc` train on npm (the supplied
`deepseek-harness-dsh-v0.2.2-rc.3` source tree was used as the API reference).
Upstream APIs are pre-stable; every consumer was re-verified against that tree.

## Pins

| Surface | Before | After |
| --- | --- | --- |
| `@deepseek-ai/dsh-*` (16 packages) | `0.2.1-alpha.1` | `0.2.2-rc.3` |
| `@deepseek-ai/cordis` | `~4.0.5-alpha.1` | `~4.1.0` |
| `@deepseek-ai/schemastery` | `~3.18.5-alpha.1` | `~3.19.0` |
| `@deepseek-ai/dsh-tool-executor-native` | — | `=0.2.2-rc.3` (new test devDep, 9 packages) |
| `@xmtp/node-sdk` (docker helper) | `6.1.0` | `6.1.1` |
| Node engine | `>=22` implied | `>=24.9.0` required upstream |

## Breaking changes fixed

- **Tool executor split.** `ctx.tools.execute` is now batch-shaped
  (`{ calls: ToolCallBlock[], signal, agent? }` → `ToolBatchResult`) and
  delegates to a scope-selected `ToolExecutor`; with none mounted it throws
  `ToolExecutorUnavailableError`, and `systemPrompt.assemble` resolves the
  executor for the tools provider. Every spec that executes tools or runs the
  agent loop now mounts `@deepseek-ai/dsh-tool-executor-native` and unwraps
  `batch.results[0].result`.
- **`ctx.agents.create`/`resume` return `AgentHandle`.** `dsh-channel-xmtp`
  already consumes `{ agent, dispose() }`; creation → resume-on-"already
  exists" fallback, deterministic `SessionId`, cursor seeding, and
  `agent/inbox/claimed` correlation are unchanged.
- **`installModelSelection(agentCtx)`** lost its selection-ref parameter;
  the XMTP per-agent setup now calls it with the agent context only. Route
  selection still comes from `agentDefaultModel.currentSelection()` via
  `agentOptions`.
- **`@deepseek-ai/dsh-invariants` stayed removed.** The `src/invariant.ts`
  companions deleted in 0.2.1 remain deleted; no package reintroduced them.
- **Credentials surface.** Upstream providers gained durable-record methods
  (`readRecord`, `describeRecord`, `listRecords`, `modifyRecord`,
  `deleteRecord`); the test-only `MemoryCredentials` implements them.
- **`defineTool` / event names / treasury & exactly-once seams** verified
  unchanged: `tools/pre-execute|execute|post-execute|result`,
  `agent/request`, `agent/pre-step`, canonical `output.schema` + `render`.

## Deliberately retained

- `dsh-exactly-once/src/guard.ts` still calls the deprecated
  `Session.snapshotEvents()` for cold-session repeat evidence. Upstream marks
  the reader deprecated for *new* calls but keeps it for existing logic
  (its own session-controller still uses it); the guard's `SessionLike`
  seam is structural, so no signature change was needed. Migrate to
  `ctx.sessionQuery` projections when upstream removes the reader.
- Test-side `session.snapshotEvents()` assertions likewise remain.

## Deployment

- `docker/Dockerfile`: `npm i -g @deepseek-ai/dsh@0.2.2-rc.3`, Node base
  bumped to a `>=24.9` image.
- `native/README.md`: same global CLI pin.
- `.github/workflows/ci.yml`: `actions/setup-node` pins Node 24 for the
  upstream engine requirement; pnpm still comes from corepack.

## Lockfile

`pnpm-lock.yaml` still resolves the 0.2.1 train plus the pre-existing
`@xmtp/node-sdk@6.1.1` bump. It must be regenerated (`pnpm install`) before
the frozen-lockfile CI install can pass — peer-context hashes are not
hand-editable. The upstream `deepseek-harness-dsh-v0.2.2-rc.3/` source tree
is intentionally untracked.
