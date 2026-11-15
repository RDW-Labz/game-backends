#!/usr/bin/env python3
"""Mint (or reuse) a Gitea API token for pushing, then print only its status.

The token is stored at ~/.config/gitea/game-backends-token (0600) so pushes and
the 15-minute tick can authenticate without a password. Prints nothing secret.
"""
import base64, json, os, urllib.request, urllib.error

TOKENFILE = os.path.expanduser("~/.config/gitea/game-backends-token")
kv = {}
for line in open(os.path.expanduser("~/.config/gitea/admin")):
    if ":" in line:
        k, v = line.split(":", 1)
        kv[k.strip().lower()] = v.strip()
user = kv.get("username")
pw = kv.get("password")
base = "http://100.98.163.120:3000"
auth = base64.b64encode(f"{user}:{pw}".encode()).decode()


def call(path, method="GET", data=None, basic=True):
    hdrs = {"Content-Type": "application/json"}
    if basic:
        hdrs["Authorization"] = "Basic " + auth
    body = json.dumps(data).encode() if data is not None else None
    req = urllib.request.Request(base + path, data=body, headers=hdrs, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, json.loads(r.read().decode() or "{}")
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read().decode() or "{}")
        except Exception:
            return e.code, {}


if os.path.isfile(TOKENFILE):
    tok = open(TOKENFILE).read().strip()
    code, who = call("/api/v1/user", basic=False) if False else (0, {})
    # verify the stored token
    req = urllib.request.Request(base + "/api/v1/user",
                                headers={"Authorization": "token " + tok})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            print("stored token valid for:", json.loads(r.read().decode())["login"])
            raise SystemExit(0)
    except Exception:
        print("stored token invalid, minting a new one")

code, d = call(f"/api/v1/users/{user}/tokens", "POST", {
    "name": "game-backends-push",
    "scopes": ["write:repository", "write:user", "read:user"],
})
if code in (200, 201):
    tok = d["sha1"]
    os.makedirs(os.path.dirname(TOKENFILE), exist_ok=True)
    fd = os.open(TOKENFILE, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    os.write(fd, tok.encode())
    os.close(fd)
    print("minted token, saved to", TOKENFILE)
else:
    print("token mint failed:", code, d.get("message"))
