# game-backends — catalogue

_Generated 2026-11-15 06:48 UTC · 177 entries · 67 vendored, 110 reference-only · see POLICY.md for the licence gate._

| category | entries | vendored | reference |
|---|---|---|---|
| [engines](#engines) — Game engines and engine subsystems | 44 | 12 | 32 |
| [physics](#physics) — Physics | 22 | 7 | 15 |
| [math](#math) — Math libraries | 16 | 11 | 5 |
| [loot-economy](#loot-economy) — Loot / drop and economy rolls | 15 | 4 | 11 |
| [gameplay](#gameplay) — Gameplay systems (combat, AI, pathing, quests, inventories) | 24 | 9 | 15 |
| [netcode](#netcode) — Networking / netcode | 34 | 13 | 21 |
| [save-state](#save-state) — Save / state systems | 9 | 5 | 4 |
| [procgen](#procgen) — Procedural generation | 13 | 6 | 7 |


## engines

**Game engines and engine subsystems** — 44 entries

| name | what it provides | lang | licence | delivery | upstream |
|---|---|---|---|---|---|
| [AAAAXY — engine](entries/engines/aaaaxy-engine/README.md) | engine core / runtime shell (main loop, scene or ECS plumbing) | go | Apache-2.0 | vendored | [divVerent/aaaaxy](https://github.com/divVerent/aaaaxy) @ `07d7252` |
| [ancientbeast — engine](entries/engines/ancientbeast-engine/README.md) | engine core / runtime shell (main loop, scene or ECS plumbing) | ts | AGPL-3.0 | reference | [FreezingMoon/AncientBeast](https://github.com/FreezingMoon/AncientBeast) @ `1b45dc2` |
| [Arch](entries/engines/genaray-arch/README.md) | A high-performance C# based Archetype & Chunks Entity Component System (ECS) with optional multithreading. | c# | Apache-2.0 | reference | [genaray/Arch](https://github.com/genaray/Arch) @ `2026-11-09 (branch tip at catalogue time)` |
| [Bevy](entries/engines/bevy/README.md) | ECS-first engine: schedules, asset pipeline, render graph | rust | Apache-2.0 | reference | [bevyengine/bevy](https://github.com/bevyengine/bevy) @ `7ea4827e16d5` |
| [biomes-game — ecs](entries/engines/biomes-game-ecs/README.md) | engine core / runtime shell (main loop, scene or ECS plumbing) | ts | MIT | vendored | [ill-inc/biomes-game](https://github.com/ill-inc/biomes-game) @ `669da23` |
| [carp — core](entries/engines/carp-core/README.md) | engine core / runtime shell (main loop, scene or ECS plumbing) | h | Apache-2.0 | vendored | [carp-lang/Carp](https://github.com/carp-lang/Carp) @ `ad5a96e` |
| [CBG----Clavierhaus-BackGammon — engine-core](entries/engines/cbg-clavierhaus-backgammon-engine-core/README.md) | engine core / runtime shell (main loop, scene or ECS plumbing) | c | GPL-3.0 | reference | [clavierhaus/gnubg-android](https://github.com/clavierhaus/gnubg-android) @ `6202857` |
| [Cocos2d-x](entries/engines/cocos2d-x/README.md) | mobile-first 2D/3D engine core | c++ | MIT | reference | [cocos2d/cocos2d-x](https://github.com/cocos2d/cocos2d-x) @ `7a5282a301a1` |
| [DevilutionX — engine](entries/engines/devilutionx-engine/README.md) | engine core / runtime shell (main loop, scene or ECS plumbing) | cpp | Sustainable-Use-1.0 | reference | [diasurgical/devilutionX.git](https://github.com/diasurgical/devilutionX.git) @ `b325996` |
| [doriax](entries/engines/doriaxengine-doriax/README.md) | Game engine for 2D and 3D projects with entity component system (ECS) and data-oriented design | c++ | MIT | reference | [doriaxengine/doriax](https://github.com/doriaxengine/doriax) @ `2026-11-15 (branch tip at catalogue time)` |
| [ecs-faq](entries/engines/sandermertens-ecs-faq/README.md) | Frequently asked questions about Entity Component Systems | n/a | unknown | reference | [SanderMertens/ecs-faq](https://github.com/SanderMertens/ecs-faq) @ `2026-07-01 (branch tip at catalogue time)` |
| [Entitas](entries/engines/sschmid-entitas/README.md) | Entitas is a super fast Entity Component System (ECS) Framework specifically made for C# and Unity | c# | MIT | vendored | [sschmid/Entitas](https://github.com/sschmid/Entitas) @ `37547d1bd280` |
| [EntityComponentSystemSamples](entries/engines/unity-technologies-entitycomponentsystemsamples/README.md) | see upstream | c# | none | reference | [Unity-Technologies/EntityComponentSystemSamples](https://github.com/Unity-Technologies/EntityComponentSystemSamples) @ `6786a741ee1f` |
| [EnTT](entries/engines/entt/README.md) | header-only ECS: registry, views, groups, signals | c++ | MIT | vendored | [skypjack/entt](https://github.com/skypjack/entt) @ `1dcd7aab6548` |
| [Flax Engine](entries/engines/flaxengine/README.md) | full C++/C# engine with editor | c++ | Flax-EULA | reference | [FlaxEngine/FlaxEngine](https://github.com/FlaxEngine/FlaxEngine) @ `533d9332f34a` |
| [Flecs](entries/engines/flecs/README.md) | ECS with prefabs, pipelines, hierarchies, REST explorer | c | MIT | reference | [SanderMertens/flecs](https://github.com/SanderMertens/flecs) @ `fa6554710d0d` |
| [gamezone — core](entries/engines/gamezone-core/README.md) | engine core / runtime shell (main loop, scene or ECS plumbing) | js | Apache-2.0 | vendored | [kunjgit/GameZone](https://github.com/kunjgit/GameZone) @ `ac4ce20` |
| [glas — core](entries/engines/glas-core/README.md) | engine core / runtime shell (main loop, scene or ECS plumbing) | js | MIT | vendored | [lume/glas](https://github.com/lume/glas) @ `716d931` |
| [Godot Engine](entries/engines/godot/README.md) | full 2D/3D engine: scene tree, physics, net, script VMs | c++ | MIT | reference | [godotengine/godot](https://github.com/godotengine/godot) @ `4d0d43b77dd2` |
| [godot-cpp (GDExtension bindings)](entries/engines/godot-cpp/README.md) | C++ bindings/extension ABI for Godot | c++ | MIT | reference | [godotengine/godot-cpp](https://github.com/godotengine/godot-cpp) @ `2a4c066e1e8c` |
| [gzdoom — engine](entries/engines/gzdoom-engine/README.md) | engine core / runtime shell (main loop, scene or ECS plumbing) | h | GPL-3.0 | reference | [ZDoom/gzdoom.git](https://github.com/ZDoom/gzdoom.git) @ `c26ce2e` |
| [julius — core](entries/engines/julius-core/README.md) | engine core / runtime shell (main loop, scene or ECS plumbing) | c | AGPL-3.0 | reference | [bvschaik/julius](https://github.com/bvschaik/julius) @ `34d1ecd` |
| [libGDX](entries/engines/libgdx/README.md) | cross-platform game framework, scene2d, asset manager | java | Apache-2.0 | reference | [libgdx/libgdx](https://github.com/libgdx/libgdx) @ `b5494c47d9ae` |
| [Mindustry — core](entries/engines/mindustry-core/README.md) | engine core / runtime shell (main loop, scene or ECS plumbing) | java | GPL-3.0 | reference | [Anuken/Mindustry.git](https://github.com/Anuken/Mindustry.git) @ `b873c01` |
| [MonoGame](entries/engines/monogame/README.md) | XNA-compatible framework: content pipeline, gfx, input | c# | MS-PL | reference | [MonoGame/MonoGame](https://github.com/MonoGame/MonoGame) @ `76ed1c24f7db` |
| [Open 3D Engine (O3DE)](entries/engines/o3de/README.md) | AAA engine: ECS, gems, asset processor, multiplayer | c++ | Apache-2.0 | reference | [o3de/o3de](https://github.com/o3de/o3de) @ `32d6eddc51f9` |
| [open_spiel — core](entries/engines/open-spiel-core/README.md) | engine core / runtime shell (main loop, scene or ECS plumbing) | py | Apache-2.0 | vendored | [google-deepmind/open_spiel](https://github.com/google-deepmind/open_spiel) @ `3c53616` |
| [openrct2 — core](entries/engines/openrct2-core/README.md) | engine core / runtime shell (main loop, scene or ECS plumbing) | cpp | GPL-3.0 | reference | [OpenRCT2/OpenRCT2.git](https://github.com/OpenRCT2/OpenRCT2.git) @ `3b7114c` |
| [OpenSurge — core](entries/engines/opensurge-core/README.md) | engine core / runtime shell (main loop, scene or ECS plumbing) | c | GPL-3.0 | reference | [alemart/opensurge.git](https://github.com/alemart/opensurge.git) @ `61975c2` |
| [optick — core](entries/engines/optick-core/README.md) | engine core / runtime shell (main loop, scene or ECS plumbing) | hpp | MIT | vendored | [bombomby/optick](https://github.com/bombomby/optick) @ `8abd28d` |
| [Panda3D](entries/engines/panda3d/README.md) | engine with scene graph, panda3d net (distributed objects) | c++ | BSD-3-Clause | reference | [panda3d/panda3d](https://github.com/panda3d/panda3d) @ `ec9ea0a93a7d` |
| [Pekka-Kana-2 — engine](entries/engines/pekka-kana-2-engine/README.md) | engine core / runtime shell (main loop, scene or ECS plumbing) | c | MIT | vendored | [danilolc/pk2](https://github.com/danilolc/pk2) @ `b1c5597` |
| [Principia — core](entries/engines/principia-core/README.md) | engine core / runtime shell (main loop, scene or ECS plumbing) | cc | BSD-2-Clause | vendored | [Bithack/principia](https://github.com/Bithack/principia) @ `a1af28b` |
| [raylib](entries/engines/raylib/README.md) | minimal game programming framework (platform, gfx, audio) | c | Zlib | reference | [raysan5/raylib](https://github.com/raysan5/raylib) @ `38d0eded78d3` |
| [Red-Eclipse — engine](entries/engines/red-eclipse-engine/README.md) | engine core / runtime shell (main loop, scene or ECS plumbing) | h | CC-BY-SA-4.0 | reference | [redeclipse/base.git](https://github.com/redeclipse/base.git) @ `65d4132` |
| [sokol](entries/engines/sokol/README.md) | single-header platform/gfx/audio/app layer | c | Zlib | vendored | [floooh/sokol](https://github.com/floooh/sokol) @ `93aa187b5d38` |
| [Svelto.ECS](entries/engines/sebas77-svelto-ecs/README.md) | Svelto ECS C# Entity Component System | c# | MIT | reference | [sebas77/Svelto.ECS](https://github.com/sebas77/Svelto.ECS) @ `2025-05-01 (branch tip at catalogue time)` |
| [teeworlds — engine](entries/engines/teeworlds-engine/README.md) | engine core / runtime shell (main loop, scene or ECS plumbing) | h | CC-BY-SA-3.0 | reference | [teeworlds/teeworlds.git](https://github.com/teeworlds/teeworlds.git) @ `5d68273` |
| [TheXTech — core](entries/engines/thextech-core/README.md) | engine core / runtime shell (main loop, scene or ECS plumbing) | h | GPL-3.0 | reference | [Wohlstand/TheXTech](https://github.com/Wohlstand/TheXTech) @ `32ac864` |
| [thrive — engine](entries/engines/thrive-engine/README.md) | engine core / runtime shell (main loop, scene or ECS plumbing) | cs | GPL-3.0 | reference | [Revolutionary-Games/Thrive](https://github.com/Revolutionary-Games/Thrive) @ `bb9189f` |
| [totk-pc-recomp — runtime](entries/engines/totk-pc-recomp-runtime/README.md) | engine core / runtime shell (main loop, scene or ECS plumbing) | c | MIT | reference | [valentderah/totk-pc-recomp](https://github.com/valentderah/totk-pc-recomp) @ `ae30a61` |
| [Urho3D](entries/engines/urho3d/README.md) | compact 3D engine: scene graph, renderer, physics, net | c++ | MIT | reference | [urho3d/urho3d](https://github.com/urho3d/urho3d) @ `e0ce107356b2` |
| [veloren — scene](entries/engines/veloren-scene/README.md) | engine core / runtime shell (main loop, scene or ECS plumbing) | rs | GPL-3.0 | reference | [veloren/veloren.git](https://github.com/veloren/veloren.git) @ `cd75076` |
| [warzone2100 — framework](entries/engines/warzone2100-framework/README.md) | engine core / runtime shell (main loop, scene or ECS plumbing) | h | GPL-2.0 | reference | [Warzone2100/warzone2100.git](https://github.com/Warzone2100/warzone2100.git) @ `ceda97e` |

## physics

**Physics** — 22 entries

| name | what it provides | lang | licence | delivery | upstream |
|---|---|---|---|---|---|
| [avian](entries/physics/avianphysics-avian/README.md) | ECS-driven 2D and 3D physics engine for the Bevy game engine. | rust | Apache-2.0 | reference | [avianphysics/avian](https://github.com/avianphysics/avian) @ `2026-11-04 (branch tip at catalogue time)` |
| [Box2D](entries/physics/box2d/README.md) | 2D rigid-body collision + dynamics solver | c++ | MIT | vendored | [erincatto/box2d](https://github.com/erincatto/box2d) @ `dd8bd3fb525f` |
| [Bullet Physics](entries/physics/bullet3/README.md) | 3D collision/dynamics + soft body + ML | c++ | Zlib | reference | [bulletphysics/bullet3](https://github.com/bulletphysics/bullet3) @ `d3afe76132fc` |
| [Chipmunk2D](entries/physics/chipmunk2d/README.md) | 2D rigid bodies, constraints, spatial index | c | MIT | vendored | [slembcke/Chipmunk2D](https://github.com/slembcke/Chipmunk2D) @ `f2f3d66220b8` |
| [engine](entries/physics/galacean-engine/README.md) | A typescript interactive engine, support 2D, 3D, animation, physics, built on WebGL and glTF. | typescript | MIT | reference | [galacean/engine](https://github.com/galacean/engine) @ `2026-11-15 (branch tip at catalogue time)` |
| [hypersomnia — physics](entries/physics/hypersomnia-physics/README.md) | rigid-body collision and dynamics | h | AGPL-3.0 | reference | [TeamHypersomnia/Hypersomnia](https://github.com/TeamHypersomnia/Hypersomnia) @ `0049839` |
| [Jolt Physics](entries/physics/joltphysics/README.md) | 3D rigid bodies, constraints, character controller, vehicles | c++ | MIT | vendored | [jrouwe/JoltPhysics](https://github.com/jrouwe/JoltPhysics) @ `cf16769bb0ed` |
| [LayaAir](entries/physics/layabox-layaair/README.md) | LayaAir is a fully platform rendering engine with rich 2D/3D rendering capabilities and a mature integrated development platform | typescript | MIT | reference | [layabox/LayaAir](https://github.com/layabox/LayaAir) @ `2026-11-13 (branch tip at catalogue time)` |
| [libccd](entries/physics/libccd/README.md) | convex collision detection (GJK/EPA) library | c | BSD-3-Clause | vendored | [danfis/libccd](https://github.com/danfis/libccd) @ `7931e764a19e` |
| [matter-js](entries/physics/liabru-matter-js/README.md) | a 2D rigid body physics engine for the web ▲● ■ | javascript | MIT | vendored | [liabru/matter-js](https://github.com/liabru/matter-js) @ `b8ee71cd7f9b` |
| [melonJS](entries/physics/melonjs-melonjs/README.md) | A modern & fully featured HTML5 game engine (2D & 3D) for JavaScript/TypeScript, with WebGL/WebGPU rendering, built-in physics, Tiled map & glTF support and Web | javascript | MIT | reference | [melonjs/melonJS](https://github.com/melonjs/melonJS) @ `91f4396452e0` |
| [NVIDIA PhysX](entries/physics/physx/README.md) | GPU/CPU 3D rigid body, cloth, particles, vehicles | c++ | BSD-3-Clause | reference | [NVIDIA-Omniverse/PhysX](https://github.com/NVIDIA-Omniverse/PhysX) @ `7d6f6ac8b83e` |
| [OpenSurge — physics](entries/physics/opensurge-physics/README.md) | rigid-body collision and dynamics | c | GPL-3.0 | reference | [alemart/opensurge.git](https://github.com/alemart/opensurge.git) @ `61975c2` |
| [planck.js](entries/physics/piqnt-planck-js/README.md) | 2D JavaScript Physics Engine | typescript | MIT | reference | [piqnt/planck.js](https://github.com/piqnt/planck.js) @ `2026-11-14 (branch tip at catalogue time)` |
| [PositionBasedDynamics](entries/physics/interactivecomputergraphics-positionbaseddynamics/README.md) | PositionBasedDynamics is a library for the physically-based simulation of rigid bodies, deformable solids and fluids. | c++ | MIT | reference | [InteractiveComputerGraphics/PositionBasedDynamics](https://github.com/InteractiveComputerGraphics/PositionBasedDynamics) @ `10a70bc146a9` |
| [Principia — lib](entries/physics/principia-lib/README.md) | Box2D-derived 2D physics with custom collision handling | c++ | BSD-2-Clause | vendored | [Bithack/principia](https://github.com/Bithack/principia) @ `a1af28b127c2` |
| [Rapier](entries/physics/rapier/README.md) | Rust 2D/3D physics with deterministic solver + WASM build | rust | Apache-2.0 | reference | [dimforge/rapier](https://github.com/dimforge/rapier) @ `475caa3ff464` |
| [ReactPhysics3D](entries/physics/reactphysics3d/README.md) | 3D physics: broadphase, constraints, raycast | c++ | Zlib | vendored | [DanielChappuis/reactphysics3d](https://github.com/DanielChappuis/reactphysics3d) @ `7000610a244e` |
| [rigs-of-rods — physics](entries/physics/rigs-of-rods-physics/README.md) | rigid-body collision and dynamics | h | GPL-3.0 | reference | [RigsOfRods/rigs-of-rods](https://github.com/RigsOfRods/rigs-of-rods) @ `ebf31a2` |
| [supertux — collision](entries/physics/supertux-collision/README.md) | rigid-body collision and dynamics | hpp | GPL-3.0 | reference | [SuperTux/supertux.git](https://github.com/SuperTux/supertux.git) @ `c7cceeb` |
| [thrive — physics](entries/physics/thrive-physics/README.md) | rigid-body collision and dynamics | cs | GPL-3.0 | reference | [Revolutionary-Games/Thrive](https://github.com/Revolutionary-Games/Thrive) @ `bb9189f` |
| [thrive — physics](entries/physics/thrive-src-native-physics/README.md) | custom rigid-body physics for a sim game | c++ | GPL-3.0 | reference | [Revolutionary-Games/Thrive](https://github.com/Revolutionary-Games/Thrive) @ `bb9189f4f2e0` |

## math

**Math libraries** — 16 entries

| name | what it provides | lang | licence | delivery | upstream |
|---|---|---|---|---|---|
| [biomes-game — math](entries/math/biomes-game-math/README.md) | vector/matrix/quaternion math substrate | ts | MIT | vendored | [ill-inc/biomes-game](https://github.com/ill-inc/biomes-game) @ `669da23` |
| [cglm](entries/math/cglm/README.md) | SIMD-accelerated C math (vec/mat/quat/affine/euler) | c | MIT | vendored | [recp/cglm](https://github.com/recp/cglm) @ `b9b570b78d58` |
| [DirectXMath](entries/math/directxmath/README.md) | SIMD math library (SSE/AVX/NEON) for games | c++ | MIT | vendored | [microsoft/DirectXMath](https://github.com/microsoft/DirectXMath) @ `fef99048e3da` |
| [Eigen](entries/math/eigen/README.md) | dense/sparse linear algebra (MPL-2.0) | c++ | GPL-3.0 | reference | [eigenteam/eigen-git-mirror](https://github.com/eigenteam/eigen-git-mirror) @ `36b95962756c` |
| [glas — math](entries/math/glas-math/README.md) | vector/matrix/quaternion math substrate | js | MIT | vendored | [lume/glas](https://github.com/lume/glas) @ `716d931` |
| [GLM](entries/math/glm/README.md) | header-only GLSL-style vector/matrix/quaternion math | c++ | MIT | vendored | [g-truc/glm](https://github.com/g-truc/glm) @ `6f14f4792a0c` |
| [Handmade Math](entries/math/handmademath/README.md) | single-header 3D math for games | c | CC0-1.0 | vendored | [HandmadeMath/HandmadeMath](https://github.com/HandmadeMath/HandmadeMath) @ `661fef0893bc` |
| [hlslpp](entries/math/redorav-hlslpp/README.md) | Math library using HLSL syntax with multiplatform SIMD support | c++ | MIT | vendored | [redorav/hlslpp](https://github.com/redorav/hlslpp) @ `3d9af2e77a89` |
| [hypersomnia — math](entries/math/hypersomnia-math/README.md) | vector/matrix/quaternion math substrate | h | AGPL-3.0 | reference | [TeamHypersomnia/Hypersomnia](https://github.com/TeamHypersomnia/Hypersomnia) @ `0049839` |
| [libfixmath](entries/math/libfixmath/README.md) | fixed-point math for deterministic simulation | c | MIT | vendored | [PetteriAimonen/libfixmath](https://github.com/PetteriAimonen/libfixmath) @ `46e89b748b1f` |
| [math](entries/math/fireblade-engine-math/README.md) | A dependency free, lightweight, fast math library for 2D and 3D vectors, quaternions and matrices in Swift with (optional) SIMD support. | swift | MIT | reference | [fireblade-engine/math](https://github.com/fireblade-engine/math) @ `2026-11-14 (branch tip at catalogue time)` |
| [MathFu](entries/math/mathfu/README.md) | vector/matrix/quaternion math with SIMD backends | c++ | Apache-2.0 | vendored | [google/mathfu](https://github.com/google/mathfu) @ `da23a1227bb6` |
| [optick — simd](entries/math/optick-simd/README.md) | vector/matrix/quaternion math substrate | hpp | MIT | vendored | [bombomby/optick](https://github.com/bombomby/optick) @ `8abd28d` |
| [sh4zam](entries/math/gyrovorbis-sh4zam/README.md) | Fast linear algebra and math library for the Hitachi SuperH4 Processor (used by the Sega Dreamcast). | c | MIT | vendored | [gyrovorbis/sh4zam](https://github.com/gyrovorbis/sh4zam) @ `5b7dfc22a91f` |
| [supertux — math](entries/math/supertux-math/README.md) | vector/matrix/quaternion math substrate | hpp | GPL-3.0 | reference | [SuperTux/supertux.git](https://github.com/SuperTux/supertux.git) @ `c7cceeb` |
| [Tessel-A-tile-game — geom](entries/math/tessel-a-tile-game-geom/README.md) | vector/matrix/quaternion math substrate | ts | GPL-3.0 | reference | [gvtulder/tessel](https://github.com/gvtulder/tessel) @ `6249857` |

## loot-economy

**Loot / drop and economy rolls** — 15 entries

| name | what it provides | lang | licence | delivery | upstream |
|---|---|---|---|---|---|
| [Cataclysm-DDA — itemgroups](entries/loot-economy/cataclysm-dda-data-json-itemgroups/README.md) | item group / loot tables (JSON) | json | CC-BY-SA-3.0 | reference | [CleverRaven/Cataclysm-DDA.git](https://github.com/CleverRaven/Cataclysm-DDA.git) @ `2599825ebb8c` |
| [crawl — source](entries/loot-economy/crawl-crawl-ref-source/README.md) | item generation (makeitem) and drop logic | c++ | GPL-2.0 | reference | [crawl/crawl.git](https://github.com/crawl/crawl.git) @ `cf8c9bca9065` |
| [cyber-acid](entries/loot-economy/stateless-minds-cyber-acid/README.md) | Liquid democracy political simulator based on the automated data feed from the moneyless economy simulator Cyber Stasis. | go | MIT | reference | [stateless-minds/cyber-acid](https://github.com/stateless-minds/cyber-acid) @ `2024-12-04 (branch tip at catalogue time)` |
| [cyber-stasis](entries/loot-economy/stateless-minds-cyber-stasis/README.md) | Post-money economy simulator in the form of a free fictional game based on gift economy that tests the hypothesis of having a market system without any exchange | go | MIT | vendored | [stateless-minds/cyber-stasis](https://github.com/stateless-minds/cyber-stasis) @ `cd2585927609` |
| [DevilutionX — Source](entries/loot-economy/devilutionx-source/README.md) | Diablo item generation, affixes, quest drops | c++ | Sustainable-Use-1.0 | reference | [diasurgical/devilutionX.git](https://github.com/diasurgical/devilutionX.git) @ `b325996a89c5` |
| [die-gulde](entries/loot-economy/europa1400-community-die-gulde/README.md) | A middle age economy simulation game made with Unity. Based on the classic medieval economy simulation game Europa 1400 - The Guild. | c# | MIT | reference | [europa1400-community/die-gulde](https://github.com/europa1400-community/die-gulde) @ `2025-03-26 (branch tip at catalogue time)` |
| [konzole](entries/loot-economy/marostcs-konzole/README.md) | 09:17:02 Steam Console Client (c) Valve Corporation 09:17:02 -- type 'quit' to exit -- 09:17:02 Loading Steam API...OK. 09:17:02  09:17:03 Connecting anonymousl | n/a | unknown | reference | [marostcs/konzole](https://github.com/marostcs/konzole) @ `2021-01-15 (branch tip at catalogue time)` |
| [loot-table (rue-williams)](entries/loot-economy/loot-table-gpl/README.md) | loot table random generator | typescript | GPL-3.0 | reference | [rue-williams/loot-table](https://github.com/rue-williams/loot-table) @ `586ff23677ae` |
| [Loot-Tables (JS)](entries/loot-economy/loot-tables-js/README.md) | declarative weighted loot tables with nested rolls | javascript | MIT | vendored | [Mopolo/Loot-Tables](https://github.com/Mopolo/Loot-Tables) @ `8de49aeab208` |
| [Major-project-list](entries/loot-economy/manojkumarpatnaik-major-project-list/README.md) | A list of practical projects that anyone can solve in any programming language (See solutions). These projects are divided into multiple categories, and each ca | n/a | MIT | vendored | [ManojKumarPatnaik/Major-project-list](https://github.com/ManojKumarPatnaik/Major-project-list) @ `1bc6f5724b21` |
| [openmu — Trade](entries/loot-economy/openmu-src-gamelogic-views-trade/README.md) | player trade/market views and pricing | c# | MIT | vendored | [MUnique/OpenMU](https://github.com/MUnique/OpenMU) @ `00f737374d07` |
| [Prosperity-Wars](entries/loot-economy/nashet-prosperity-wars/README.md) | Game-like agent based economy simulator | c# | GPL-3.0 | reference | [Nashet/Prosperity-Wars](https://github.com/Nashet/Prosperity-Wars) @ `6c521ec46378` |
| [Surviv.io](entries/loot-economy/ronald106-surviv-io/README.md) |  <!doctype html> <html lang='en'>   <head>     <!-- Meta Properties -->     <meta charset='UTF-8'>     <title>surviv.io - 2d battle royale game</title>     <met | n/a | none | reference | [Ronald106/Surviv.io](https://github.com/Ronald106/Surviv.io) @ `HEAD` |
| [widelands — economy](entries/loot-economy/widelands-economy/README.md) | loot, drop-rate, trade or economy simulation | lua | GPL-2.0 | reference | [widelands/widelands.git](https://github.com/widelands/widelands.git) @ `2975377` |
| [widelands — economy](entries/loot-economy/widelands-src-economy/README.md) | economy simulation: production chains, ware routing, markets | c++ | GPL-2.0 | reference | [widelands/widelands.git](https://github.com/widelands/widelands.git) @ `29753773d9c1` |

## gameplay

**Gameplay systems (combat, AI, pathing, quests, inventories)** — 24 entries

| name | what it provides | lang | licence | delivery | upstream |
|---|---|---|---|---|---|
| [abstreet — pathfind](entries/gameplay/abstreet-pathfind/README.md) | combat, AI, pathing, quest or inventory logic | rs | Apache-2.0 | vendored | [a-b-street/abstreet](https://github.com/a-b-street/abstreet) @ `0964f29` |
| [ancientbeast — abilities](entries/gameplay/ancientbeast-abilities/README.md) | combat, AI, pathing, quest or inventory logic | ts | AGPL-3.0 | reference | [FreezingMoon/AncientBeast](https://github.com/FreezingMoon/AncientBeast) @ `1b45dc2` |
| [BehaviorTree.CPP](entries/gameplay/behaviortree-cpp/README.md) | behaviour trees for AI agents with blackboards | c++ | MIT | vendored | [BehaviorTree/BehaviorTree.CPP](https://github.com/BehaviorTree/BehaviorTree.CPP) @ `365b2e499d34` |
| [biomes-game — items](entries/gameplay/biomes-game-items/README.md) | combat, AI, pathing, quest or inventory logic | ts | MIT | vendored | [ill-inc/biomes-game](https://github.com/ill-inc/biomes-game) @ `669da23` |
| [GOAP (crashkonijn)](entries/gameplay/goap-crashkonijn/README.md) | goal-oriented action planning for game AI (Unity/C#) | c# | Apache-2.0 | vendored | [crashkonijn/GOAP](https://github.com/crashkonijn/GOAP) @ `7fb29cfe59dc` |
| [hypersomnia — inventory](entries/gameplay/hypersomnia-inventory/README.md) | combat, AI, pathing, quest or inventory logic | h | AGPL-3.0 | reference | [TeamHypersomnia/Hypersomnia](https://github.com/TeamHypersomnia/Hypersomnia) @ `0049839` |
| [libtcod](entries/gameplay/libtcod/README.md) | roguelike toolkit: FOV, pathfinding, RNG, line drawing, console | c++ | BSD-3-Clause | vendored | [libtcod/libtcod](https://github.com/libtcod/libtcod) @ `de16289cd50e` |
| [megaglest — ai](entries/gameplay/megaglest-ai/README.md) | combat, AI, pathing, quest or inventory logic | h | none | reference | [megaglest/megaglest-source.git](https://github.com/megaglest/megaglest-source.git) @ `4ab09c6` |
| [Mindustry — abilities](entries/gameplay/mindustry-abilities/README.md) | combat, AI, pathing, quest or inventory logic | java | GPL-3.0 | reference | [Anuken/Mindustry.git](https://github.com/Anuken/Mindustry.git) @ `b873c01` |
| [Mindustry — ai](entries/gameplay/mindustry-core-src-mindustry-ai/README.md) | unit AI and pathfinding | java | GPL-3.0 | reference | [Anuken/Mindustry.git](https://github.com/Anuken/Mindustry.git) @ `b873c01ed559` |
| [Mindustry — entities](entries/gameplay/mindustry-core-src-mindustry-entities/README.md) | entity/unit/bullet systems for a shipped RTS | java | GPL-3.0 | reference | [Anuken/Mindustry.git](https://github.com/Anuken/Mindustry.git) @ `b873c01ed559` |
| [naev — ai](entries/gameplay/naev-ai/README.md) | combat, AI, pathing, quest or inventory logic | lua | BSD-2-Clause | vendored | [naev/naev.git](https://github.com/naev/naev.git) @ `7f58510` |
| [OpenDungeons — spells](entries/gameplay/opendungeons-spells/README.md) | combat, AI, pathing, quest or inventory logic | cpp | GPL-3.0 | reference | [OpenDungeons/OpenDungeons.git](https://github.com/OpenDungeons/OpenDungeons.git) @ `a9efe49` |
| [openmu — GameLogic](entries/gameplay/openmu-src-gamelogic/README.md) | MMO gameplay logic: combat, skills, inventory, quests | c# | MIT | vendored | [MUnique/OpenMU](https://github.com/MUnique/OpenMU) @ `00f737374d07` |
| [PathFinding.js](entries/gameplay/pathfinding-js/README.md) | A*, IDA*, JPS, Dijkstra, BiA* on grids | javascript | MIT | vendored | [qiao/PathFinding.js](https://github.com/qiao/PathFinding.js) @ `2904a9afba48` |
| [Recast & Detour](entries/gameplay/recastnavigation/README.md) | navmesh generation + pathfinding + crowd steering | c++ | Zlib | vendored | [recastnavigation/recastnavigation](https://github.com/recastnavigation/recastnavigation) @ `9f4ce64458df` |
| [Revengate — combat](entries/gameplay/revengate-combat/README.md) | combat, AI, pathing, quest or inventory logic | gd | GPL-3.0 | reference | [https://gitlab.com/ygingras/revengate](https://gitlab.com/ygingras/revengate) @ `ad6b2ee` |
| [stronghold-protocol — ai](entries/gameplay/stronghold-protocol-ai/README.md) | combat, AI, pathing, quest or inventory logic | js | GPL-3.0 | reference | [sganggs/Stronghold-Protocol](https://github.com/sganggs/Stronghold-Protocol) @ `f07b896` |
| [suroi — items](entries/gameplay/suroi-items/README.md) | combat, AI, pathing, quest or inventory logic | ts | GPL-3.0 | reference | [HasangerGames/suroi.git](https://github.com/HasangerGames/suroi.git) @ `85df506` |
| [VCMI — spells](entries/gameplay/vcmi-spells/README.md) | combat, AI, pathing, quest or inventory logic | h | GPL-2.0 | reference | [vcmi/vcmi](https://github.com/vcmi/vcmi) @ `0e44409` |
| [veloren — comp](entries/gameplay/veloren-common-src-comp/README.md) | ECS gameplay components (combat, inventory, stats, buffs) | rust | GPL-3.0 | reference | [veloren/veloren.git](https://github.com/veloren/veloren.git) @ `cd75076cf157` |
| [veloren — inventory](entries/gameplay/veloren-inventory/README.md) | combat, AI, pathing, quest or inventory logic | rs | GPL-3.0 | reference | [veloren/veloren.git](https://github.com/veloren/veloren.git) @ `cd75076` |
| [wargus — ai](entries/gameplay/wargus-ai/README.md) | combat, AI, pathing, quest or inventory logic | c | GPL-2.0 | reference | [Wargus/wargus.git](https://github.com/Wargus/wargus.git) @ `57f9d4d` |
| [widelands — ai](entries/gameplay/widelands-ai/README.md) | combat, AI, pathing, quest or inventory logic | lua | GPL-2.0 | reference | [widelands/widelands.git](https://github.com/widelands/widelands.git) @ `2975377` |

## netcode

**Networking / netcode** — 34 entries

| name | what it provides | lang | licence | delivery | upstream |
|---|---|---|---|---|---|
| [ancientbeast — multiplayer](entries/netcode/ancientbeast-multiplayer/README.md) | network transport, protocol, replication or server loop | ts | AGPL-3.0 | reference | [FreezingMoon/AncientBeast](https://github.com/FreezingMoon/AncientBeast) @ `1b45dc2` |
| [Colyseus](entries/netcode/colyseus/README.md) | authoritative room-based multiplayer framework with state sync | typescript | MIT | vendored | [colyseus/colyseus](https://github.com/colyseus/colyseus) @ `ce781b98bfc5` |
| [Cubit — server](entries/netcode/cubit-server/README.md) | network transport, protocol, replication or server loop | go | MIT | vendored | [taynotfound/cubit](https://github.com/taynotfound/cubit) @ `0bd4518` |
| [cubyz — server](entries/netcode/cubyz-server/README.md) | network transport, protocol, replication or server loop | zig | GPL-3.0 | reference | [PixelGuys/Cubyz](https://github.com/PixelGuys/Cubyz) @ `74b6814` |
| [ENet](entries/netcode/enet/README.md) | reliable UDP networking for games | c | MIT | vendored | [lsalzman/enet](https://github.com/lsalzman/enet) @ `5a9c537fd464` |
| [Freeciv — networking](entries/netcode/freeciv-common-networking/README.md) | turn-based client/server protocol and packet layer | c | GPL-2.0 | reference | [freeciv/freeciv](https://github.com/freeciv/freeciv) @ `af90756d5b07` |
| [Freeciv — server](entries/netcode/freeciv-server/README.md) | network transport, protocol, replication or server loop | h | GPL-2.0 | reference | [freeciv/freeciv](https://github.com/freeciv/freeciv) @ `af90756` |
| [freeminer — network](entries/netcode/freeminer-network/README.md) | network transport, protocol, replication or server loop | h | LGPL-2.1 | reference | [freeminer/freeminer](https://github.com/freeminer/freeminer) @ `e31670e` |
| [GameNetworkingSockets](entries/netcode/gamenetworkingsockets/README.md) | reliable/unreliable encrypted message transport (Valve) | c++ | BSD-3-Clause | vendored | [ValveSoftware/GameNetworkingSockets](https://github.com/ValveSoftware/GameNetworkingSockets) @ `d534c19aa760` |
| [GGRS](entries/netcode/ggrs/README.md) | rollback netcode (GGPO-style) in Rust with WASM support | rust | Apache-2.0 | vendored | [gschup/ggrs](https://github.com/gschup/ggrs) @ `25bd9983dee3` |
| [hypersomnia — network](entries/netcode/hypersomnia-network/README.md) | network transport, protocol, replication or server loop | h | AGPL-3.0 | reference | [TeamHypersomnia/Hypersomnia](https://github.com/TeamHypersomnia/Hypersomnia) @ `0049839` |
| [KCP](entries/netcode/kcp/README.md) | fast reliable ARQ protocol (TCP-like over UDP) | c | MIT | vendored | [skywind3000/kcp](https://github.com/skywind3000/kcp) @ `b1a7a2101dcb` |
| [megaglest — network](entries/netcode/megaglest-network/README.md) | network transport, protocol, replication or server loop | h | none | reference | [megaglest/megaglest-source.git](https://github.com/megaglest/megaglest-source.git) @ `4ab09c6` |
| [Mindustry — net](entries/netcode/mindustry-net/README.md) | network transport, protocol, replication or server loop | java | GPL-3.0 | reference | [Anuken/Mindustry.git](https://github.com/Anuken/Mindustry.git) @ `b873c01` |
| [Nakama](entries/netcode/nakama/README.md) | game backend server: matchmaking, realtime, leaderboards, storage | go | Apache-2.0 | reference | [heroiclabs/nakama](https://github.com/heroiclabs/nakama) @ `37618ad4b927` |
| [nakama — server](entries/netcode/nakama-server/README.md) | network transport, protocol, replication or server loop | go | Apache-2.0 | vendored | [heroiclabs/nakama](https://github.com/heroiclabs/nakama) @ `4833594` |
| [netcode.io](entries/netcode/netcode-io/README.md) | secure UDP connection protocol with token auth | c | BSD-3-Clause | vendored | [mas-bandwidth/netcode](https://github.com/mas-bandwidth/netcode) @ `2d9df60853a6` |
| [open_spiel — session](entries/netcode/open-spiel-session/README.md) | network transport, protocol, replication or server loop | py | Apache-2.0 | vendored | [google-deepmind/open_spiel](https://github.com/google-deepmind/open_spiel) @ `3c53616` |
| [OpenArena — server](entries/netcode/openarena-server/README.md) | network transport, protocol, replication or server loop | c | GPL-2.0 | reference | [OpenArena/engine.git](https://github.com/OpenArena/engine.git) @ `fd74931` |
| [openclonk — network](entries/netcode/openclonk-network/README.md) | network transport, protocol, replication or server loop | c | ISC | vendored | [openclonk/openclonk.git](https://github.com/openclonk/openclonk.git) @ `36de799` |
| [openclonk — network](entries/netcode/openclonk-src-network/README.md) | Clonk-style network sync and control queues | c++ | ISC | vendored | [openclonk/openclonk.git](https://github.com/openclonk/openclonk.git) @ `36de799544af` |
| [OpenDungeons — network](entries/netcode/opendungeons-network/README.md) | network transport, protocol, replication or server loop | cpp | GPL-3.0 | reference | [OpenDungeons/OpenDungeons.git](https://github.com/OpenDungeons/OpenDungeons.git) @ `a9efe49` |
| [OpenJK — server](entries/netcode/openjk-server/README.md) | network transport, protocol, replication or server loop | cpp | GPL-2.0 | reference | [JACoders/OpenJK.git](https://github.com/JACoders/OpenJK.git) @ `260c59c` |
| [openmu — Network](entries/netcode/openmu-src-network/README.md) | MMO network protocol, packet handlers, encryption | c# | MIT | vendored | [MUnique/OpenMU](https://github.com/MUnique/OpenMU) @ `00f737374d07` |
| [openrct2 — network](entries/netcode/openrct2-network/README.md) | network transport, protocol, replication or server loop | cpp | GPL-3.0 | reference | [OpenRCT2/OpenRCT2.git](https://github.com/OpenRCT2/OpenRCT2.git) @ `3b7114c` |
| [PlayHex — server](entries/netcode/playhex-server/README.md) | network transport, protocol, replication or server loop | ts | AGPL-3.0 | reference | [playhex/playhex](https://github.com/playhex/playhex) @ `5750af4` |
| [rigs-of-rods — server](entries/netcode/rigs-of-rods-server/README.md) | network transport, protocol, replication or server loop | h | GPL-3.0 | reference | [RigsOfRods/rigs-of-rods](https://github.com/RigsOfRods/rigs-of-rods) @ `ebf31a2` |
| [stronghold-protocol — server](entries/netcode/stronghold-protocol-server/README.md) | network transport, protocol, replication or server loop | js | GPL-3.0 | reference | [sganggs/Stronghold-Protocol](https://github.com/sganggs/Stronghold-Protocol) @ `f07b896` |
| [suroi — packets](entries/netcode/suroi-packets/README.md) | network transport, protocol, replication or server loop | ts | GPL-3.0 | reference | [HasangerGames/suroi.git](https://github.com/HasangerGames/suroi.git) @ `85df506` |
| [teeworlds — server](entries/netcode/teeworlds-server/README.md) | network transport, protocol, replication or server loop | h | CC-BY-SA-3.0 | reference | [teeworlds/teeworlds.git](https://github.com/teeworlds/teeworlds.git) @ `5d68273` |
| [VCMI — server](entries/netcode/vcmi-server/README.md) | network transport, protocol, replication or server loop | h | GPL-2.0 | reference | [vcmi/vcmi](https://github.com/vcmi/vcmi) @ `0e44409` |
| [warzone2100 — netplay](entries/netcode/warzone2100-lib-netplay/README.md) | RTS netplay: sync, desync detection, rejoin | c++ | GPL-2.0 | reference | [Warzone2100/warzone2100.git](https://github.com/Warzone2100/warzone2100.git) @ `ceda97e14614` |
| [widelands — network](entries/netcode/widelands-network/README.md) | network transport, protocol, replication or server loop | lua | GPL-2.0 | reference | [widelands/widelands.git](https://github.com/widelands/widelands.git) @ `2975377` |
| [yojimbo](entries/netcode/yojimbo/README.md) | client/server game protocol: encryption, reliability, connection tags | c++ | BSD-3-Clause | vendored | [networkprotocol/yojimbo](https://github.com/networkprotocol/yojimbo) @ `ae64e145c993` |

## save-state

**Save / state systems** — 9 entries

| name | what it provides | lang | licence | delivery | upstream |
|---|---|---|---|---|---|
| [biomes-game — storage](entries/save-state/biomes-game-storage/README.md) | persistence: save/load, snapshot or state serialisation | ts | MIT | vendored | [ill-inc/biomes-game](https://github.com/ill-inc/biomes-game) @ `669da23` |
| [cereal](entries/save-state/cereal/README.md) | C++11 serialization: JSON/binary/XML archives, versioning | c++ | BSD-3-Clause | vendored | [USCiLab/cereal](https://github.com/USCiLab/cereal) @ `22a1b369f39b` |
| [cJSON](entries/save-state/cjson/README.md) | ultralight JSON parser/writer | c | MIT | vendored | [DaveGamble/cJSON](https://github.com/DaveGamble/cJSON) @ `6d9f2443ab07` |
| [FlatBuffers](entries/save-state/flatbuffers/README.md) | zero-copy serialization, schema-driven | c++ | Apache-2.0 | vendored | [google/flatbuffers](https://github.com/google/flatbuffers) @ `5eb190f00005` |
| [Freeciv — savegame](entries/save-state/freeciv-savegame/README.md) | persistence: save/load, snapshot or state serialisation | h | GPL-2.0 | reference | [freeciv/freeciv](https://github.com/freeciv/freeciv) @ `af90756` |
| [SQLite](entries/save-state/sqlite/README.md) | embedded SQL database engine (single-file world saves) | c | Public-Domain | reference | [sqlite/sqlite](https://github.com/sqlite/sqlite) @ `e5cb4b09573a` |
| [thrive — saving](entries/save-state/thrive-saving/README.md) | persistence: save/load, snapshot or state serialisation | cs | GPL-3.0 | reference | [Revolutionary-Games/Thrive](https://github.com/Revolutionary-Games/Thrive) @ `bb9189f` |
| [VCMI — serializer](entries/save-state/vcmi-serializer/README.md) | persistence: save/load, snapshot or state serialisation | h | GPL-2.0 | reference | [vcmi/vcmi](https://github.com/vcmi/vcmi) @ `0e44409` |
| [yyjson](entries/save-state/yyjson/README.md) | high-performance JSON library (read/write/mutate) | c | MIT | vendored | [ibireme/yyjson](https://github.com/ibireme/yyjson) @ `ebb8d7e5aaa5` |

## procgen

**Procedural generation** — 13 entries

| name | what it provides | lang | licence | delivery | upstream |
|---|---|---|---|---|---|
| [cataclysm-bn — mapgen](entries/procgen/cataclysm-bn-mapgen/README.md) | procedural map/world/level generation | cpp | CC-BY-SA-4.0 | reference | [cataclysmbn/Cataclysm-BN](https://github.com/cataclysmbn/Cataclysm-BN) @ `73b300f` |
| [cataclysm-bn — mapgen](entries/procgen/cataclysm-bn-src-mapgen/README.md) | map and city generation | c++ | CC-BY-SA-4.0 | reference | [cataclysmbn/Cataclysm-BN](https://github.com/cataclysmbn/Cataclysm-BN) @ `73b300fd2353` |
| [crawl — des](entries/procgen/crawl-crawl-ref-source-dat-des/README.md) | vault/branch layout definitions (DES) | text | GPL-2.0 | reference | [crawl/crawl.git](https://github.com/crawl/crawl.git) @ `cf8c9bca9065` |
| [cubyz — noise](entries/procgen/cubyz-noise/README.md) | procedural map/world/level generation | zig | GPL-3.0 | reference | [PixelGuys/Cubyz](https://github.com/PixelGuys/Cubyz) @ `74b6814` |
| [Dungeon-Generator (BSP)](entries/procgen/dungeon-generator-bsp/README.md) | BSP dungeon generation (C#/Unity) | c# | MIT | vendored | [Adrian104/Dungeon-Generator](https://github.com/Adrian104/Dungeon-Generator) @ `8dfa5d23f848` |
| [FastNoise2](entries/procgen/fastnoise2/README.md) | SIMD noise generation library with node graphs | c++ | MIT | vendored | [Auburn/FastNoise2](https://github.com/Auburn/FastNoise2) @ `c35d6041ce7e` |
| [FastNoiseLite](entries/procgen/fastnoiselite/README.md) | single-header noise (perlin/simplex/cellular/fractal) | c | MIT | vendored | [Auburn/FastNoiseLite](https://github.com/Auburn/FastNoiseLite) @ `785f37a9ad76` |
| [freeminer — mapgen](entries/procgen/freeminer-mapgen/README.md) | procedural map/world/level generation | h | LGPL-2.1 | reference | [freeminer/freeminer](https://github.com/freeminer/freeminer) @ `e31670e` |
| [freeminer — mapgen](entries/procgen/freeminer-src-mapgen/README.md) | voxel map generation (biomes, caves, ores) | c++ | LGPL-2.1 | reference | [freeminer/freeminer](https://github.com/freeminer/freeminer) @ `e31670e9d074` |
| [space-station-14 — Procedural](entries/procgen/space-station-14-content-shared-procedural/README.md) | procedural station/AI content generation | c# | MIT | vendored | [space-wizards/space-station-14](https://github.com/space-wizards/space-station-14) @ `33a1d0e32d63` |
| [Tracery](entries/procgen/tracery/README.md) | grammar-based generative text/structure | javascript | Apache-2.0 | vendored | [galaxykate/tracery](https://github.com/galaxykate/tracery) @ `11db07cb8e35` |
| [veloren — world](entries/procgen/veloren-world/README.md) | world generation (terrain, biomes, caves, structures) | rust | GPL-3.0 | reference | [veloren/veloren.git](https://github.com/veloren/veloren.git) @ `cd75076cf157` |
| [WaveFunctionCollapse](entries/procgen/wavefunctioncollapse/README.md) | constraint-based tile/bitmap generation | c# | MIT | vendored | [mxgmn/WaveFunctionCollapse](https://github.com/mxgmn/WaveFunctionCollapse) @ `de7d22e705e8` |
