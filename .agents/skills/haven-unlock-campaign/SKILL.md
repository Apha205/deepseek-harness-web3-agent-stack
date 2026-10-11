---
name: haven-unlock-campaign
description: Build a token-gated unlock campaign page (door grid) for Haven protocol content — page structure, the 8 non-negotiable mechanics, and Haven primitive mappings. Use when an agent must produce a campaign site for exclusive content that is already sourced and gated.
---

# Haven Unlock Campaign

This skill is a **subworkflow**: it owns campaign-site production only. The parent
workflow supplies exclusive data worth gating (see Prerequisites). This skill
turns that input into a legible, fair unlock page — a calendar that is also a shop.
It specifies mechanics and structure only — visual design (palette, typography,
layout, art style) is the builder's call.

Reference mechanic: a fixed-cadence drop event where N sealed "doors" reveal one
at a time (e.g. Civil Regime's "13 Days of Fright": 13 days, one door daily at
12PM PT, teaser art up front, full collection hidden until reveal).

## Visibility (role-based)

Only agents that build campaign pages carry this skill. Assistants and other
agents that never produce campaign sites must not spend context on it: while the
skill is settling it lives as a workspace-scoped project file (one catalog line),
and when the parent workflow exists it flips to orchestrator-push
(`disable-model-invocation`, parent forwards the body to the builder child only).

## Prerequisites (parent workflow supplies)

The subworkflow assumes these exist. Stubs are allowed **only to exemplify** the
design during drafting — every shipped campaign detail must be agent-production-ready.

1. **Exclusive content** — the gated payload worth an unlock page (media, files,
   collection). Sourced or created upstream; never invented here.
2. **Gate config** — chain, gate token, holder threshold, oracle (Bond contract
   for v4 market-cap gates). Haven-AOL `VALID_CHAINS` only.
3. **Drip plan** — N stages with per-stage unlock targets (USD intent + sealed
   consensus target) in ascending order. Gaps strand content; stages publish in order.
