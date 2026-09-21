import { it, expect } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import { openDatabase } from "../db/runtime.mjs";

it("persists PostgreSQL across restarts and rejects a second owner", async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "brill-database-test-"));
  let db;
  try {
    db = await openDatabase(resolve(directory, "postgres"));
    expect((await db.query("select date '2026-09-15' as day")).rows).toEqual([
      { day: "2026-09-15" },
    ]);
    await db.query(
      "insert into auth.users(email,password_hash) values('persistence@example.test','test-only')",
    );
    await expect(openDatabase(resolve(directory, "postgres"))).rejects.toThrow(
      "already open",
    );
    await db.close();
    db = await openDatabase(resolve(directory, "postgres"));
    const result = await db.query(
      "select email from auth.users where email='persistence@example.test'",
    );
    expect(result.rows).toEqual([{ email: "persistence@example.test" }]);
    expect(
      (await db.query("select * from schema_migrations")).rows.length,
    ).toBeGreaterThanOrEqual(6);
  } finally {
    await db?.close();
    if (!directory.startsWith(resolve(tmpdir()) + sep + "brill-database-test-"))
      throw new Error("Unexpected temporary path");
    await rm(directory, { recursive: true, force: true });
  }
}, 30000);
