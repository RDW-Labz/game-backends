#!/usr/bin/env python3
"""Seed the library from curated upstreams (fresh from Git) plus path-level
picks inside the existing clone corpus.

Every entry is licence-screened from the actual licence text at the pinned
commit: clean licences are vendored (code copied under entries/<cat>/<slug>/src),
everything else is catalogued reference-only with the licence flag and no code.
"""
import json, os, re, shutil, subprocess, sys, tempfile, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gblib import (ROOT, CATEGORIES, entry_path, save_entry, license_from_file,
                   find_license, verdict, CLEAN, ATTRIB)

CORPUS = os.path.expanduser("~/cloned-free-games/games")
VENDOR_CAP = 12 * 1024 * 1024
CODE_EXT = {".py", ".c", ".cc", ".cpp", ".cxx", ".h", ".hh", ".hpp", ".hxx", ".cs",
            ".java", ".kt", ".js", ".mjs", ".ts", ".rs", ".go", ".lua", ".gd", ".zig",
            ".frag", ".vert", ".glsl", ".json", ".toml"}

# (slug, name, url, category, system, language, why)
UPSTREAMS = [
 # ---- engines / engine subsystems -------------------------------------------
 ("godot", "Godot Engine", "godotengine/godot", "engines", "full 2D/3D engine: scene tree, physics, net, script VMs", "c++",
  "Reference open-source AAA-adjacent engine; the whole runtime is the backend."),
 ("bevy", "Bevy", "bevyengine/bevy", "engines", "ECS-first engine: schedules, asset pipeline, render graph", "rust",
  "Modern ECS engine architecture worth reading for scheduling and system design."),
 ("o3de", "Open 3D Engine (O3DE)", "o3de/o3de", "engines", "AAA engine: ECS, gems, asset processor, multiplayer", "c++",
  "Amazon's Apache-licensed AAA engine — the clearest free AAA architecture reference."),
 ("libgdx", "libGDX", "libgdx/libgdx", "engines", "cross-platform game framework, scene2d, asset manager", "java",
  "Battle-tested framework used by shipped commercial 2D/3D titles."),
 ("cocos2d-x", "Cocos2d-x", "cocos2d/cocos2d-x", "engines", "mobile-first 2D/3D engine core", "c++",
  "Shipping engine for a decade of mobile titles; clean scene/action model."),
 ("urho3d", "Urho3D", "urho3d/urho3d", "engines", "compact 3D engine: scene graph, renderer, physics, net", "c++",
  "Small enough to read end-to-end, complete enough to ship."),
 ("raylib", "raylib", "raysan5/raylib", "engines", "minimal game programming framework (platform, gfx, audio)", "c",
  "The canonical 'little engine you can actually read' — good for embedders."),
 ("panda3d", "Panda3D", "panda3d/panda3d", "engines", "engine with scene graph, panda3d net (distributed objects)", "c++",
  "Disney/CMU engine; notable for its built-in distributed-object networking."),
 ("monogame", "MonoGame", "MonoGame/MonoGame", "engines", "XNA-compatible framework: content pipeline, gfx, input", "c#",
  "Microsoft XNA lineage; strong content pipeline and platform abstraction (MS-PL, not vendored)."),
 ("flaxengine", "Flax Engine", "FlaxEngine/FlaxEngine", "engines", "full C++/C# engine with editor", "c++",
  "Gated: custom Flax licence — catalogued as a reference, never vendored."),
 ("sokol", "sokol", "floooh/sokol", "engines", "single-header platform/gfx/audio/app layer", "c",
  "Header-only app/GFX substrate used to bootstrap engines and tools; zlib, tiny."),
 ("godot-cpp", "godot-cpp (GDExtension bindings)", "godotengine/godot-cpp", "engines", "C++ bindings/extension ABI for Godot", "c++",
  "The engine-extension boundary: how a real engine exposes gameplay code to C++."),
 ("entt", "EnTT", "skypjack/entt", "engines", "header-only ECS: registry, views, groups, signals", "c++",
  "The reference C++ ECS used across indie and commercial engines."),
 ("flecs", "Flecs", "SanderMertens/flecs", "engines", "ECS with prefabs, pipelines, hierarchies, REST explorer", "c",
  "Batteries-included ECS: relationship traits and system pipelines out of the box."),
 # ---- physics ---------------------------------------------------------------
 ("box2d", "Box2D", "erincatto/box2d", "physics", "2D rigid-body collision + dynamics solver", "c++",
  "The 2D physics standard (Angry Birds, Crayon Physics) — MIT."),
 ("joltphysics", "Jolt Physics", "jrouwe/JoltPhysics", "physics", "3D rigid bodies, constraints, character controller, vehicles", "c++",
  "The physics engine behind Horizon Forbidden West — MIT, active, AAA-proven."),
 ("bullet3", "Bullet Physics", "bulletphysics/bullet3", "physics", "3D collision/dynamics + soft body + ML", "c++",
  "Long-standing open physics used in AAA and robotics (zlib)."),
 ("physx", "NVIDIA PhysX", "NVIDIA-Omniverse/PhysX", "physics", "GPU/CPU 3D rigid body, cloth, particles, vehicles", "c++",
  "Shipping AAA physics (Unreal/Unity lineage) released BSD-3."),
 ("rapier", "Rapier", "dimforge/rapier", "physics", "Rust 2D/3D physics with deterministic solver + WASM build", "rust",
  "Deterministic physics for rollback netcode and server-authoritative sims."),
 ("chipmunk2d", "Chipmunk2D", "slembcke/Chipmunk2D", "physics", "2D rigid bodies, constraints, spatial index", "c",
  "Compact MIT 2D physics used in indie shipping titles."),
 ("reactphysics3d", "ReactPhysics3D", "DanielChappuis/reactphysics3d", "physics", "3D physics: broadphase, constraints, raycast", "c++",
  "Clean zlib 3D physics — the readable alternative to Bullet."),
 ("libccd", "libccd", "danfis/libccd", "physics", "convex collision detection (GJK/EPA) library", "c",
  "The collision-detection kernel other engines embed."),
 # ---- math ------------------------------------------------------------------
 ("glm", "GLM", "g-truc/glm", "math", "header-only GLSL-style vector/matrix/quaternion math", "c++",
  "De-facto C++ graphics math library; MIT."),
 ("cglm", "cglm", "recp/cglm", "math", "SIMD-accelerated C math (vec/mat/quat/affine/euler)", "c",
  "Fast, C-friendly maths with SIMD paths — good for engines written in C."),
 ("directxmath", "DirectXMath", "microsoft/DirectXMath", "math", "SIMD math library (SSE/AVX/NEON) for games", "c++",
  "Microsoft's game math: the SIMD reference implementation."),
 ("mathfu", "MathFu", "google/mathfu", "math", "vector/matrix/quaternion math with SIMD backends", "c++",
  "Google's game math; Apache-2.0, portable SIMD."),
 ("handmademath", "Handmade Math", "HandmadeMath/HandmadeMath", "math", "single-header 3D math for games", "c",
  "Public-domain single header — the drop-in maths for small engines."),
 ("libfixmath", "libfixmath", "PetteriAimonen/libfixmath", "math", "fixed-point math for deterministic simulation", "c",
  "Determinism substrate for lockstep netcode where floats are not allowed."),
 ("eigen", "Eigen", "eigenteam/eigen-git-mirror", "math", "dense/sparse linear algebra (MPL-2.0)", "c++",
  "The linear-algebra workhorse behind physics and ML code — copyleft, reference only."),
 # ---- loot / economy --------------------------------------------------------
 ("loot-tables-js", "Loot-Tables (JS)", "Mopolo/Loot-Tables", "loot-economy", "declarative weighted loot tables with nested rolls", "javascript",
  "Small MIT loot-table engine: weighted picks, nested tables, guaranteed drops."),
 ("loot-table-gpl", "loot-table (rue-williams)", "rue-williams/loot-table", "loot-economy", "loot table random generator", "typescript",
  "Drop-table implementation catalogued for reference (GPL-3.0, not vendored)."),
 # ---- gameplay --------------------------------------------------------------
 ("recastnavigation", "Recast & Detour", "recastnavigation/recastnavigation", "gameplay", "navmesh generation + pathfinding + crowd steering", "c++",
  "The navmesh pipeline nearly every 3D game uses; zlib."),
 ("libtcod", "libtcod", "libtcod/libtcod", "gameplay", "roguelike toolkit: FOV, pathfinding, RNG, line drawing, console", "c++",
  "Tactical/roguelike gameplay substrate: field of view, A*, scheduling."),
 ("behaviortree-cpp", "BehaviorTree.CPP", "BehaviorTree/BehaviorTree.CPP", "gameplay", "behaviour trees for AI agents with blackboards", "c++",
  "Industry behaviour-tree implementation (MIT) with a visual editor."),
 ("goap-crashkonijn", "GOAP (crashkonijn)", "crashkonijn/GOAP", "gameplay", "goal-oriented action planning for game AI (Unity/C#)", "c#",
  "Planning AI rather than scripted FSMs — drop-in for Unity agents."),
 ("pathfinding-js", "PathFinding.js", "qiao/PathFinding.js", "gameplay", "A*, IDA*, JPS, Dijkstra, BiA* on grids", "javascript",
  "Grid pathfinding algorithms in one readable package (MIT)."),
 # ---- netcode ---------------------------------------------------------------
 ("gamenetworkingsockets", "GameNetworkingSockets", "ValveSoftware/GameNetworkingSockets", "netcode", "reliable/unreliable encrypted message transport (Valve)", "c++",
  "Valve's shipping transport layer (CS:GO/Dota lineage), BSD-3."),
 ("yojimbo", "yojimbo", "networkprotocol/yojimbo", "netcode", "client/server game protocol: encryption, reliability, connection tags", "c++",
  "Glenn Fiedler's production netcode library on top of reliable.io."),
 ("netcode-io", "netcode.io", "mas-bandwidth/netcode", "netcode", "secure UDP connection protocol with token auth", "c",
  "The connect-token handshake pattern that hardened game netcode."),
 ("reliable-io", "reliable.io", "mas-bandwidth/reliable.io", "netcode", "packet fragmentation/ack/redundancy layer over UDP", "c",
  "Minimal reliability layer — the piece under most custom game protocols."),
 ("enet", "ENet", "lsalzman/enet", "netcode", "reliable UDP networking for games", "c",
  "The classic MIT reliable-UDP library behind countless indie netcode stacks."),
 ("ggrs", "GGRS", "gschup/ggrs", "netcode", "rollback netcode (GGPO-style) in Rust with WASM support", "rust",
  "Rollback for fighting-game style netcode; deterministic-sim friendly."),
 ("kcp", "KCP", "skywind3000/kcp", "netcode", "fast reliable ARQ protocol (TCP-like over UDP)", "c",
  "Low-latency reliable transport used by Chinese MMOs and realtime servers."),
 ("nakama", "Nakama", "heroiclabs/nakama", "netcode", "game backend server: matchmaking, realtime, leaderboards, storage", "go",
  "Full scalable game backend (Apache-2.0): the server side of netcode."),
 ("colyseus", "Colyseus", "colyseus/colyseus", "netcode", "authoritative room-based multiplayer framework with state sync", "typescript",
  "Room/state-sync server framework with schema-based delta encoding."),
 # ---- save / state ----------------------------------------------------------
 ("cereal", "cereal", "USCiLab/cereal", "save-state", "C++11 serialization: JSON/binary/XML archives, versioning", "c++",
  "Save-game serialisation with schema versioning — BSD-3."),
 ("sqlite", "SQLite", "sqlite/sqlite", "save-state", "embedded SQL database engine (single-file world saves)", "c",
  "Public domain: the durable store behind MMO/CRPG world state."),
 ("cjson", "cJSON", "DaveGamble/cJSON", "save-state", "ultralight JSON parser/writer", "c",
  "The smallest sane JSON layer for save files (MIT)."),
 ("yyjson", "yyjson", "ibireme/yyjson", "save-state", "high-performance JSON library (read/write/mutate)", "c",
  "Fast JSON for large save blobs and save-format tooling (MIT)."),
 ("flatbuffers", "FlatBuffers", "google/flatbuffers", "save-state", "zero-copy serialization, schema-driven", "c++",
  "Zero-copy state/save format used in shipped engines (Apache-2.0)."),
 # ---- procgen ---------------------------------------------------------------
 ("fastnoiselite", "FastNoiseLite", "Auburn/FastNoiseLite", "procgen", "single-header noise (perlin/simplex/cellular/fractal)", "c",
  "The noise layer under terrain and texture generation; MIT, tiny."),
 ("fastnoise2", "FastNoise2", "Auburn/FastNoise2", "procgen", "SIMD noise generation library with node graphs", "c++",
  "Production-grade deterministic noise with SIMD — the upgrade path from FastNoiseLite."),
 ("wavefunctioncollapse", "WaveFunctionCollapse", "mxgmn/WaveFunctionCollapse", "procgen", "constraint-based tile/bitmap generation", "c#",
  "The WFC reference implementation that spawned a generation technique family."),
 ("tracery", "Tracery", "galaxykate/tracery", "procgen", "grammar-based generative text/structure", "javascript",
  "Grammar generation for quests, names and content; Apache-2.0."),
 ("dungeon-generator-bsp", "Dungeon-Generator (BSP)", "Adrian104/Dungeon-Generator", "procgen", "BSP dungeon generation (C#/Unity)", "c#",
  "Readable BSP room/corridor generator, MIT."),
]

