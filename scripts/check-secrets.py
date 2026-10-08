#!/usr/bin/env python3
"""Fast, dependency-free guard against committed credentials and local env files."""

import pathlib
import re
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
TRACKED = subprocess.check_output(["git", "ls-files", "-z"], cwd=ROOT).split(b"\0")
KEY_PATTERNS = (
    re.compile(rb"-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----"),
    re.compile(rb"gh[pousr]_[A-Za-z0-9_]{30,}"),
    re.compile(rb"github_pat_[A-Za-z0-9_]{30,}"),
    re.compile(rb"sk-(?:proj-)?[A-Za-z0-9_-]{32,}"),
    re.compile(rb"AKIA[0-9A-Z]{16}"),
    re.compile(rb"(?i)(?:DEPLOYER|SETTLEMENT)_PRIVATE_KEY\s*[:=]\s*['\"]?0x[0-9a-f]{64}"),
)
SKIP_PARTS = {"node_modules", "dist", ".git"}
# This blob contains a low-integer example key from the original scaffold.
# It is already public and unsafe for any funded account. Keep the exact blob
# exception narrow; all new history remains subject to the scan.
LEGACY_PUBLIC_EXAMPLE_BLOB = "042d29578c0f8e412c808d049b7dad2edb023927"
findings = []

for entry in TRACKED:
    if not entry:
        continue
    relative = pathlib.Path(entry.decode("utf-8", "surrogateescape"))
    if SKIP_PARTS.intersection(relative.parts):
        findings.append(f"{relative}: generated or dependency directory is tracked")
        continue
    name = relative.name
    if ((name == ".env" or name.startswith(".env.") or
         name == ".dev.vars" or name.startswith(".dev.vars.")) and
        not name.endswith(".example")):
        findings.append(f"{relative}: local configuration is tracked")
        continue
    path = ROOT / relative
    if not path.is_file():
        continue
    data = path.read_bytes()
    for pattern in KEY_PATTERNS:
        if pattern.search(data):
            findings.append(f"{relative}: possible credential matches {pattern.pattern[:24]!r}")

history_checked = 0
if "--history" in sys.argv[1:]:
    objects = subprocess.check_output(["git", "rev-list", "--objects", "--all"], cwd=ROOT).splitlines()
    seen = set()
    for item in objects:
        object_id = item.split(b" ", 1)[0].decode("ascii")
        if object_id in seen or object_id == LEGACY_PUBLIC_EXAMPLE_BLOB:
            continue
        seen.add(object_id)
        if subprocess.check_output(["git", "cat-file", "-t", object_id], cwd=ROOT).strip() != b"blob":
            continue
        data = subprocess.check_output(["git", "cat-file", "blob", object_id], cwd=ROOT)
        history_checked += 1
        if any(pattern.search(data) for pattern in KEY_PATTERNS):
            findings.append(f"history blob {object_id[:12]}: possible credential")

if findings:
    print("Credential guard failed:\n" + "\n".join(findings), file=sys.stderr)
    sys.exit(1)
print(f"Credential guard passed for {sum(bool(x) for x in TRACKED)} tracked paths.")
if "--history" in sys.argv[1:]:
    print(f"History guard passed for {history_checked} blobs; one documented public example blob excluded.")
