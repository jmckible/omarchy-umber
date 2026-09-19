#!/bin/bash
# Hostile fixtures for host/umber-host, run against an isolated HOME.
#
# Every case here is something a process running as the user, or a web page
# shaping an extension message, can actually arrange. The assertion in each is
# the same: the host refuses, and the victim file outside sites/ is untouched.
set -uo pipefail

REPO="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
HOST="$REPO/host/umber-host"
PASS=0
FAIL=0

ok() { printf '  \033[32mok\033[0m   %s\n' "$1"; PASS=$((PASS + 1)); }
no() { printf '  \033[31mFAIL\033[0m %s\n' "$1"; FAIL=$((FAIL + 1)); }

# sandboxed CMD... — run CMD with the sandbox as HOME. herdr and the compositor
# are reached through inherited variables, not HOME, so those are pointed at
# the sandbox or dropped: a fixture must never open a tab in the real herdr
# session or raise a window on the real desktop.
sandboxed() {
  env -u HERDR_ENV -u HERDR_PANE_ID -u HERDR_TAB_ID -u HERDR_WORKSPACE_ID \
    -u HYPRLAND_INSTANCE_SIGNATURE -u WAYLAND_DISPLAY \
    HOME="$SANDBOX" XDG_RUNTIME_DIR="$SANDBOX/run" XDG_CONFIG_HOME="$SANDBOX/.config" \
    HERDR_SOCKET_PATH="$SANDBOX/herdr.sock" "$@"
}

# run DEADLINE MESSAGE... — drive the host in the sandbox HOME, messages on stdout
run() {
  local deadline=$1
  shift
  sandboxed python3 "$REPO/test/drive.py" "$HOST" "$deadline" "$@"
}

setup() {
  SANDBOX=$(mktemp -d "${TMPDIR:-/tmp}/umber-hostile.XXXXXX")
  mkdir -p "$SANDBOX/sites" "$SANDBOX/run" \
    "$SANDBOX/.config/umber/sites" "$SANDBOX/.local/state/omarchy/current"
  printf 'DO NOT TOUCH\n' >"$SANDBOX/victim"
  VICTIM_SUM=$(sha256sum <"$SANDBOX/victim")
  SITES="$SANDBOX/.config/umber/sites"
}

teardown() { rm -rf -- "$SANDBOX"; }

victim_intact() {
  [[ $(sha256sum <"$SANDBOX/victim") == "$VICTIM_SUM" ]]
}

echo "umber hostile fixtures"

# --- reads: what may become a stylesheet ------------------------------------

setup
printf 'SECRET KEY MATERIAL\n' >"$SANDBOX/secret"
ln -s "$SANDBOX/secret" "$SITES/leak.css"
out=$(run 0.4)
if grep -q 'SECRET KEY MATERIAL' <<<"$out"; then
  no "symlinked stylesheet: contents reached the browser"
else
  ok "symlinked stylesheet is refused, not followed"
fi
teardown

setup
mkfifo "$SITES/pipe.css"
out=$(timeout 25s bash -c "$(declare -f sandboxed run); SANDBOX='$SANDBOX' REPO='$REPO' HOST='$HOST' run 0.4" 2>/dev/null)
rc=$?
if ((rc == 124)); then
  no "FIFO stylesheet: the host parked on the open"
else
  ok "FIFO stylesheet does not park the host"
fi
teardown

setup
head -c 400000 /dev/zero | tr '\0' 'a' >"$SITES/huge.css"
out=$(run 0.4)
if grep -q '"name":"huge"' <<<"$(tr -d ' ' <<<"$out")"; then
  no "oversize stylesheet: pushed anyway"
else
  ok "oversize stylesheet is refused"
fi
teardown

setup
printf '/* @match %s */\nbody{color:red}\n' "$(printf '*%.0s' {1..60})://x/*" >"$SITES/stars.css"
out=$(run 0.4)
if python3 - "$out" <<'PY' 2>/dev/null
import json, sys
for line in sys.argv[1].splitlines():
    m = json.loads(line)
    if m.get("type") == "styles":
        for s in m["styles"]:
            if s["name"] == "stars" and s["matches"]:
                sys.exit(1)
sys.exit(0)
PY
then
  ok "star-bomb @match pattern is dropped before it reaches the regex"
else
  no "star-bomb @match pattern survived into matches"
fi
teardown

