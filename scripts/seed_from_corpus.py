#!/usr/bin/env python3
"""Turn the corpus scan into library entries.

Strict rules: the subsystem directory name must match a category's keyword list
exactly (not a loose regex), carry >=8 code files, and not sit under a vendored
third-party tree. Clean-licensed picks smaller than VENDOR_CAP bytes get their
code copied into entries/<cat>/<slug>/src/ with the licence text; everything
else becomes a reference-only catalogue entry pinned to upstream + commit.
"""
import json, os, re, shutil, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gblib import (ROOT, CATEGORIES, entry_path, save_entry, verdict, license_from_file,
                   find_license)

CORPUS = os.path.expanduser("~/cloned-free-games/games")
SCAN = os.path.join(ROOT, ".mine", "corpus.json")
VENDOR_CAP = 6 * 1024 * 1024       # source bytes copied per entry
CODE_EXT = {".py", ".c", ".cc", ".cpp", ".cxx", ".h", ".hh", ".hpp", ".hxx", ".cs",
            ".java", ".kt", ".js", ".mjs", ".ts", ".rs", ".go", ".lua", ".gd", ".zig"}
BAD_PATH = re.compile(r"(^|/)(third_party|3rdparty|thirdparty|external|extern|vendor|"
                      r"deps|submodules|node_modules|contrib|dependencies)(/|$)", re.I)

# exact-ish directory keyword sets per category (matched on lowercased basename)
KW = {
 "engines": {"engine", "enginecore", "engine-core", "runtime", "framework", "ecs",
             "scene", "scenegraph", "scene_graph", "gameloop", "game-loop", "core"},
 "physics": {"physics", "physics2d", "physics3d", "collision", "collisions",
             "collisiondetection", "rigidbody", "rigid_body", "dynamics",
             "box2d", "solver", "constraints", "trimesh"},
 "math": {"math", "maths", "mathematics", "mathlib", "glm", "geometry", "geom",
          "linalg", "algebra", "vector", "vectors", "matrix", "quat",
          "quaternion", "simd", "fixed", "fixedpoint", "fixed_point"},
 "loot-economy": {"loot", "loottable", "loot_table", "lootdrop", "drops", "droptable",
                  "drop_table", "economy", "economy_system", "market", "markets",
                  "trade", "trading", "price", "prices", "pricing", "shop", "shops",
                  "vendor", "auction", "auctions", "currency", "salvage", "reward",
                  "rewards"},
 "gameplay": {"combat", "ai", "behaviour", "behavior", "behaviortree", "behavior_tree",
              "pathfind", "pathfinding", "pathing", "navmesh", "navigation", "quest",
              "quests", "inventory", "inventories", "items", "equipment", "crafting",
              "abilities", "skills", "spells", "encounters", "spawn", "spawns"},
 "netcode": {"net", "network", "networking", "netcode", "protocol", "protocols",
             "packet", "packets", "replication", "rollback", "transport", "server",
             "multiplayer", "matchmaking", "session", "sessions"},
 "save-state": {"save", "saves", "saving", "savegame", "save_game", "persistence",
                "serialization", "serialisation", "serializer", "snapshot",
                "checkpoint", "gamestate", "game_state", "storage"},
 "procgen": {"mapgen", "map_gen", "worldgen", "world_gen", "procgen", "procedural",
             "dungeongen", "dungeon_gen", "levelgen", "level_gen", "terrain",
             "terrain_gen", "noise", "perlin", "simplex", "voronoi", "generator",
             "generators"},
}

SYSTEM_TEXT = {
 "engines": "engine core / runtime shell (main loop, scene or ECS plumbing)",
 "physics": "rigid-body collision and dynamics",
 "math": "vector/matrix/quaternion math substrate",
 "loot-economy": "loot, drop-rate, trade or economy simulation",
 "gameplay": "combat, AI, pathing, quest or inventory logic",
 "netcode": "network transport, protocol, replication or server loop",
 "save-state": "persistence: save/load, snapshot or state serialisation",
 "procgen": "procedural map/world/level generation",
}


