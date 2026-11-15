#!/bin/bash
# Push the library to Gitea (source of truth) and GitHub (RDW-Labz org).
# Credentials go through a throwaway askpass helper that cats a 0600 file, so
# nothing lands in git config and shell quoting cannot mangle the password.
set -uo pipefail
cd "$(dirname "$0")/.."

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

# Gitea git-over-HTTP needs a token, not the account password
GITEA_PW=$(cat ~/.config/gitea/game-backends-token 2>/dev/null)
if [ -z "$GITEA_PW" ]; then
  python3 "$(dirname "$0")/gitea_token.py" >/dev/null
  GITEA_PW=$(cat ~/.config/gitea/game-backends-token)
fi

rc=0
push_one origin http://100.98.163.120:3000/michael/game-backends.git michael "$GITEA_PW" || rc=1
push_one github https://github.com/RDW-Labz/game-backends.git jmacluer-design "$(cat ~/.config/gh/pat)" || rc=1
exit $rc
