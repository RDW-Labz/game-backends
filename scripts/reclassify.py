#!/usr/bin/env python3
"""Re-derive licence + delivery for every entry using the current classifier.

For vendored entries the vendored copy is screened directly (no network). For
reference-only entries the upstream is shallow-cloned at its recorded commit.
A licence flip that becomes clean+sized vendors the code; a flip the other way
drops the vendored copy and turns the entry into a reference row.

Idempotent: entries whose licence and delivery already match are untouched.
"""
import json, os, shutil, subprocess, sys, tempfile
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gblib import (ROOT, CLEAN, ATTRIB, entry_path, find_license, load_entries,
                   save_entry, verdict)

VENDOR_CAP = 12 * 1024 * 1024
CODE_EXT = {".py", ".c", ".cc", ".cpp", ".cxx", ".h", ".hh", ".hpp", ".hxx", ".cs",
            ".java", ".kt", ".js", ".mjs", ".ts", ".rs", ".go", ".lua", ".gd", ".zig"}


def code_size(p):
    tot = 0
    for dp, dn, fn in os.walk(p):
        dn[:] = [d for d in dn if d not in {".git"}]
        for f in fn:
            if os.path.splitext(f)[1].lower() in CODE_EXT:
                try:
                    tot += os.path.getsize(os.path.join(dp, f))
                except OSError:
                    pass
    return tot


def main():
    only = sys.argv[1:]
    changed = []
    for e in load_entries():
        if only and e.get("source", "") not in only and e["category"] not in only:
            continue
        d = e["_dir"]
        src = os.path.join(d, "src")
        work = None
        tmpd = None
        if os.path.isdir(src):
            work = src
        else:
            up = e.get("upstream") or ""
            if not up.startswith("http"):
                continue
            tmpd = tempfile.mkdtemp(prefix="gbl-reclass-")
            r = subprocess.run(["git", "clone", "--depth", "1", "--quiet", up,
                                os.path.join(tmpd, "r")], capture_output=True, text=True, timeout=300)
            if r.returncode != 0:
                print(f"  SKIP (clone failed) {e['category']}/{e['slug']}")
                shutil.rmtree(tmpd, ignore_errors=True)
                continue
            work = os.path.join(tmpd, "r")
        # a vendored entry keeps its licence text beside src/, not inside it
        lic, lf = find_license(work)
        if lic in ("none", "unknown") and os.path.isdir(src):
            side = os.path.join(d, "LICENSE")
            if os.path.isfile(side):
                from gblib import license_from_file
                lic, lf = license_from_file(side), side
        v = verdict(lic)
        old = (e.get("license"), e.get("delivery"))
        size = code_size(work) if not os.path.isdir(src) else e.get("size_bytes", code_size(src))
        want = "vendored" if (lic in CLEAN or lic in ATTRIB) and size <= VENDOR_CAP else "reference"
        if old == (lic, want):
            shutil.rmtree(tmpd, ignore_errors=True) if tmpd else None
            continue
        e["license"], e["license_verdict"] = lic, v
        if lf:
            e["license_file"] = os.path.basename(lf)
        if want == "vendored" and not os.path.isdir(src) and e.get("path_in_upstream"):
            # corpus picks are a subdirectory of a big game: never vendor the
            # whole upstream to recover them
            want = "reference"
        if want == "vendored" and not os.path.isdir(src):
            shutil.copytree(work, src, symlinks=True, ignore_dangling_symlinks=True,
                            ignore=shutil.ignore_patterns(".git", ".github", "node_modules",
                                                          "__pycache__", "*.png", "*.jpg", "*.gif"))
            if lf:
                shutil.copyfile(lf, os.path.join(d, "LICENSE"))
            e["delivery"], e["vendored_path"] = "vendored", "src/"
            e.pop("reference_reason", None)
            e["size_bytes"] = size
        elif want == "reference" and os.path.isdir(src):
            shutil.rmtree(src)
            e.pop("vendored_path", None)
            e["delivery"] = "reference"
            e["reference_reason"] = (f"licence: {lic} ({v})" if lic not in CLEAN
                                     else f"size gate: {size//1024//1024} MB")
        else:
            e["delivery"] = "reference"
            e["reference_reason"] = (f"licence: {lic} ({v})" if lic not in CLEAN
                                     else f"size gate: {size//1024//1024} MB")
        if lic in ATTRIB and "attribution" not in e:
            e["attribution"] = f"{e.get('upstream')} is licensed CC BY 4.0 — attribution recorded per policy."
        save_entry(e)
        changed.append(f"{e['category']}/{e['slug']}: {old[0]}->{lic} ({old[1]}->{want})")
        shutil.rmtree(tmpd, ignore_errors=True) if tmpd else None
    for c in changed:
        print("  " + c)
    print(f"reclassified {len(changed)} entries")


if __name__ == "__main__":
    main()
