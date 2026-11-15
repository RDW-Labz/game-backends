"""Shared helpers for the game-backends library: entry schema, licence screening,
catalogue generation, GitHub API access."""
import json, os, re, subprocess, time, urllib.request, urllib.error, shutil

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ENTRIES = os.path.join(ROOT, "entries")
CATALOG = os.path.join(ROOT, "CATALOG.md")

CATEGORIES = [
    ("engines", "Game engines and engine subsystems"),
    ("physics", "Physics"),
    ("math", "Math libraries"),
    ("loot-economy", "Loot / drop and economy rolls"),
    ("gameplay", "Gameplay systems (combat, AI, pathing, quests, inventories)"),
    ("netcode", "Networking / netcode"),
    ("save-state", "Save / state systems"),
    ("procgen", "Procedural generation"),
]

# Standing licence rule. Clean = code may be vendored. Everything else is a
# catalogued reference: name + link + licence flag, no code copied.
CLEAN = {"MIT", "Apache-2.0", "BSD-2-Clause", "BSD-3-Clause", "CC0-1.0",
         "Zlib", "Unlicense", "ISC", "Public-Domain"}
ATTRIB = {"CC-BY-4.0"}          # clean only with attribution recorded
COPYLEFT = {"GPL-2.0", "GPL-3.0", "LGPL-2.1", "LGPL-3.0", "AGPL-3.0", "MPL-2.0"}

MARKERS = [
    # copyleft and source-available first: a GPL file must never be read as a
    # permissive one just because it mentions CC0 for its art assets
    ("AGPL-3.0", r"gnu affero general public license"),
    ("LGPL-3.0", r"gnu lesser general public license[\s\S]{0,300}?version 3"),
    ("LGPL-2.1", r"gnu lesser general public license[\s\S]{0,300}?version 2"),
    ("GPL-3.0", r"gnu general public license[\s\S]{0,300}?version 3"),
    ("GPL-2.0", r"gnu general public license[\s\S]{0,300}?version 2"),
    ("MPL-2.0", r"mozilla public license[\s\S]{0,300}?2\.0"),
    ("MS-PL", r"microsoft public license"),
    ("Flax-EULA", r"flax engine end user license agreement"),
    ("Sustainable-Use-1.0", r"sustainable use license"),
    ("CC-BY-SA-4.0", r"creative commons attribution[- ]sharealike 4\.0|cc[- ]by[- ]sa[- ]4\.0"),
    ("CC-BY-SA-3.0", r"creative commons attribution[- ]sharealike 3\.0|cc[- ]by[- ]sa[- ]3\.0"),
    ("Apache-2.0", r"apache license[\s\S]{0,300}?version 2\.0"),
    ("MIT", r"permission is hereby granted, free of charge"),
    ("BSD-3-Clause", r"redistribution and use in source and binary forms[\s\S]{0,3000}?neither the name"),
    ("BSD-2-Clause", r"redistribution and use in source and binary forms"),
    ("CC0-1.0", r"\bcc0\b|creative commons zero"),
    ("CC-BY-4.0", r"creative commons attribution 4\.0|cc[- ]by[- ]4\.0"),
    ("Zlib", r"altered source versions must be plainly marked|this software is provided 'as-is'"),
    ("Unlicense", r"free and unencumbered software released into the public domain"),
    ("ISC", r"permission to use, copy, modify, and(/or| or) distribute this software"),
    ("Public-Domain", r"disclaims? (all )?copyright|dedicated to the public domain|public domain dedication"),
]


def screen(text):
    """Classify a licence text. Returns SPDX-ish id or 'unknown'."""
    t = text[:12000]
    for name, rx in MARKERS:
        if re.search(rx, t, re.I):
            return name
    return "unknown"


def license_from_file(path):
    try:
        return screen(open(path, errors="ignore").read(6000))
    except OSError:
        return "unknown"


CANON = {"APACHE-2.0": "Apache-2.0", "MIT": "MIT", "BSD-3-CLAUSE": "BSD-3-Clause",
         "BSD-2-CLAUSE": "BSD-2-Clause", "GPL-2.0": "GPL-2.0", "GPL-3.0": "GPL-3.0",
         "AGPL-3.0": "AGPL-3.0", "LGPL-2.1": "LGPL-2.1", "LGPL-3.0": "LGPL-3.0",
         "MPL-2.0": "MPL-2.0", "MS-PL": "MS-PL", "CC0-1.0": "CC0-1.0",
         "CC-BY-4.0": "CC-BY-4.0", "CC-BY-SA-4.0": "CC-BY-SA-4.0", "ISC": "ISC",
         "ZLIB": "Zlib", "UNLICENSE": "Unlicense", "NOASSERTION": "unknown", "NONE": "none"}


def canon(lic):
    """Normalise an SPDX id from API metadata to the ids used here."""
    if not lic:
        return "unknown"
    return CANON.get(lic.upper(), lic)


