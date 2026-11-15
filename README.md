# game-backends

A catalogue and vendored-code library of the **machinery under games** —
engines and engine subsystems, physics, math, loot/drop and economy rolls,
gameplay systems, networking, save/state, and procedural generation.

Not a game dump. No front-end games, no asset packs: every entry is a system
another game could be built on.

154 entries were seeded on 2026-11-14 from the clone corpus and curated
upstreams; the 15-minute tick has been extending it since. Live counts, per
category, are at the top of **[CATALOG.md](CATALOG.md)** — that file is
regenerated every tick, so it is the only honest source for numbers.

Each entry is either **vendored** (clean licence, under the source cap, code in
`src/`) or **reference-only** (name, upstream, pinned commit, licence flag, no
code) when the licence does not permit copying code in — see
[POLICY.md](POLICY.md).

## Layout

```
entries/<category>/<slug>/
    entry.json      what it is, what system it provides, language, licence,
                    upstream URL + pinned commit, provenance, delivery mode
    README.md       the same, rendered
    src/            the code — only for clean-licensed entries under the size cap
    LICENSE         the upstream licence text, when vendored
scripts/
    gblib.py            entry schema, licence screening, catalogue generation
    mine_corpus.py      survey of the local clone corpus
    seed_from_corpus.py strict classifier + vendoring from the corpus
    seed_upstreams.py   curated upstream seed (fresh clones, licence-screened)
    tick.py             one 15-minute extension tick (see below)
.mine/              scan output and tick state (not tracked)
```

## Categories

| dir | what belongs here |
|---|---|
| `engines` | game engines and engine subsystems (ECS, scripting hosts, platform layers) |
| `physics` | 2D/3D rigid bodies, collision detection, character controllers |
| `math` | vector/matrix/quaternion maths, SIMD maths, fixed-point maths |
| `loot-economy` | loot and drop tables, item generation, production economies, markets |
| `gameplay` | combat, AI, pathfinding/navmesh, quests, inventories |
| `netcode` | transports, lockstep/rollback, authoritative servers, matchmaking |
| `save-state` | serialization, save formats, embedded stores, world state |
| `procgen` | noise, WFC, dungeon/map/world generation, grammar generation |

## The 15-minute tick

`scripts/tick.py` runs under Hermes cron every 15 minutes. Each tick:

1. picks one rotating GitHub search query (22 queries across the eight categories),
2. skips forks, archived repos, asset packs, and anything whose upstream or slug
   is already in the catalogue,
3. clones at most **2** new repos, licence-screens each from its own licence
   file at HEAD, vendors it if clean and under the 12 MB source cap, otherwise
   records a reference-only row (up to 4 more rows per tick use API metadata only, no clone),
4. rebuilds `CATALOG.md`, appends to `TICKLOG.md`, commits, pushes.

Rate-limit politeness is structural: one search per tick, two clones maximum,
1.5 s between clones, and a tick **skips itself** when GitHub reports fewer than
200 core requests or 5 search requests remaining.

## Provenance

Every entry records `source`, `upstream`, `commit` and `added_at`. Corpus-derived
rows also record `path_in_upstream`; the seeded set came from the local
`cloned-free-games` scrape (379 clones, 404 pinned entries), so each of those
rows is checkable at the exact commit it was mined from.
