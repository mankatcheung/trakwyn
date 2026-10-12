#!/usr/bin/env python3
"""Resolves a merge conflict where both branches appended blocks to a file.

Two branches that each append `pub mod x { ... }` at the end of
`src/use_cases/constants.rs` conflict, and git shares the final `}` between
the two sides. This keeps both sides and restores the brace.

Usage: scripts/resolve-appended-blocks.py <file>...
"""
import re
import sys
from pathlib import Path

CONFLICT = re.compile(
    r"<<<<<<< [^\n]*\n(?P<ours>.*?)=======\n(?P<theirs>.*?)>>>>>>> [^\n]*\n",
    re.DOTALL,
)


def keep_both(match: re.Match[str]) -> str:
    ours = match.group("ours").rstrip("\n")
    theirs = match.group("theirs")
    # The closing brace after the markers ends `theirs`; `ours` lost its own.
    return f"{ours}\n}}\n\n{theirs}"


for name in sys.argv[1:]:
    path = Path(name)
    text = path.read_text()
    resolved, count = CONFLICT.subn(keep_both, text)
    if count:
        path.write_text(resolved)
        print(f"kept both sides of {count} conflict(s) in {name}")