def verdict(lic):
    if lic in CLEAN:
        return "clean"
    if lic in ATTRIB:
        return "clean-with-attribution"
    if lic in COPYLEFT:
        return "copyleft-reference"
    if lic == "none" or lic == "unknown":
        return "unlicensed-reference"
    return "gated-reference"


# Any of these anywhere in the repo's licence material outranks a permissive
# file: cocos2d-x ships 30 MIT licences for its bundled libs alongside its own,
# and a GPL project must never be recorded as MIT because a vendored dep is.
RESTRICTIVE = COPYLEFT | {"MS-PL", "Sustainable-Use-1.0", "Flax-EULA",
                          "CC-BY-SA-3.0", "CC-BY-SA-4.0"}


def find_license(root, max_depth=1):
    """Locate the project's licence material and classify it.

    Candidates are LICEN[CS]E*/COPYING*/COPYRIGHT* files (including names like
    BSD-LICENSE) plus the contents of a root licenses/ directory. The most
    restrictive classification wins; otherwise the most common one does.
    Returns (spdx_id, path_or_None).
    """
    cands = []
    for dirpath, dirnames, filenames in os.walk(root):
        depth = dirpath.count(os.sep) - root.count(os.sep)
        dirnames[:] = [d for d in dirnames if d not in {".git", "node_modules"}]
        if depth > max_depth:
            dirnames[:] = []
            continue
        for d in list(dirnames):
            if re.fullmatch(r"licen[cs]es?", d, re.I):
                for f in sorted(os.listdir(os.path.join(dirpath, d)))[:40]:
                    p = os.path.join(dirpath, d, f)
                    if os.path.isfile(p) and os.path.getsize(p) < 300_000:
                        cands.append(p)
        for f in filenames:
            if re.search(r"licen[cs]e|copying|copyright", f, re.I) and \
                    os.path.getsize(os.path.join(dirpath, f)) < 300_000:
                cands.append(os.path.join(dirpath, f))
    if not cands:
        # last resort: licence statement in the README, then in source headers
        for f in sorted(os.listdir(root)):
            if re.match(r"readme", f, re.I):
                p = os.path.join(root, f)
                if os.path.isfile(p) and os.path.getsize(p) < 200_000:
                    ids = screen(open(p, errors="ignore").read(12000))
                    if ids != "unknown":
                        return ids, p
        probes = 0
        for dirpath, dirnames, filenames in os.walk(root):
            dirnames[:] = [d for d in dirnames if d not in {".git", "node_modules"}]
            for f in sorted(filenames):
                if probes >= 6:
                    break
                if os.path.splitext(f)[1].lower() in {".c", ".cc", ".cpp", ".h", ".hpp", ".cs", ".py", ".java"}:
                    p = os.path.join(dirpath, f)
                    try:
                        ids = screen(open(p, errors="ignore").read(4000))
                    except OSError:
                        continue
                    probes += 1
                    if ids not in ("unknown", "none"):
                        return ids, p
    seen = []
    for p in cands:
        i = license_from_file(p)
        if i not in ("unknown", "none"):
            seen.append((i, p))
    if not seen:
        return "none", (cands[0] if cands else None)
    repo = os.path.basename(os.path.abspath(root)).lower()
    repo_tokens = [t for t in re.split(r"[-_.]", repo) if len(t) > 3]

    def names_project(p):
        b = os.path.basename(p).lower()
        return bool(repo_tokens) and any(t in b for t in repo_tokens)

    # 1. a plain root LICEN[CS]E / COPYING file is the project's own licence;
    #    third-party notices beside it must not outrank it
    for want in (r"licen[cs]e([-_.](md|txt|rst))?",
                 r"(copying|copyright)([-_.](md|txt|rst))?"):
        for i, p in seen:
            if os.path.dirname(os.path.abspath(p)) == os.path.abspath(root) and \
                    re.fullmatch(want, os.path.basename(p).lower()):
                return i, p
    # 2. a licences/ file named after the project (cocos2d-x, urho3d)
    for i, p in seen:
        if names_project(p):
            return i, p
    # 3. nothing project-specific: most restrictive wins, then the majority
    for i, p in seen:
        if i in RESTRICTIVE:
            return i, p
    from collections import Counter
    best = Counter(i for i, _ in seen).most_common(1)[0][0]
    return best, next(p for i, p in seen if i == best)


def token():
    p = os.path.expanduser("~/.config/gh/pat")
    return open(p).read().strip() if os.path.isfile(p) else ""


