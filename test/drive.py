#!/usr/bin/env python3
"""Speak the Chromium native messaging protocol to host/umber-host.

Writes each JSON message given on argv to the host's stdin with its 4-byte LE
length prefix, then reads whatever the host pushes back until it goes quiet.
Prints one JSON message per line so hostile.sh can assert on them.
"""
import json, os, struct, subprocess, sys, threading, time

host, deadline = sys.argv[1], float(sys.argv[2])
# "@path" reads the message body from a file: a 12 MB screenshot envelope does
# not fit in argv.
messages = []
for a in sys.argv[3:]:
    if a.startswith("@"):
        messages.append(open(a[1:], "rb").read())
    else:
        messages.append(a.encode())

p = subprocess.Popen([host], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                     stderr=subprocess.DEVNULL)

out = []
def reader():
    while True:
        hdr = p.stdout.read(4)
        if not hdr or len(hdr) < 4:
            return
        (n,) = struct.unpack("<I", hdr)
        if n > 32 * 1024 * 1024:
            return
        body = p.stdout.read(n)
        if body is None or len(body) < n:
            return
        out.append(body)

t = threading.Thread(target=reader, daemon=True)
t.start()

time.sleep(0.6)  # let the connect-time palette and styles push land
for m in messages:
    p.stdin.write(struct.pack("<I", len(m)) + m)
    p.stdin.flush()
    time.sleep(0.5)
time.sleep(deadline)

p.stdin.close()
try:
    p.wait(timeout=5)
except subprocess.TimeoutExpired:
    p.kill()

for body in out:
    try:
        print(json.dumps(json.loads(body.decode("utf-8", "replace")), sort_keys=True))
    except Exception:
        print(json.dumps({"type": "UNPARSEABLE", "raw": body[:200].decode("utf-8", "replace")}))