# --- the sites directory itself ----------------------------------------------
# Keeping stylesheets in a dotfiles repo makes sites/ a symlink to a directory.
# That is a supported setup: reads resolve through it and the watcher watches
# the resolved root. Neither may soften the per-file rule, and the live push has
# to keep working -- a sites dir that loads once and then goes quiet is the
# failure that looks like success.

setup
rmdir "$SITES"
mkdir -p "$SANDBOX/dotfiles/sites"
ln -s "$SANDBOX/dotfiles/sites" "$SITES"
printf 'SECRET KEY MATERIAL\n' >"$SANDBOX/secret"
ln -s "$SANDBOX/secret" "$SANDBOX/dotfiles/sites/leak.css"
out=$(run 0.4)
if grep -q 'SECRET KEY MATERIAL' <<<"$out"; then
  no "symlinked sites dir: a planted symlink inside it was followed"
else
  ok "a symlinked sites dir does not soften the per-file symlink refusal"
fi
teardown

setup
rmdir "$SITES"
mkdir -p "$SANDBOX/dotfiles/sites"
ln -s "$SANDBOX/dotfiles/sites" "$SITES"
(run 2.0 >"$SANDBOX/live.out" 2>/dev/null) &
drv=$!
sleep 1.2
printf '/* @match example.com */\nbody{--umber-live-reload:1}\n' \
  >"$SANDBOX/dotfiles/sites/live.css"
wait "$drv"
if grep -q 'umber-live-reload' "$SANDBOX/live.out"; then
  ok "a save through a symlinked sites dir is pushed to the browser"
else
  no "a save through a symlinked sites dir never reached the browser"
fi
teardown

# --- writes: append ----------------------------------------------------------

setup
run 0.4 '{"type":"append","site":"../../../victim","css":"a { color: var(--omarchy-red) !important; }"}' >/dev/null
if victim_intact && [[ ! -e $SITES/../../../victim.css ]]; then
  ok "traversing stylesheet name is refused"
else
  no "traversing stylesheet name wrote outside sites/"
fi
teardown

setup
ln -s "$SANDBOX/victim" "$SITES/planted.css"
run 0.4 '{"type":"append","site":"planted","css":"a { color: var(--omarchy-red) !important; }"}' >/dev/null
if victim_intact; then
  ok "append through a planted symlink leaves the victim untouched"
else
  no "append followed a planted symlink and wrote the victim"
fi
teardown

setup
printf '/* @match x */\n' >"$SITES/site.css"
before=$(sha256sum <"$SITES/site.css")
run 0.4 '{"type":"append","site":"site","css":"a {} body { background: url(https://evil.example/x) }"}' >/dev/null
run 0.4 '{"type":"append","site":"site","css":"@import url(https://evil.example/x);"}' >/dev/null
run 0.4 '{"type":"append","site":"site","css":"a { color: red !important; }"}' >/dev/null
if [[ $(sha256sum <"$SITES/site.css") == "$before" ]]; then
  ok "css outside the palette-remap shape is refused (escape, @import, literal colour)"
else
  no "css outside the palette-remap shape was appended"
fi
teardown

setup
printf '/* @match x */\n' >"$SITES/site.css"
run 0.4 '{"type":"append","site":"site","css":"a.b > c:hover { background-color: var(--omarchy-lighter-background) !important; }"}' >/dev/null
if grep -q 'omarchy-lighter-background' "$SITES/site.css"; then
  ok "a well-formed picked rule still appends"
else
  no "a well-formed picked rule was refused"
fi
teardown

setup
run 0.4 '{"type":"append","site":"newsite.example","css":"a { color: var(--omarchy-red) !important; }"}' >/dev/null
if [[ -f $SITES/newsite.example.css ]] && head -1 "$SITES/newsite.example.css" | grep -q '@match \*://newsite.example/\*'; then
  ok "a new stylesheet is scoped from the hostname, not from the message"
else
  no "new stylesheet scope is wrong"
fi
teardown

setup
run 0.4 '{"type":"append","site":"my_theme","css":"a { color: var(--omarchy-red) !important; }"}' >/dev/null
if [[ ! -e $SITES/my_theme.css ]]; then
  ok "append to a missing stylesheet whose name is not a hostname is refused"
else
  no "append minted a stylesheet from a name that scopes to nothing"
fi
teardown

# --- writes: agent context ---------------------------------------------------

setup
out=$(run 0.4 '{"type":"agent","site":"x","url":"file:///etc/passwd","census":{},"screenshot":null}')
if grep -q 'not an http' <<<"$out"; then
  ok "non-http page URL is refused"
