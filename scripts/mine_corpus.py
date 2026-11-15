#!/usr/bin/env python3
"""Mine a local clone corpus for game BACKEND material.

Scans each clone for: upstream remote, pinned commit, licence class, language mix,
and subsystem directories matching the backend categories. Emits corpus.json.

Categories:
  engines, physics, math, loot-economy, gameplay, netcode, save-state, procgen
"""
import json, os, re, subprocess, sys
from collections import Counter

CORPUS = os.path.expanduser("~/cloned-free-games/games")
PRUNE = {".git", "node_modules", "bower_components", ".gradle", ".cxx",
         "build", "Builds", "dist", ".build", "target", "obj", "bin",
         "vendor", ".venv", "venv", "__pycache__", ".tox", "Pods",
         "gradle", ".idea", ".vscode", "cmake-build-debug"}
CODE_EXT = {".py", ".c", ".cc", ".cpp", ".cxx", ".h", ".hh", ".hpp", ".hxx",
            ".cs", ".java", ".kt", ".js", ".mjs", ".ts", ".rs", ".go", ".lua",
            ".gd", ".gml", ".swift", ".m", ".mm", ".zig", ".d", ".pas", ".scala"}
SKIP_DIR_HINT = re.compile(r"(?:^|[._-])(?:assets?|images?|sounds?|snd|musics?|"
                           r"fonts?|shaders?|sprites?|textures?|models?|maps?|"
                           r"localization|translations?|locale|languages?|"
                           r"docs?|documentation|screenshots?|videos?)$", re.I)

CATEGORY_PATTERNS = {
    "physics": re.compile(r"(?:^|[^a-z])(physics|physic|rigidbody|rigid_body|collision|collider|dynamics|box2d|bullet3?|chipmunk|jolt|physx|havok|constraints?)(?:[^a-z]|$)", re.I),
    "math": re.compile(r"(?:^|[^a-z])(math|maths|mathematics|geometry|geom|linear_?algebra|linalg|vector|vectors|matrix|matrices|quat|quaternion|simd|noise|fixed_point)(?:[^a-z]|$)", re.I),
    "loot-economy": re.compile(r"(?:^|[^a-z])(loot|drops?|drop_?table|drop_?rate|economy|economic|market|trade|trading|prices?|pricing|shop|vendor|auction|currency|wallet|inflation|reward|salvage)(?:[^a-z]|$)", re.I),
    "gameplay": re.compile(r"(?:^|[^a-z])(combat|attack|damage|weapons?|skills?|abilities|spells?|ai|behaviou?r|behavior_?tree|pathfind\w*|pathing|navmesh|navigation|quests?|inventory|inventories|items?|equipment|crafting|characters?|actors?|stats|buff|status_?effects?|encounter|spawn)(?:[^a-z]|$)", re.I),
    "netcode": re.compile(r"(?:^|[^a-z])(net|nets?|network\w*|netcode|networking|multiplayer|server|client|socket\w*|protocol|packets?|replication|rollback|lag_?compensation|transport|session|matchmak\w*)(?:[^a-z]|$)", re.I),
    "save-state": re.compile(r"(?:^|[^a-z])(save|saves|saving|savegame|save_?game|persist\w*|serializ\w*|serialis\w*|snapshot|checkpoint|state_?machine|gamestate|game_?state|storage|database|db|profil\w*)(?:[^a-z]|$)", re.I),
    "procgen": re.compile(r"(?:^|[^a-z])(procgen|procedural\w*|mapgen|worldgen|world_?gen|terrain_?gen|level_?gen\w*|dungeon_?gen\w*|noise|perlin|simplex|voronoi|cellular\w*|wfc|wave_?function_?collapse|l_system|grammar|blueprint)(?:[^a-z]|$)", re.I),
    "engines": re.compile(r"(?:^|[^a-z])(engine|core|runtime|framework|renderer|ecs|entity|scene|scene_?graph|component|systems?|loop|gameloop|tick|update)(?:[^a-z]|$)", re.I),
}

LICENSE_MARKERS = [
    ("Apache-2.0", re.compile(r"apache license[\s,]*\n?[\s\S]{0,200}?version 2\.0", re.I)),
    ("MIT", re.compile(r"permission is hereby granted, free of charge", re.I)),
    ("BSD-3-Clause", re.compile(r"redistribution and use in source and binary forms[\s\S]{0,2000}?neither the name", re.I)),
    ("BSD-2-Clause", re.compile(r"redistribution and use in source and binary forms", re.I)),
    ("CC0-1.0", re.compile(r"\bCC0\b|creative commons zero|cc0 1\.0", re.I)),
    ("CC-BY-4.0", re.compile(r"creative commons attribution 4\.0|cc[- ]by[- ]4\.0", re.I)),
    ("GPL-3.0", re.compile(r"gnu general public license[\s\S]{0,200}?version 3", re.I)),
    ("GPL-2.0", re.compile(r"gnu general public license[\s\S]{0,200}?version 2", re.I)),
    ("LGPL-3.0", re.compile(r"gnu lesser general public license[\s\S]{0,200}?version 3", re.I)),
    ("LGPL-2.1", re.compile(r"gnu lesser general public license[\s\S]{0,200}?version 2", re.I)),
    ("MPL-2.0", re.compile(r"mozilla public license[\s\S]{0,200}?2\.0", re.I)),
    ("AGPL-3.0", re.compile(r"gnu affero general public license", re.I)),
    ("Zlib", re.compile(r"altered source versions must be plainly marked|this software is provided 'as-is'", re.I)),
    ("Unlicense", re.compile(r"this is free and unencumbered software released into the public domain", re.I)),
    ("ISC", re.compile(r"permission to use, copy, modify, and(/or| or) distribute this software", re.I)),
]
CLEAN = {"MIT", "Apache-2.0", "BSD-2-Clause", "BSD-3-Clause", "CC0-1.0",
         "CC-BY-4.0", "Zlib", "Unlicense", "ISC"}