def dir_size(p, cap=VENDOR_CAP * 3):
    tot = 0
    for dp, dn, fn in os.walk(p):
        dn[:] = [d for d in dn if d not in {".git", "node_modules", "__pycache__"}]
        for f in fn:
            if os.path.splitext(f)[1].lower() in CODE_EXT:
                try:
                    tot += os.path.getsize(os.path.join(dp, f))
                except OSError:
                    pass
            if tot > cap:
                return tot
    return tot


def pick_for(scan_entry, cat):
    best = None
    for h in scan_entry["subsystems"].get(cat, []):
        base = os.path.basename(h["path"]).replace("-", "_")
        base2 = base.replace("_", "")
        if base not in KW[cat] and base2 not in {k.replace("_", "") for k in KW[cat]}:
            continue
        if BAD_PATH.search(h["path"]):
            continue
        if h["code_files"] < 8:
            continue
        score = h["code_files"] - 2 * h["path"].count("/")
        if best is None or score > best[0]:
            best = (score, h)
    return best[1] if best else None


def main():
    scan = {e["name"]: e for e in json.load(open(SCAN))}
    added = 0
    stats = {}
    for name, e in sorted(scan.items()):
        root = os.path.join(CORPUS, name)
        # classify from the clone itself: corpus.json was scanned with weaker
        # heuristics and records "none" for repos whose licence file is not a
        # plain root LICENSE
        lic, _licf = find_license(root)
        if lic in ("none", "unknown") and e.get("license") not in ("none", "unknown", None):
            lic = e["license"]
        v = verdict(lic)
        for cat, _ in CATEGORIES:
            h = pick_for(e, cat)
            if not h:
                continue
            slug = re.sub(r"[^a-z0-9]+", "-", f"{name}-{os.path.basename(h['path'])}".lower()).strip("-")
            d = entry_path(cat, slug)
            if os.path.isfile(os.path.join(d, "entry.json")):
                continue
            src_dir = os.path.join(root, h["path"])
            size = dir_size(src_dir)
            delivery, reason, vpath = "reference", "licence: " + lic, None
            if v in ("clean", "clean-with-attribution") and size <= VENDOR_CAP:
                vpath = "src"
                delivery, reason = "vendored", None
            rec = {
                "slug": slug, "name": f"{name} — {os.path.basename(h['path'])}",
                "category": cat, "system": SYSTEM_TEXT[cat],
                "description": f"`{h['path']}` inside {name}: {h['code_files']} source files.",
                "why": f"Backend material for {SYSTEM_TEXT[cat]}, taken from a pinned clone "
                       f"({h['code_files']} files at that path).",
                "language": (e["langs"][0].lstrip(".") if e.get("langs") else "mixed"),
                "license": lic, "license_verdict": v,
                "delivery": delivery, "upstream": e["upstream"], "commit": e["commit"],
                "path_in_upstream": h["path"], "code_files": h["code_files"],
                "source_bytes": size, "added_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                "source": f"corpus:cloned-free-games/{name}@{e['commit']}",
                "entry_points": [f"{h['path']}/"],
            }
            if delivery == "vendored":
                os.makedirs(d, exist_ok=True)
                dest = os.path.join(d, "src")
                if os.path.isdir(dest):
                    shutil.rmtree(dest)
                shutil.copytree(src_dir, dest,
                                ignore=shutil.ignore_patterns(".git", "node_modules", "__pycache__"))
                rec["vendored_path"] = "src/"
                # carry the licence text with the code
                for cand in ("LICENSE", "LICENSE.md", "LICENSE.txt", "COPYING", "COPYING.txt"):
                    p = os.path.join(root, cand)
                    if os.path.isfile(p):
                        shutil.copyfile(p, os.path.join(d, "LICENSE"))
                        rec["license_file"] = cand
                        break
            else:
                rec["reference_reason"] = reason
            if lic == "CC-BY-4.0":
                rec["attribution"] = f"Attribution required: {name}, {e['upstream']} @ {e['commit']} (CC BY 4.0)."
            save_entry(rec)
            added += 1
            stats.setdefault(cat, [0, 0])
            stats[cat][0] += 1
            stats[cat][1] += delivery == "vendored"
    print(f"corpus entries added: {added}")
    for cat, _ in CATEGORIES:
        n, vnd = stats.get(cat, [0, 0])
        print(f"  {cat:14s} {n:4d} entries ({vnd} vendored)")


if __name__ == "__main__":
    main()