4. **Teaser assets** — one glimpse image per door. Hints, never reveals. Public. Produce with an image-gen model when the executing agent has one available; otherwise the rendering approach is the builder's call — this skill prescribes no fallback.
5. **Content artwork** — one poster/thumbnail image per stage, shown when its door opens. Same production rule as teasers (image-gen when available, else the builder's call).
6. **Campaign meta** — title, premise, cadence rule, reveal timezone, closer line,
   preview-window rule (default: live rung only — see Card rules).
7. **Publisher identity** — wallet / creator handle for attribution and signing.
8. **Alert channel config** — the handle/topic on the agent's existing XMTP channel
   that this campaign's alerts fan out through, plus the campaign's Convos invite
   link (`https://popup.convos.org/v2?i=<slug>`). The runtime subscriber set lives
   on the channel, not in the page; the page renders the invite link, never backend.

If any prerequisite is missing, stop and ask the parent workflow — do not
fabricate gates, targets, or content.

## Design agency

You own the visual design outright: palette, typography, layout, motion, and
art style. There is no house style and no monochrome requirement — design to
the subject matter and surprise us. The structural spec below (four sections,
uniform cards, five elements, two states) is the scaffolding; everything it
doesn't pin is yours. Legibility is the only visual hard rule: genuine contrast,
genuine hierarchy, readable at mobile width.

## Page structure

Four sections, one mechanic repeated N times:

1. **Hero.** Campaign headline + premise + plainly stated rules (dates, cadence,
   reveal time) + one primary CTA scrolling to the grid + a buy link to the gate
   token trade page (see Card rules). Campaign art.
2. **Explainer.** Two to three sentences defining the mechanic before the visitor
   plays: every door is a new unlock; each stays sealed until its trigger; teasers
   glimpse, reveals deliver.
3. **The door grid.** N uniform cards, one per stage. Each card has exactly five elements:
   1. Door face: closed by default (no preview image); teaser glimpse only inside
      the preview window; content thumbnail once revealed — see Card rules
   2. Label: "Door K — Secret Drop"
   3. Date + reveal time (or unlock target)
   4. Live trigger display: countdown (time-ladder) or mcap progress (mcap-ladder)
   5. Status with two states: revealed/shoppable vs. sealed/coming-soon
4. **Capture + closer.** Opt-in to unlock alerts via the campaign's Convos link on
   the agent's existing channel (XMTP) — a working invite link, not an email form
   and not a disabled button; no per-campaign backend. First purchase enrolls the
   buyer into privileged information (clues, early hints) — transaction becomes
   membership. Close with one line restating the premise.

## The 8 non-negotiables

1. **Fixed-cadence ritual** with transparent, plainly stated rules.
2. **Locked-but-visible future states** — sealed doors shown, not hidden content.
3. **Doors stay closed until the preview window** — no preview image on deeply
   sealed doors; the teaser glimpse appears only just before the drop, and hints
   without showing.
4. **Simultaneous collective reveals** — one moment for everyone where the ladder allows.
5. **Purchase-gated insider tier** — first purchase enrolls privileged information access.
6. **Live trigger per unit** — countdown or progress, visible and legible.
7. **Two status states** — revealed/shoppable vs. sealed/coming-soon; the grid reads
   as both calendar and shop.
8. **Playful framing** — the machinery reads as a game the visitor is invited into.

## Haven mapping

- **Ladder decision (ask first if unset):** mcap-ladder is native (v4 `drip.part`
  entities with `mcap_usd` targets, progress bars, async reveals); time-ladder is
  faithful to the reference (countdowns, synchronized ritual) but needs a new
  unlock path. State the chosen rule in hero + explainer.
- **Discovery shape:** `grp = haven.video.drip.part`, `gate_type = 4`, grouped by
  `drip_id`, joined to the `haven.video.drip.series` header for shared facts
  (title, total, token, chain). Attributes-only for grid rows; never payloads.
- **Reader-side launch death:** a launch with an expired middle stage shows only
  its live prefix — nothing past the gap. Missing stage 0 hides the launch.
- **Insider tier:** holder checks via Haven-AOL (balance / attestation) gate clue
  reveals, delivered over the agent's existing channel (XMTP). Skipping a stage
  must feel like losing status, never like being robbed.
- **Two layers:** this skill builds the per-creator **campaign page**. The global
  cross-publisher **aggregator** (all protocol drips, no owner filter) is a separate
  surface that discovers this campaign's entities automatically.

## Card rules (static minimums)

- **Buy path.** Every page links the gate token trade URL
  `https://mint.club/token/{slug}/{token}` from the hero and the live-rung card,
  where `{slug}` is the mint.club network key for the gate chain — NOT the
  lowercased variant name: `EthMainnet→ethereum`, `EthSepolia→sepolia`,
  `ArbitrumOne→arbitrum`, `BaseMainnet→base`, `OptimismMainnet→optimism`
  (resolve EIP-155 ids to variants first); `{token}` is the lowercase token
  address. Same shape as the dapp and mobile trade panels. Without a buy path
  the mcap cannot rise and no door opens — this is load-bearing, not decoration.
- **Door semantics.** A sealed door shows no preview image — just its label, target,
  trigger, and status. The teaser glimpse unlocks only inside the preview window:
  by default the live rung (lowest sealed stage) alone; campaign meta may define
  a wider window (e.g. final hours before reveal). Anything open shows its content
  thumbnail/poster plus title — never the teaser, never an empty state.
- **Revealed action.** Every revealed card routes its action (own / watch / buy —
  builder's label) to the gate-token trade URL from Buy path: buying the token is
  what unlocks playback. Never a dead button, never an anchor to nowhere.
- **Seal rule.** Sealed cards show "Secret Drop" only — never manifest titles,
  CIDs, or ciphertext hashes. Render USD intent targets (`marketCapTargetUsd`);
  sealed reserve targets stay off the page (chain-verifiable, not visitor-facing).
- **Locked clue slot.** Every sealed card (including the live rung) renders a
  visible locked clue slot naming the gate (token, threshold, chain). Live
  holder-check wiring may be deferred; the locked state may not.
- **Live-rung highlight.** A `next` emphasis on the lowest sealed rung is allowed
  and encouraged — it remains a sealed state, not a third status.
- **Progress formula.** `display = min(100, floor(current / target × 100))`.
  Bars never exceed 100%.
- **No invented facts.** Token symbol only from campaign meta `token_symbol` when
  present, otherwise the truncated address. Same for everything else: prereq facts
  or nothing.

## Self-check (before finishing)

Run `scripts/verify-unlock-page.sh <site-dir>` — it must pass. It asserts
structure, buy path, capture link, dead controls, seal strings, and offline deps.
The bullets below state the same contract in human-readable form:

- **Nothing after `</html>`.** The file ends at `</html>` (whitespace aside) — a
  balanced tag count still passes when a card's rows land outside its article,
  so check placement, not just counts.
- **Every card complete in place.** Each `<article>` block contains all five
  elements; each sealed block (including the live rung) contains its locked clue
  slot. Scope element queries per card, not page-wide.
- **Seal holds.** No manifest titles, CIDs, ciphertext hashes, or reserve-unit
  targets anywhere except revealed titles and thumbnails on revealed cards.
- **Math holds.** Every percentage equals `min(100, floor(current / target × 100))`.
- **Offline holds.** No external dependencies — no remote scripts, styles, images,
  fonts, or fetches. External navigation links (trade, explorer, Convos invite)
  are allowed and open in a new tab.
- **No alert backend.** Capture renders the Convos invite link (working, new tab);
  no email capture, no sender infra, no disabled subscribe button — a link needs
  no backend.
- **No dead controls.** Every button and link either navigates (trade links,
  Convos invite, in-page anchors that resolve to an existing id) or is visibly
  disabled with its reason stated (static-build states). Nothing clickable-looking
  does nothing.

## Output contract

The agent produces: campaign page (hero, explainer, N door cards, capture, closer),
per-door teaser wiring, revealed-state thumbnails, live trigger displays bound to
real chain/indexer state, the holder-gated clue tier, and the Convos invite link
(no bespoke alert backend). No mocked unlocks, no fake countdowns, no phantom
scarcity. Stubs from drafting are replaced or the page does not ship.

## Fairness guardrail

Rules stated plainly, triggers real, scarcity genuine. The visitor must feel like
a participant in a game, never a mark in a trap. Transparency of rules is what lets
the brain enjoy being influenced — it reads as play, not predation. The moment the
machinery reads as extraction, the spell breaks. This is a hard constraint, not copy.
