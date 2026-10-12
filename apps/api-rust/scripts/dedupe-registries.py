#!/usr/bin/env python3
"""Removes repeated lines from the registry files after a union merge.

The registry files (see .gitattributes) merge with `merge=union`, which keeps
both sides' lines and so can repeat a `mod` line both branches carried. Run
this after merging branches that each added modules, then `cargo fmt`.
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
REGISTRIES = [
    "src/domain/mod.rs",
    "src/use_cases/mod.rs",
    "src/use_cases/ports/mod.rs",
    "src/use_cases/test_support/mod.rs",
    "src/infrastructure/mod.rs",
    "src/infrastructure/db/repositories/mod.rs",
    "src/http/di/mod.rs",
    "src/http/routes/mod.rs",
    "tests/integration/main.rs",
]


def dedupe(text: str) -> str:
    seen: set[str] = set()
    kept: list[str] = []
    for line in text.splitlines():
        statement = line.strip()
        # Only a complete one-line statement is a duplicate. Blank lines,
        # comments, attributes and the lines of a wrapped `pub use { ... };`
        # legitimately repeat.
        if statement.startswith(("mod ", "pub mod ", "pub(crate) mod ", "pub use ")) and (
            statement.endswith(";")
        ):
            if statement in seen:
                continue
            seen.add(statement)
        kept.append(line)
    return "\n".join(kept) + "\n"


for relative in REGISTRIES:
    path = ROOT / relative
    if not path.exists():
        continue
    original = path.read_text()
    cleaned = dedupe(original)
    if cleaned != original:
        path.write_text(cleaned)
        print(f"deduplicated {relative}")
