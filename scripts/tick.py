#!/usr/bin/env python3
"""One rate-polite tick of the game-backends library extension.

Runs every 15 minutes under Hermes cron. Behaviour per tick:
  * pick up to MAX_NEW candidates from a rotating set of GitHub searches
  * skip anything whose upstream (or slug) is already in the catalogue
  * licence-screen each candidate from its own licence file at the clone's
    HEAD commit: clean => vendored (if under the size cap), else reference-only
  * rebuild CATALOG.md, commit, and push when a remote exists
  * never clone more than MAX_NEW repos, and back off when the API budget is low

State lives in .mine/tick_state.json so the search cursor advances without
hammering GitHub's 30 requests/minute search limit.
"""
import json, os, re, shutil, subprocess, sys, tempfile, time, urllib.parse
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gblib import (ROOT, CATEGORIES, CLEAN, ATTRIB, api, build_catalog,
                   entry_path, load_entries, save_entry, verdict)
from gblib import find_license
from seed_upstreams import add_upstream, code_size

STATE = os.path.join(ROOT, ".mine", "tick_state.json")
LOG = os.path.join(ROOT, "TICKLOG.md")
MAX_NEW = 2                 # repos cloned per tick
MAX_REF_NEW = 4             # reference-only rows added per tick (no clone: API-only)
PER_QUERY = 20

# Rotating search queries. Each maps to one of the eight allowed categories.
QUERIES = [
    ("engines",      "game engine language:c++ stars:>200"),
    ("engines",      "ecs entity component system stars:>150"),
    ("physics",      "physics engine 2d stars:>100"),
    ("physics",      "rigid body simulation library stars:>100"),
    ("math",         "game math library vector matrix stars:>80"),
    ("math",         "simd math library quaternion stars:>50"),
    ("loot-economy","loot table library stars:>20"),
    ("loot-economy","drop table generator game stars:>10"),
    ("loot-economy","game economy simulation stars:>20"),
    ("gameplay",     "pathfinding library stars:>200"),
    ("gameplay",     "behaviour tree game ai stars:>80"),
    ("gameplay",     "navmesh generation stars:>80"),
    ("gameplay",     "inventory system game stars:>50"),
    ("netcode",      "game networking library udp stars:>80"),
    ("netcode",      "rollback netcode stars:>40"),
    ("netcode",      "game server authoritative multiplayer stars:>100"),
    ("save-state",   "serialization library c++ stars:>200"),
    ("save-state",   "save game format library stars:>20"),
    ("procgen",      "procedural generation library stars:>80"),
    ("procgen",      "wave function collapse stars:>200"),
    ("procgen",      "noise generation library stars:>100"),
    ("procgen",      "dungeon generation library stars:>50"),
]


def load_state():
    if os.path.isfile(STATE):
        return json.load(open(STATE))
    return {"cursor": 0, "ticks": 0, "added": 0, "last": None, "seen": []}


def save_state(s):
    os.makedirs(os.path.dirname(STATE), exist_ok=True)
    json.dump(s, open(STATE, "w"), indent=1, sort_keys=True)


def norm(url):
    u = (url or "").strip().lower()
    u = re.sub(r"\.git$", "", u)
    u = re.sub(r"^git@github\.com:", "https://github.com/", u)
    u = re.sub(r"^https?://(www\.)?", "https://", u)
    return u.rstrip("/")


def known():
    ups, slugs = set(), set()
    for e in load_entries():
        ups.add(norm(e.get("upstream", "")))
        slugs.add((e.get("category"), e.get("slug")))
    return ups, slugs


def slugify(repo):
    return re.sub(r"[^a-z0-9]+", "-", repo.lower()).strip("-")[:70]


def budget_ok():
    d, _ = api("https://api.github.com/rate_limit")
    r = (d.get("resources") or {})
    core = (r.get("core") or {}).get("remaining", 0)
    search = (r.get("search") or {}).get("remaining", 0)
    return core >= 200 and search >= 5, core, search