def classify_license(root):
    cands = []
    try:
        for f in os.listdir(root):
            if re.match(r"^(licen[cs]e|copying|copyright|unlicense)", f, re.I):
                p = os.path.join(root, f)
                if os.path.isfile(p) and os.path.getsize(p) < 200_000:
                    cands.append(p)
    except OSError:
        pass
    for p in cands:
        try:
            head = open(p, errors="ignore").read(6000)
        except OSError:
            continue
        for name, rx in LICENSE_MARKERS:
            if rx.search(head):
                return name, os.path.basename(p)
    # fallback: package manifests
    for man, key in (("package.json", "license"), ("Cargo.toml", "license"),
                     ("pyproject.toml", "license")):
        p = os.path.join(root, man)
        if os.path.isfile(p):
            try:
                txt = open(p, errors="ignore").read(20_000)
            except OSError:
                continue
            m = re.search(rf'{key}\s*[:=]\s*["\']([A-Za-z0-9.\-+]+)["\']', txt)
            if m:
                return m.group(1), man
    return "none", None


def git_meta(root):
    def g(*a):
        try:
            return subprocess.run(["git", "-C", root, *a], capture_output=True,
                                  text=True, timeout=25).stdout.strip()
        except Exception:
            return ""
    url = g("config", "--get", "remote.origin.url")
    sha = g("rev-parse", "HEAD")
    date = g("log", "-1", "--format=%cI")
    return url, sha[:7] if sha else "", date


def scan(root):
    ext = Counter()
    hits = {k: [] for k in CATEGORY_PATTERNS}
    files = 0
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in PRUNE and not d.startswith(".")]
        rel = os.path.relpath(dirpath, root)
        depth = 0 if rel == "." else rel.count(os.sep) + 1
        if depth > 6:
            dirnames[:] = []
            continue
        for fn in filenames:
            e = os.path.splitext(fn)[1].lower()
            if e in CODE_EXT:
                ext[e] += 1
                files += 1
        if files > 120000:
            break
        # category detection on directory names (depth 1..4 preferred)
        base = os.path.basename(dirpath)
        if rel != "." and depth <= 5 and not SKIP_DIR_HINT.search(base):
            ncode = sum(1 for fn in filenames if os.path.splitext(fn)[1].lower() in CODE_EXT)
            if ncode:
                for cat, rx in CATEGORY_PATTERNS.items():
                    if rx.search(base):
                        hits[cat].append({"path": rel, "code_files": ncode})
    for cat in hits:
        hits[cat].sort(key=lambda h: (-h["code_files"], h["path"]))
        hits[cat] = hits[cat][:6]
    return ext, files, hits


def main():
    out = []
    names = sorted(os.listdir(CORPUS))
    lock = {}
    lockp = os.path.expanduser("~/cloned-free-games/GAMES.lock")
    if os.path.isfile(lockp):
        for line in open(lockp, errors="ignore"):
            if line.startswith("#") or not line.strip():
                continue
            f = line.rstrip("\n").split("\t")
            if len(f) >= 3:
                lock[f[0]] = {"url": f[1], "commit": f[2]}
    for i, n in enumerate(names, 1):
        root = os.path.join(CORPUS, n)
        if not os.path.isdir(os.path.join(root, ".git")):
            continue
        lic, licfile = classify_license(root)
        url, sha, date = git_meta(root)
        if not url:
            lk = lock.get(n, {})
            url, sha = lk.get("url", ""), lk.get("commit", "")
        ext, files, hits = scan(root)
        top = [k for k, _ in ext.most_common(4)]
        out.append({
            "name": n, "upstream": url, "commit": sha, "commit_date": date,
            "license": lic, "license_file": licfile, "clean": lic in CLEAN,
            "code_files": files, "ext": dict(ext.most_common(8)), "langs": top,
            "subsystems": {k: v for k, v in hits.items() if v},
        })
        print(f"[{i}/{len(names)}] {n:42s} {lic:14s} files={files:6d} cats={','.join(sorted(hits)) or '-'}",
              file=sys.stderr)
    dest = os.path.expanduser("~/Projects/game-backends/.mine/corpus.json")
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    json.dump(out, open(dest, "w"), indent=1)
    print(f"\nwrote {dest}: {len(out)} clones")
    by = Counter(c for e in out for c in e["subsystems"])
    print("clones per category:", dict(by))
    print("licences:", dict(Counter(e["license"] for e in out).most_common()))


if __name__ == "__main__":
    main()
