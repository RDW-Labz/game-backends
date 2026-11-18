#!/bin/bash
# Push the library to Gitea (source of truth) and GitHub (RDW-Labz org).
# Credentials go through a throwaway askpass helper that cats a 0600 file, so
# nothing lands in git config and shell quoting cannot mangle the password.
#
# GitHub is BATCHED. Every tick still pushes Gitea (the local source of truth),
# but the GitHub push only fires when the last one is older than
# GITHUB_MIN_INTERVAL_H hours (default 12 = twice a day). GitHub runs a hosted
# CodeQL matrix on every push to main; a cosmetic tick commit there costs minutes
# for nothing. The gate lives here rather than in the caller so every path that
# pushes this repo is batched, and it is stateful (.mine/github_push.json) so a
# restart or a missed tick cannot turn into a burst.
set -uo pipefail
cd "$(dirname "$0")/.."

GITHUB_MIN_INTERVAL_H="${GITHUB_MIN_INTERVAL_H:-12}"
GITHUB_GATE_STATE="$PWD/.mine/github_push.json"

TMPD=$(mktemp -d)
chmod 700 "$TMPD"
trap 'rm -rf "$TMPD"' EXIT

PWFILE="$TMPD/cred"
ASK="$TMPD/askpass"

push_one() {   # $1=remote-name $2=url $3=username $4=secret
  printf '%s\n' "$4" > "$PWFILE"
  chmod 600 "$PWFILE"
  # git asks twice; answer the username prompt with the user, the rest with the secret
  printf '#!/bin/sh\ncase "$1" in *[Uu]sername*) echo %s ;; *) cat %s ;; esac\n' \
      "$3" "$PWFILE" > "$ASK"
  chmod 700 "$ASK"
  git remote remove "$1" 2>/dev/null
  git remote add "$1" "$2"
  if GIT_ASKPASS="$ASK" GIT_USERNAME="$3" GIT_TERMINAL_PROMPT=0 \
       git -c credential.helper= push -q -u "$1" HEAD:main 2>"$TMPD/err"; then
    echo "$1: pushed $(git rev-parse --short HEAD) -> $2"
    return 0
  fi
  echo "$1: FAILED -> $(tail -2 "$TMPD/err" | tr '\n' ' ')"
  return 1
}

# 0 = a GitHub push is due, 1 = still inside the batch window.
github_due() {
  [ -f "$GITHUB_GATE_STATE" ] || return 0
  python3 - "$GITHUB_GATE_STATE" "$GITHUB_MIN_INTERVAL_H" <<'PY'
import json, sys, time
state, hours = sys.argv[1], float(sys.argv[2])
try:
    last = float(json.load(open(state)).get("last_push_epoch") or 0)
except Exception:
    last = 0.0
sys.exit(0 if time.time() - last >= hours * 3600 else 1)
PY
}

# Call only after a successful GitHub push, so a failure retries next tick
# instead of parking the batch for another 12 h.
github_mark_pushed() {
  mkdir -p "$(dirname "$GITHUB_GATE_STATE")"
  python3 - "$GITHUB_GATE_STATE" "$(git rev-parse --short HEAD)" <<'PY'
import json, sys, time
state, sha = sys.argv[1], sys.argv[2]
now = time.time()
json.dump({"last_push_epoch": now,
           "last_push_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(now)),
           "sha": sha}, open(state, "w"), indent=1, sort_keys=True)
PY
}

github_age_h() {
  python3 - "$GITHUB_GATE_STATE" <<'PY'
import json, sys, time
try:
    last = float(json.load(open(sys.argv[1])).get("last_push_epoch") or 0)
except Exception:
    last = 0.0
print("never" if not last else "%.1f" % ((time.time() - last) / 3600.0))
PY
}

# Gitea git-over-HTTP needs a token, not the account password
GITEA_PW=$(cat ~/.config/gitea/game-backends-token 2>/dev/null)
if [ -z "$GITEA_PW" ]; then
  python3 "$(dirname "$0")/gitea_token.py" >/dev/null
  GITEA_PW=$(cat ~/.config/gitea/game-backends-token)
fi

rc=0
push_one origin http://100.98.163.120:3000/michael/game-backends.git michael "$GITEA_PW" || rc=1

if github_due; then
  if push_one github https://github.com/RDW-Labz/game-backends.git jmacluer-design "$(cat ~/.config/gh/pat)"; then
    github_mark_pushed
  else
    rc=1
  fi
else
  echo "github: deferred (last push $(github_age_h)h ago, batch interval ${GITHUB_MIN_INTERVAL_H}h) — Gitea is current"
fi

exit $rc