def main():
    st = load_state()
    st["ticks"] += 1
    tmp = tempfile.mkdtemp(prefix="gbl-tick-")
    added, skipped, refs = [], 0, []

    ok, core, search = budget_ok()
    if not ok:
        note = f"skipped: API budget low (core {core}, search {search})"
        print(note)
        st["last"] = {"at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "note": note}
        save_state(st)
        return

    cat, q = QUERIES[st["cursor"] % len(QUERIES)]
    st["cursor"] += 1
    url = ("https://api.github.com/search/repositories?q=" + urllib.parse.quote(q) +
           f"&sort=stars&order=desc&per_page={PER_QUERY}")
    d, _ = api(url)
    items = d.get("items", [])
    ups_known, slug_known = known()

    for it in items:
        if len(added) + len(refs) >= MAX_NEW + MAX_REF_NEW:
            break
        full = it["full_name"]
        up = norm(it["html_url"])
        if up in ups_known or it.get("fork") or it.get("archived"):
            skipped += 1
            continue
        lic_meta = ((it.get("license") or {}).get("spdx_id") or "").upper() or None
        slug = slugify(full)
        if (cat, slug) in slug_known:
            skipped += 1
            continue
        # archived/asset-only repos are out: must look like machinery
        desc = (it.get("description") or "")
        if re.search(r"asset|sprite|sound ?pack|music pack|font pack|texture pack", desc, re.I):
            skipped += 1
            continue

        if len(added) < MAX_NEW:
            tmpd = tempfile.mkdtemp(prefix="gbl-clone-", dir=tmp)
            r = subprocess.run(["git", "clone", "--depth", "1", "--quiet",
                                f"https://github.com/{full}.git", os.path.join(tmpd, "r")],
                               capture_output=True, text=True, timeout=240)
            if r.returncode != 0:
                skipped += 1
                continue
            work = os.path.join(tmpd, "r")
            sha = subprocess.run(["git", "-C", work, "rev-parse", "HEAD"],
                                 capture_output=True, text=True).stdout.strip()[:12]
            lic, lf = find_license(work)
            size = code_size(work)
            dest = entry_path(cat, slug)
            os.makedirs(dest, exist_ok=True)
            rec = {
                "slug": slug, "name": full.split("/")[1], "category": cat,
                "system": desc[:160] or "see upstream",
                "description": f"{full} — {desc}".strip(" —"),
                "why": "Discovered by the 15-minute library tick; passed the category and licence gate.",
                "language": (it.get("language") or "").lower() or "n/a",
                "license": lic, "license_verdict": verdict(lic),
                "upstream": it["html_url"], "commit": sha,
                "source": "github-search:" + q,
                "stars": it.get("stargazers_count"),
                "added_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                "size_bytes": size,
            }
            if lf:
                rec["license_file"] = os.path.basename(lf)
            if (lic in CLEAN or lic in ATTRIB) and size <= 12 * 1024 * 1024:
                src = os.path.join(dest, "src")
                if os.path.isdir(src):
                    shutil.rmtree(src)
                shutil.copytree(work, src, symlinks=True, ignore_dangling_symlinks=True,
                                ignore=shutil.ignore_patterns(".git", ".github", "node_modules",
                                                              "__pycache__", "*.png", "*.jpg", "*.gif"))
                if lf:
                    shutil.copyfile(lf, os.path.join(dest, "LICENSE"))
                rec["delivery"], rec["vendored_path"] = "vendored", "src/"
                if lic in ATTRIB:
                    rec["attribution"] = f"{full} is licensed CC BY 4.0 — attribution recorded here per policy."
            else:
                rec["delivery"] = "reference"
                rec["reference_reason"] = (f"licence: {lic} ({verdict(lic)})"
                                           if lic not in CLEAN else f"size gate: {size//1024//1024} MB")
            save_entry(rec)
            ups_known.add(up)
            slug_known.add((cat, slug))
            added.append(f"{cat}/{slug} ({lic}, {rec['delivery']})")
            shutil.rmtree(tmpd, ignore_errors=True)
            time.sleep(1.5)   # be polite between clones
        else:
            # API-only reference row: no clone, no code, still catalogued
            from gblib import canon
            lic = canon(lic_meta)
            dest = entry_path(cat, slug)
            os.makedirs(dest, exist_ok=True)
            rec = {
                "slug": slug, "name": full.split("/")[1], "category": cat,
                "system": desc[:160] or "see upstream",
                "description": f"{full} — {desc}".strip(" —"),
                "why": "Discovered by the 15-minute library tick (API metadata only, not deep-screened).",
                "language": (it.get("language") or "").lower() or "n/a",
                "license": lic, "license_verdict": verdict(lic),
                "upstream": it["html_url"],
                "commit": (it.get("pushed_at") or "")[:10] + " (branch tip at catalogue time)",
                "source": "github-search:" + q, "stars": it.get("stargazers_count"),
                "delivery": "reference",
                "reference_reason": f"metadata-only row; licence per GitHub metadata ({lic})",
                "added_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            }
            save_entry(rec)
            ups_known.add(up)
            slug_known.add((cat, slug))
            refs.append(f"{cat}/{slug}")

    n = build_catalog()
    msg = f"tick {st['ticks']}: +{len(added)} screened, +{len(refs)} reference, {skipped} skipped, catalogue={n}"
    stamp = time.strftime("%Y-%m-%d %H:%M UTC", time.gmtime())
    with open(LOG, "a") as f:
        f.write(f"\n- **{stamp}** — {msg}\n")
        for a in added:
            f.write(f"  - added {a}\n")
        for r_ in refs:
            f.write(f"  - reference {r_}\n")

    # commit (and push when a remote exists). push_all.sh pushes Gitea every tick
    # and batches GitHub to GITHUB_MIN_INTERVAL_H hours (default 12 h = 2/day).
    def sh(*a):
        return subprocess.run(a, cwd=ROOT, capture_output=True, text=True)
    sh("git", "add", "-A")
    if sh("git", "diff", "--cached", "--quiet").returncode != 0:
        sh("git", "-c", "user.name=library-tick", "-c", "user.email=tick@rdw-labz.local",
           "commit", "-q", "-m", msg)
        if sh("git", "remote").stdout.strip():
            # push_all.sh handles both remotes with a throwaway askpass helper
            p = subprocess.run(["bash", os.path.join(ROOT, "scripts", "push_all.sh")],
                               cwd=ROOT, capture_output=True, text=True, timeout=600)
            if p.returncode != 0:
                tail = (p.stdout or p.stderr).strip().splitlines()[-1:] or [""]
                msg += f" [push issue: {tail[0][:120]}]"
    else:
        msg += " [no changes]"
    st["last"] = {"at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                  "query": q, "added": added, "reference": refs, "skipped": skipped, "catalogue": n}
    st["added"] = st.get("added", 0) + len(added) + len(refs)
    save_state(st)
    shutil.rmtree(tmp, ignore_errors=True)
    print(msg)


if __name__ == "__main__":
    main()
