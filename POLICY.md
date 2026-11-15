# Licence gate (standing policy)

Every entry in this library is screened against one rule, applied at the
**pinned commit** by reading the project's own licence file — not GitHub's
metadata label.

| licence class | ids | what we do |
|---|---|---|
| clean | `MIT`, `Apache-2.0`, `BSD-2-Clause`, `BSD-3-Clause`, `CC0-1.0`, `Zlib`, `Unlicense`, `ISC`, `Public-Domain` | code **vendored** under `entries/<cat>/<slug>/src/` with the licence text alongside, provided the source is under the 12 MB cap |
| clean with attribution | `CC-BY-4.0` | vendored, with an `attribution` field recorded in `entry.json` |
| copyleft | `GPL-2.0`, `GPL-3.0`, `LGPL-2.1`, `LGPL-3.0`, `AGPL-3.0`, `MPL-2.0`, `CC-BY-SA-*` | **REFERENCE ONLY** — name, link, licence flag, pinned commit. No code copied. |
| source-available / gated | `Sustainable-Use-*`, vendor EULAs, `MS-PL`, anything unrecognised | **REFERENCE ONLY** — no code copied |
| unknown / no licence file | `unknown`, `none` | **REFERENCE ONLY** — no code copied |

Two gates operate independently: **licence** and **size**. A clean-licensed
project over the 12 MB source cap stays reference-only, with the size reason
recorded in `reference_reason`.

A reference-only entry is still a first-class catalogue row: it names the
system, the upstream, the commit, and the licence flag, so the machinery can
be studied without any of its code entering this repository under a licence
that does not permit it.

## Why the classifier is ordered the way it is

`scripts/gblib.py` tests copyleft and source-available markers **before**
permissive ones, and prefers a real `LICEN[CS]E` file over `COPYING` or
`COPYRIGHT`. Both rules exist because the naive version got it wrong in
practice: Dungeon Crawl's `LICENSE` mentions CC0 for its tiles and was read as
public domain, and Godot's root `COPYRIGHT.txt` lists third-party components
and was read as CC0. A GPL project mis-read as permissive would have had its
code vendored into this repo — that is the failure mode this ordering prevents.

## Provenance

Every `entry.json` records `source`, `upstream`, `commit`, and `added_at`.
Corpus-derived rows also record `path_in_upstream`, so a claim can be checked
by fetching that path at that commit.
