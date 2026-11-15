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

`scripts/gblib.py` resolves a project's licence in this order, and the order is
the whole point:

1. a plain `LICEN[CS]E*` file at the repo root — this **is** the project licence
2. the root `COPYING` / `COPYRIGHT` file
3. a file inside a root `licenses/` directory whose name matches the project
4. otherwise the most restrictive classification found, then the majority

Each step exists because the naive version got it wrong in practice:

- **Dungeon Crawl**'s `LICENSE` mentions CC0 for its tiles; matching the first
  marker anywhere read the whole GPL-2.0 project as public domain. Copyleft
  markers are now tested before permissive ones, and the project's own file
  decides.
- **Godot**'s root `COPYRIGHT.txt` lists third-party components and read as
  CC0; the real licence is `LICENSE.md` (MIT). Rule 1 before rule 2 fixes it.
- **Cocos2d-x** ships 30 `licenses/*.txt` files for bundled libraries and no
  root licence; the restrictive-first rule read the whole engine as LGPL
  because of `libwebsockets`. Rule 3 (its own `LICENSE_cocos2d-x.txt`, MIT)
  fixes it.
- **MonoGame** is MS-PL and **Flax** ships a vendor EULA — both are gated, and
  both used to land in "unknown" until those ids were added.
- **libccd** keeps its BSD-3 text in `BSD-LICENSE`; matching `licen` anywhere in
  the filename finds it.

A GPL project mis-read as permissive would have had its code vendored into this
repo. That is the failure mode this ordering prevents, and it is worth more than
any single entry in the catalogue.

## Provenance

Every `entry.json` records `source`, `upstream`, `commit`, and `added_at`.
Corpus-derived rows also record `path_in_upstream`, so a claim can be checked
by fetching that path at that commit.
