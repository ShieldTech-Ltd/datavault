#!/usr/bin/env python3
"""Exercise the Worker SQL against the actual D1 migration schema with SQLite."""

from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import re
import sqlite3
import tempfile

ROOT = Path(__file__).resolve().parents[1]


def sql_from_source(path: str, marker: str) -> str:
    source = (ROOT / path).read_text()
    start = source.index(marker)
    match = re.search(r"prepare\(\s*`([^`]+)`", source[start:], re.DOTALL)
    assert match, f"SQL template not found after {marker}"
    return match.group(1)


def open_database(path: str) -> sqlite3.Connection:
    connection = sqlite3.connect(path, timeout=10)
    connection.execute("PRAGMA busy_timeout = 10000")
    return connection


def test_staging(connection: sqlite3.Connection) -> None:
    sql = sql_from_source("worker/src/lib/d1.ts", "export async function insertCollection")
    row = ("collection-1", "owner-1", "Guide", "hash-1", 1_000_000, 1_000_000, -800_000)
    assert connection.execute(sql, row).rowcount == 1
    assert connection.execute(sql, row).rowcount == 0, "live staging must not be overwritten"
    connection.execute("UPDATE collections SET staged_at = ? WHERE collection_id = ?", (-900_000, "collection-1"))
    assert connection.execute(sql, row).rowcount == 1, "expired staging must be reusable"
    connection.execute("UPDATE collections SET status = 'confirmed' WHERE collection_id = 'collection-1'")
    assert connection.execute(sql, row).rowcount == 0, "confirmed registration must not be overwritten"
    connection.execute("UPDATE collections SET status = 'orphaned' WHERE collection_id = 'collection-1'")
    assert connection.execute(sql, row).rowcount == 1, "orphaned staging must be reusable"
    connection.commit()


def test_concurrent_quota(path: str) -> None:
    sql = sql_from_source("worker/src/lib/ratelimit.ts", "const result = await env.DB.prepare")
    now = 1_000_000
    args = ("execute:buyer", now, now - 60, now - 60, now, now - 60, 10)

    def attempt(_: int) -> int:
        with open_database(path) as connection:
            return connection.execute(sql, args).rowcount

    with ThreadPoolExecutor(max_workers=20) as pool:
        admitted = list(pool.map(attempt, range(40)))
    assert sum(admitted) == 10, f"expected 10 admissions, got {sum(admitted)}"
    with open_database(path) as connection:
        count = connection.execute("SELECT count FROM rate_limits WHERE key = ?", ("execute:buyer",)).fetchone()[0]
        assert count == 10
        reset_args = ("execute:buyer", now + 61, now + 1, now + 1, now + 61, now + 1, 10)
        assert connection.execute(sql, reset_args).rowcount == 1
        assert connection.execute("SELECT count FROM rate_limits WHERE key = ?", ("execute:buyer",)).fetchone()[0] == 1


def main() -> None:
    with tempfile.TemporaryDirectory() as temporary:
        path = str(Path(temporary) / "d1.sqlite")
        with open_database(path) as connection:
            connection.execute("PRAGMA journal_mode = WAL")
            for migration in sorted((ROOT / "worker/migrations").glob("*.sql")):
                connection.executescript(migration.read_text())
            test_staging(connection)
        test_concurrent_quota(path)
    print("D1 staging and concurrent rate-limit invariants passed.")


if __name__ == "__main__":
    main()
