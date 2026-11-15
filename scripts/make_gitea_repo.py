#!/usr/bin/env python3
"""Create the Gitea repo for this library (Gitea is the git source of truth)."""
import base64, json, os, urllib.request, urllib.error

conf = os.path.expanduser("~/.config/gitea/admin")
kv = {}
for line in open(conf):
    if ":" in line:
        k, v = line.split(":", 1)
        kv[k.strip().lower()] = v.strip()
user = kv.get("user") or kv.get("username") or kv.get("login")
pw = kv.get("pass") or kv.get("password") or kv.get("token")
base = os.environ.get("GITEA_URL", "http://100.98.163.120:3000")
auth = base64.b64encode(f"{user}:{pw}".encode()).decode()
H = {"Authorization": "Basic " + auth, "Content-Type": "application/json"}


def call(path, method="GET", data=None):
    body = json.dumps(data).encode() if data is not None else None
    req = urllib.request.Request(base + path, data=body, headers=H, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, json.loads(r.read().decode() or "{}")
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode() or "{}")


code, me = call("/api/v1/user")
print("gitea user:", code, me.get("login"))
code, repo = call(f"/api/v1/repos/{me.get('login')}/game-backends")
if code == 404:
    code, repo = call("/api/v1/user/repos", "POST", {
        "name": "game-backends",
        "description": "Catalogue + vendored code for game backends: engines, physics, math, loot/economy, gameplay, netcode, save-state, procgen.",
        "private": False, "auto_init": False, "default_branch": "main",
    })
    print("created:", code, repo.get("clone_url"), repo.get("message", ""))
else:
    print("exists:", code, repo.get("clone_url"))
