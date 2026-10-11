## Goal

Scaffold the unlock-campaign chain as a path through connected files. Gap: harness
workflows are run-only (a model-written script that spawns subagents, gone when the
run ends) — there is no persisted workflow primitive, no `.agents/workflows/`, no
saved-workflow registry. Until one exists, the chain is defined by file contracts:
each stage's output files are the next stage's inputs, executed in order by a future
parent workflow (or manually). Only the unlock-calendar stage is complete; the rest
are stubs with defined interfaces.

## Success Criteria

- Each stage below names its input files, output files, and owner (skill / workflow / plugin).
- The unlock-calendar stage is fully complete and reproducible from its inputs alone.
- No other stage is implemented in this pass — stubs carry interfaces only.

## The Path

```
manifest.json → gate.json + drip-plan.json → teasers/ + campaign.json → site/ → arkiv entities
   (0)                 (1)                        (2)                   (3)         (4)
```

## Steps

**Stage 0 — Source exclusive data (STUB)**

1. Owner: parent workflow (future).
2. Output: content bundle + `manifest.json` (content refs, rights, content hashes).
3. Note: the agent must get or create data worth gating before anything downstream
   runs. Nothing here may be invented at campaign time.

**Stage 1 — Gate + drip plan (STUB)**

4. Input: `manifest.json`.
5. Output: `gate.json` (chain, token, threshold, oracle) + `drip-plan.json`
   (N stages, ascending targets, USD intent + sealed consensus target).
6. Owner: future (skill or plugin; reads Haven-AOL + Bond state for target sanity).

**Stage 2 — Teasers + campaign meta (STUB)**

7. Input: content bundle + `drip-plan.json`.
8. Output: `teasers/` (one glimpse image per door — hints, never reveals) +
   `campaign.json` (title, premise, cadence rule, reveal timezone, closer line).
9. Note: stubs allowed to exemplify design only; shipped assets must be production-ready.

**Stage 3 — Unlock calendar page (COMPLETE)**

10. Input: Stage 0–2 outputs (= skill prerequisites).
11. Mechanism: `haven-unlock-campaign` skill (skill body + verifier script,
    catalog-disclosed, workspace-scoped).
12. Output: campaign site (hero, explainer, N door cards, capture, closer) +
    holder-gated clue tier. No mocked unlocks, no fake countdowns.
13. Future: flip skill to orchestrator-push (`disable-model-invocation`, parent
    forwards body to the builder child) so only page-building agents carry it.

**Stage 4 — Publish + register (STUB)**

14. Input: `site/` + `gate.json` + `drip-plan.json`.
15. Output: Arkiv `drip.series` + `drip.part` entities; the global aggregator
    discovers them automatically (no owner filter).
16. Owner: future publish workflow. Pins, entity creates, and gas live here —
    this is the treasury-metered stage, not Stage 3.

## Approach

1. **File contracts, not framework code.** The harness offers no persisted
   workflow to extend (`docs/subsystems/workflow.md`: dynamic scripts only), so
   the chain lives as interface definitions until a parent workflow exists.
2. **One stage complete, rest stubbed.** Stage 3 is reproducible today from real
   or stub inputs; Stages 0–2 and 4 define their file shapes so a future parent
   can execute the arrows.
3. **Costs downstream of production.** Publishing spend (Stage 4) stays separate
   from page production (Stage 3, reads + generation).