else
  no "non-http page URL was accepted"
fi
teardown

setup
python3 -c '
import json, sys
sys.stdout.write(json.dumps({"type": "agent", "site": "x", "url": "https://example.com/",
                             "census": {}, "screenshot": "data:image/jpeg;base64," + "A" * 12000000}))
' >"$SANDBOX/big.json"
out=$(run 0.8 "@$SANDBOX/big.json")
if grep -q 'agent terminal launched\|no default agent' <<<"$out" && [[ ! -s $SANDBOX/run/*/context/x/page.jpg ]] 2>/dev/null; then
  ok "oversize screenshot is dropped without wedging the host"
elif [[ -n $out ]]; then
  ok "oversize screenshot does not wedge the host"
else
  no "oversize screenshot wedged the host"
fi
teardown

# --- agent launch: herdr -----------------------------------------------------
# With a herdr server running, the host types a command into a pane's shell.
# A page URL that is also a command substitution has to reach the agent as text
# and never run. The fixture runs its own herdr server in the sandbox. Its panes
# find a stub omarchy-agent-prompt that records argv. The default agent is a
# name nothing installs, so a fall-through to the stock launch fails there
# instead of opening a real agent.

if command -v herdr >/dev/null 2>&1; then
  setup
  mkdir -p "$SANDBOX/stub" "$SANDBOX/.config/omarchy/defaults"
  printf 'umber-no-such-agent\n' >"$SANDBOX/.config/omarchy/defaults/agent"
  cat >"$SANDBOX/stub/omarchy-agent-prompt" <<'SH'
#!/bin/bash
printf '%s\0' "$@" >"$HOME/argv"
SH
  chmod +x "$SANDBOX/stub/omarchy-agent-prompt"
  PATH="$SANDBOX/stub:$PATH" sandboxed setsid -f herdr server </dev/null >/dev/null 2>&1
  for _ in {1..50}; do
    [[ $(sandboxed herdr status server --json 2>/dev/null | jq -r '.running') == true ]] && break
    sleep 0.1
  done
  if [[ $(sandboxed herdr status server --json 2>/dev/null | jq -r '.running') != true ]]; then
    no "herdr fixture: the sandbox server did not come up"
  else
    url="https://example.com/\$(touch\${IFS}$SANDBOX/pwned)"
    out=$(run 0.8 "$(jq -nc --arg url "$url" \
      '{type: "agent", site: "x", url: $url, census: {}, screenshot: null}')")
    for _ in {1..30}; do
      [[ -s $SANDBOX/argv ]] && break
      sleep 0.1
    done
    if [[ -e $SANDBOX/pwned ]]; then
      no "herdr launch: a command substitution in the page URL ran in the pane's shell"
    elif ! grep -q 'launched in herdr' <<<"$out"; then
      no "herdr launch: the host did not hand the agent to a running herdr server"
    elif python3 - "$SANDBOX/argv" "$url" <<'PY'
import sys
argv = open(sys.argv[1], "rb").read().decode().split("\0")[:-1]
sys.exit(0 if len(argv) == 2 and argv[0] == "--inline" and sys.argv[2] in argv[1] else 1)
PY
    then
      ok "herdr launch hands the prompt over as data; a shell-shaped page URL stays text"
    else
      no "herdr launch: the agent did not receive the prompt intact"
    fi
  fi
  sandboxed herdr server stop >/dev/null 2>&1
  teardown
else
  printf '  skip herdr launch (herdr not installed)\n'
fi

# --- protocol ----------------------------------------------------------------

setup
out=$(sandboxed python3 - "$HOST" <<'PY'
import struct, subprocess, sys, time
p = subprocess.Popen([sys.argv[1]], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                     stderr=subprocess.DEVNULL)
time.sleep(0.6)
p.stdin.write(struct.pack("<I", 64 * 1024 * 1024))  # claimed length over the ceiling
p.stdin.flush()
time.sleep(0.5)
p.stdin.close()
try:
    p.wait(timeout=5); print("exited")
except subprocess.TimeoutExpired:
    p.kill(); print("hung")
PY
)
if [[ $out == exited ]]; then
  ok "an over-ceiling declared message length ends the loop instead of allocating"
else
  no "an over-ceiling declared message length hung the host"
fi
teardown

printf '\n%d passed, %d failed\n' "$PASS" "$FAIL"
((FAIL == 0))
