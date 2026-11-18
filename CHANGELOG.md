# Changelog

## Unreleased — 2026-11-14

- chore(deps): upgrade harness train to dsh 0.2.2-rc.4
  - rc.4 adds `CONTENT_REFUSED` to `LLM_FAILURE_CODES`: DeepSeek refusals
    (`stop_reason: "refusal"`) now surface as `turn/end` `reason.kind:
    'error'` instead of malformed output. No stack consumer classifies LLM
    failure codes, so no source changes were required; see
    MIGRATION-0.2.2.md. `pnpm-lock.yaml` still needs `pnpm install` to
    regenerate peer-context hashes.
- chore(deps): upgrade harness train to dsh 0.2.2-rc.3 (a9e91e7)
- Upgrade JS bridge to @filoz/synapse-core 0.11.0 (ff1d893)
  - Note: 0.11.0 was published 2026-11-13T18:46:36Z; it falls inside the
    pnpm supply-chain `minimumReleaseAge` (24h) window until
    2026-11-14T18:46:36Z. CI `pnpm install --frozen-lockfile` fails before
    that cutoff; no lockfile change needed.
- chore(deps): add npm package-lock.json (root-only) (7fb9be5)
  - pnpm-lock.yaml remains the canonical workspace lockfile.
- fix(locators): drop pin-receipt requirement — strict parse is the
  spec-compatible fix (1c37577)
- fix(locators): machine pin-receipt handoff, strict PieceCID validation
  (89edf87)