def api(url, method="GET", data=None, tries=3):
    hdrs = {"Accept": "application/vnd.github+json",
            "User-Agent": "game-backends-library"}
    t = token()
    if t:
        hdrs["Authorization"] = f"token {t}"
    body = json.dumps(data).encode() if data is not None else None
    for i in range(tries):
        try:
            req = urllib.request.Request(url, data=body, headers=hdrs, method=method)
            with urllib.request.urlopen(req, timeout=40) as r:
                return json.loads(r.read().decode() or "{}"), dict(r.headers)
        except urllib.error.HTTPError as e:
            if e.code in (403, 429):
                time.sleep(4 * (i + 1))
                continue
            raise
        except Exception:
            time.sleep(2 * (i + 1))
    return {}, {}


def entry_path(cat, slug):
    return os.path.join(ENTRIES, cat, slug)


def load_entries():
    out = []
    for cat, _ in CATEGORIES:
        d = os.path.join(ENTRIES, cat)
        if not os.path.isdir(d):
            continue
        for slug in sorted(os.listdir(d)):
            j = os.path.join(d, slug, "entry.json")
            if os.path.isfile(j):
                e = json.load(open(j))
                e.setdefault("category", cat)
                e["_dir"] = os.path.join(d, slug)
                out.append(e)
    return out


def save_entry(e):
    d = entry_path(e["category"], e["slug"])
    os.makedirs(d, exist_ok=True)
    e.pop("_dir", None)
    json.dump(e, open(os.path.join(d, "entry.json"), "w"), indent=1, sort_keys=True)
    open(os.path.join(d, "README.md"), "w").write(render_entry_readme(e))


def render_entry_readme(e):
    L = []
    L.append(f"# {e['name']}\n")
    L.append(f"- **Category:** {e['category']} — {e.get('system','')}")
    L.append(f"- **Language:** {e.get('language','n/a')}")
    L.append(f"- **Licence:** `{e.get('license','unknown')}` ({e.get('license_verdict','')})")
    L.append(f"- **Delivery:** {e.get('delivery','reference')}")
    L.append(f"- **Upstream:** {e.get('upstream','')} @ `{e.get('commit','')}`")
    if e.get("source"):
        L.append(f"- **Discovered via:** {e['source']}")
    if e.get("vendored_path"):
        L.append(f"- **Code:** `{e['vendored_path']}`")
    L.append("")
    if e.get("description"):
        L.append(e["description"].strip() + "\n")
    if e.get("why"):
        L.append(f"**Why it qualifies:** {e['why']}\n")
    if e.get("entry_points"):
        L.append("**Entry points:**\n")
        for p in e["entry_points"]:
            L.append(f"- `{p}`")
        L.append("")
    if e.get("delivery") == "reference":
        L.append("> REFERENCE ONLY — the code is not copied into this repository. "
                 "Fetch it from the upstream URL at the pinned commit. "
                 f"Reason: {e.get('reference_reason','licence or size gate')}.\n")
    if e.get("attribution"):
        L.append(f"{e['attribution']}\n")
    return "\n".join(L)


def build_catalog():
    entries = load_entries()
    bycat = {}
    for e in entries:
        bycat.setdefault(e["category"], []).append(e)
    lines = ["# game-backends — catalogue\n",
             f"_Generated {time.strftime('%Y-%m-%d %H:%M UTC', time.gmtime())} · "
             f"{len(entries)} entries · {sum(1 for e in entries if e.get('delivery')=='vendored')} vendored, "
             f"{sum(1 for e in entries if e.get('delivery')!='vendored')} reference-only · "
             "see POLICY.md for the licence gate._\n",
             "| category | entries | vendored | reference |", "|---|---|---|---|"]
    for cat, label in CATEGORIES:
        n = bycat.get(cat, [])
        v = sum(1 for e in n if e.get("delivery") == "vendored")
        lines.append(f"| [{cat}](#{cat}) — {label} | {len(n)} | {v} | {len(n)-v} |")
    lines.append("")
    for cat, label in CATEGORIES:
        rows = sorted(bycat.get(cat, []), key=lambda e: e["name"].lower())
        lines.append(f"\n## {cat}\n\n**{label}** — {len(rows)} entries\n")
        if not rows:
            lines.append("_none yet_\n")
            continue
        lines.append("| name | what it provides | lang | licence | delivery | upstream |")
        lines.append("|---|---|---|---|---|---|")
        for e in rows:
            src = e.get("upstream", "").replace("https://github.com/", "")
            lines.append("| [{}](entries/{}/{}/README.md) | {} | {} | {} | {} | [{}]({}) @ `{}` |".format(
                e["name"], cat, e["slug"], (e.get("system") or "").replace("|", "/"),
                e.get("language", ""), e.get("license", ""), e.get("delivery", "reference"),
                src.split("@")[0] or src, e.get("upstream", ""), e.get("commit", "")))
    open(CATALOG, "w").write("\n".join(lines) + "\n")
    return len(entries)


if __name__ == "__main__":
    n = build_catalog()
    print(f"catalogue rebuilt: {n} entries")
