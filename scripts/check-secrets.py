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

if findings:
    print("Credential guard failed:\n" + "\n".join(findings), file=sys.stderr)
    sys.exit(1)
print(f"Credential guard passed for {sum(bool(x) for x in TRACKED)} tracked paths.")