# Path-level picks inside the clone corpus (loot/economy and gameplay material
# that only exists inside shipped games). Every path verified to exist in
# ~/cloned-free-games/games at the pinned commit.
CORPUS_PICKS = [
 ("Cataclysm-DDA", "data/json/itemgroups", "loot-economy", "item group / loot tables (JSON)", "json",
  "DDA's hand-tuned loot weight tables: item groups, distributions, spawn odds."),
 ("crawl", "crawl-ref/source", "loot-economy", "item generation (makeitem) and drop logic", "c++",
  "Dungeon Crawl's item-generation and drop tables: the roguelike loot gold standard."),
 ("DevilutionX", "Source", "loot-economy", "Diablo item generation, affixes, quest drops", "c++",
  "Diablo 1 item/affix generation made readable — loot design from a shipped AAA title."),
 ("widelands", "src/economy", "loot-economy", "economy simulation: production chains, ware routing, markets", "c++",
  "A real economy sim: production sites, ware queues, transport scheduling."),
 ("openmu", "src/GameLogic/Views/Trade", "loot-economy", "player trade/market views and pricing", "c#",
  "Trade and pricing logic from a running MMO server (MIT)."),
 ("crawl", "crawl-ref/source/dat/des", "procgen", "vault/branch layout definitions (DES)", "text",
  "Crawl's vault language — hand-authored procgen constraints at scale."),
 ("veloren", "world", "procgen", "world generation (terrain, biomes, caves, structures)", "rust",
  "Full procedural worldgen pipeline for an open-world multiplayer RPG."),
 ("cataclysm-bn", "src/mapgen", "procgen", "map and city generation", "c++",
  "Bright Nights' mapgen: overmap, city layout, special sites."),
 ("freeminer", "src/mapgen", "procgen", "voxel map generation (biomes, caves, ores)", "c++",
  "The voxel worldgen pipeline: mapgen stages, biome noise, cave carving."),
 ("space-station-14", "Content.Shared/Procedural", "procgen", "procedural station/AI content generation", "c#",
  "Procedural generation inside a live multiplayer C# game."),
 ("veloren", "common/src/comp", "gameplay", "ECS gameplay components (combat, inventory, stats, buffs)", "rust",
  "Veloren's component design for a shipped multiplayer RPG."),
 ("Mindustry", "core/src/mindustry/entities", "gameplay", "entity/unit/bullet systems for a shipped RTS", "java",
  "High-performance entity and bullet handling in a commercial indie RTS."),
 ("Mindustry", "core/src/mindustry/ai", "gameplay", "unit AI and pathfinding", "java",
  "Practical RTS unit AI and pathing at scale."),
 ("openmu", "src/GameLogic", "gameplay", "MMO gameplay logic: combat, skills, inventory, quests", "c#",
  "Server-authoritative gameplay systems from a running MMO (MIT)."),
 ("thrive", "src/native/physics", "physics", "custom rigid-body physics for a sim game", "c++",
  "A hand-rolled physics layer inside a shipping simulation game (Apache-2.0)."),
 ("Principia", "lib", "physics", "Box2D-derived 2D physics with custom collision handling", "c++",
  "Box2D fork tuned for a sandbox physics game — see what games change in the solver."),
 ("openclonk", "src/network", "netcode", "Clonk-style network sync and control queues", "c++",
  "Old-school deterministic netcode with per-player control queues (ISC — vendored)."),
 ("openmu", "src/Network", "netcode", "MMO network protocol, packet handlers, encryption", "c#",
  "Complete game-client wire protocol from a running server (MIT — vendored)."),
 ("warzone2100", "lib/netplay", "netcode", "RTS netplay: sync, desync detection, rejoin", "c++",
  "Rejoinable RTS netcode with desync detection."),
 ("Freeciv", "common/networking", "netcode", "turn-based client/server protocol and packet layer", "c",
  "Long-lived packet protocol for a 4X game with AI/observer clients."),
]


