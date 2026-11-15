#!/usr/bin/env python3
"""Probe GitHub identity/org and create the library repo if it is missing."""
import json, os, sys, urllib.request, urllib.error

TOK = open(os.path.expanduser("~/.config/gh/pat")).read().strip()
H = {"Authorization": "token " + TOK, "Accept": "application/vnd.github+json",
     "User-Agent": "game-backends"}


def call(url, method="GET", data=None):
    body = json.dumps(data).encode() if data is not None else None
    req = urllib.request.Request(url, data=body, headers=H, method=method)
    try:
        with urllib.request.urlopen(req, timeout=40) as r:
            return r.status, json.loads(r.read().decode() or "{}")
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read().decode() or "{}")
        except Exception:
            return e.code, {}


print("user:", call("https://api.github.com/user")[1].get("login"))
org = call("https://api.github.com/orgs/RDW-Labz")[1]
print("org:", org.get("login"), "public_repos:", org.get("public_repos"), org.get("message", ""))

code, repo = call("https://api.github.com/repos/RDW-Labz/game-backends")
if code == 404:
    code, repo = call("https://api.github.com/orgs/RDW-Labz/repos", "POST", {
        "name": "game-backends",
        "description": "Catalogue + vendored code for game backends: engines, physics, math, loot/economy, gameplay, netcode, save-state, procgen.",
        "private": False, "has_issues": True, "has_wiki": False,
        "auto_init": False,
    })
    print("created:", code, repo.get("html_url"), repo.get("message", ""))
else:
    print("exists:", code, repo.get("html_url"), repo.get("full_name"))