def sh(*a, cwd=None):
    return subprocess.run(a, cwd=cwd, capture_output=True, text=True, timeout=300)


def code_size(p):
    tot = 0
    for dp, dn, fn in os.walk(p):
        dn[:] = [d for d in dn if d not in {".git", "node_modules", "__pycache__"}]
        for f in fn:
            if os.path.splitext(f)[1].lower() in CODE_EXT:
                try:
                    tot += os.path.getsize(os.path.join(dp, f))
                except OSError:
                    pass
    return tot


def add_upstream(slug, name, repo, cat, system, lang, why, tmp):
    existing = entry_path(cat, slug)
    if os.path.isfile(os.path.join(existing, "entry.json")):
        return "skip"
    work = os.path.join(tmp, slug)
    r = sh("git", "clone", "--depth", "1", "--filter=blob:none", "--no-checkout",
           f"https://github.com/{repo}.git", work) if False else \
        sh("git", "clone", "--depth", "1", f"https://github.com/{repo}.git", work)
    if r.returncode != 0:
        print(f"  FAIL clone {repo}: {r.stderr.strip().splitlines()[-1][:120]}")
        return "fail"
    commit = sh("git", "-C", work, "rev-parse", "HEAD").stdout.strip()[:12]
    lic, lf = find_license(work)
    v = verdict(lic)
    size = code_size(work)
    rec = {
        "slug": slug, "name": name, "category": cat, "system": system,
        "description": f"{name} — {system}. Upstream `{repo}`.", "why": why,
        "language": lang, "license": lic, "license_verdict": v,
        "upstream": f"https://github.com/{repo}", "commit": commit,
        "source": "github-api", "size_bytes": size,
        "added_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }
    if lf:
        rec["license_file"] = os.path.basename(lf)
    dest = entry_path(cat, slug)
    if lic in CLEAN or lic in ATTRIB:
        if size <= VENDOR_CAP:
            os.makedirs(dest, exist_ok=True)
            src = os.path.join(dest, "src")
            if os.path.isdir(src):
                shutil.rmtree(src)
            shutil.copytree(work, src, ignore=shutil.ignore_patterns(
                ".git", ".github", "node_modules", "__pycache__", "*.png", "*.jpg",
                "*.gif", "*.mp4", "*.zip", "*.jar", "*.dll", "*.so"),
                symlinks=True, ignore_dangling_symlinks=True)
            if lf:
                shutil.copyfile(lf, os.path.join(dest, "LICENSE"))
            rec["delivery"] = "vendored"
            rec["vendored_path"] = "src/"
        else:
            rec["delivery"] = "reference"
            rec["reference_reason"] = f"size gate: {size//1024//1024} MB of source > {VENDOR_CAP//1024//1024} MB cap"
    else:
        rec["delivery"] = "reference"
        rec["reference_reason"] = f"licence: {lic} ({v})"
    save_entry(rec)
    shutil.rmtree(work, ignore_errors=True)
    print(f"  + {cat:13s} {slug:24s} {lic:14s} {rec['delivery']:9s} {size//1024:6d} KB")
    return "ok"


def add_corpus_pick(clone, path, cat, system, lang, why):
    root = os.path.join(CORPUS, clone)
    target = os.path.join(root, path)
    if not os.path.exists(target):
        print(f"  MISSING {clone}/{path}")
        return "fail"
    slug = re.sub(r"[^a-z0-9]+", "-", f"{clone}-{path}".lower()).strip("-")
    slug = re.sub(r"-+", "-", slug)[:70]
    dest = entry_path(cat, slug)
    if os.path.isfile(os.path.join(dest, "entry.json")):
        return "skip"
    lic, lf = find_license(root)
    v = verdict(lic)
    commit = sh("git", "-C", root, "rev-parse", "HEAD").stdout.strip()[:12]
    url = sh("git", "-C", root, "config", "--get", "remote.origin.url").stdout.strip()
    nfiles = 0
    for dp, dn, fn in os.walk(target):
        nfiles += len(fn)
    rec = {
        "slug": slug, "name": f"{clone} — {os.path.basename(path.rstrip('/'))}",
        "category": cat, "system": system,
        "description": f"`{path}` inside {clone} ({nfiles} files).", "why": why,
        "language": lang, "license": lic, "license_verdict": v,
        "upstream": url, "commit": commit, "path_in_upstream": path,
        "source": f"corpus:cloned-free-games/{clone}@{commit}",
        "added_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "entry_points": [path],
    }
    os.makedirs(dest, exist_ok=True)
    if os.path.isdir(target):
        ncode = sum(1 for dp, dn, fn in os.walk(target)
                    for f in fn if os.path.splitext(f)[1].lower() in CODE_EXT)
        rec["code_files"] = ncode
        size = code_size(target)
        rec["size_bytes"] = size
        if (lic in CLEAN or lic in ATTRIB) and size <= VENDOR_CAP:
            src = os.path.join(dest, "src")
            if os.path.isdir(src):
                shutil.rmtree(src)
            shutil.copytree(target, src, ignore=shutil.ignore_patterns(
                ".git", "node_modules", "__pycache__"))
            if lf:
                shutil.copyfile(lf, os.path.join(dest, "LICENSE"))
                rec["license_file"] = os.path.basename(lf)
            rec["delivery"] = "vendored"
            rec["vendored_path"] = "src/"
        else:
            rec["delivery"], rec["reference_reason"] = "reference", f"licence: {lic} ({v})"
    else:
        rec["delivery"], rec["reference_reason"] = "reference", f"licence: {lic} ({v})"
        rec["code_files"] = 1
    save_entry(rec)
    print(f"  + {cat:13s} {slug[:32]:32s} {lic:22s} {rec['delivery']} (corpus)")
    return "ok"


def main():
    tmp = tempfile.mkdtemp(prefix="gbl-seed-")
    ok = skip = fail = 0
    print("== curated upstreams ==")
    for slug, name, repo, cat, system, lang, why in UPSTREAMS:
        r = add_upstream(slug, name, repo, cat, system, lang, why, tmp)
        ok += r == "ok"; skip += r == "skip"; fail += r == "fail"
    print("== corpus path picks ==")
    for clone, path, cat, system, lang, why in CORPUS_PICKS:
        r = add_corpus_pick(clone, path, cat, system, lang, why)
        ok += r == "ok"; skip += r == "skip"; fail += r == "fail"
    shutil.rmtree(tmp, ignore_errors=True)
    print(f"\nadded={ok} skipped={skip} failed={fail}")


if __name__ == "__main__":
    main()
