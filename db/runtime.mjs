import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { mkdir, readFile, readdir, open, unlink } from "node:fs/promises";
import { unlinkSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";

/** The singleton owns one embedded PostgreSQL process per Next.js server. */
export async function openDatabase(
  directory = resolve(process.env.APP_DATA_DIR || ".data", "postgres"),
) {
  await mkdir(directory, { recursive: true });
  const lock = directory + ".app-lock";
  try {
    const handle = await open(lock, "wx");
    await handle.writeFile(String(process.pid));
    await handle.close();
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    const pid = Number(await readFile(lock, "utf8"));
    if (!pid)
      throw new Error(
        "Database is starting in another process. Try again shortly.",
      );
    let alive = true;
    try {
      process.kill(pid, 0);
    } catch (e) {
      if (e.code === "ESRCH") alive = false;
    }
    if (alive)
      throw new Error(
        "This database is already open. Stop the other app/seed process before starting another instance.",
      );
    await unlink(lock);
    const handle = await open(lock, "wx");
    await handle.writeFile(String(process.pid));
    await handle.close();
  }
  const db = new PGlite({
    dataDir: directory,
    extensions: { btree_gist },
    // PostgreSQL DATE is a calendar date, not an instant in time.
    parsers: { 1082: (value) => value },
  });
  const close = db.close.bind(db);
  const cleanup = () => {
    try {
      unlinkSync(lock);
    } catch {}
  };
  process.once("exit", cleanup);
  db.close = async () => {
    await close();
    cleanup();
    process.removeListener("exit", cleanup);
  };
  try {
    await db.exec(
      "create table if not exists public.schema_migrations(name text primary key,checksum text not null,applied_at timestamptz not null default now())",
    );
    const folder = resolve(process.cwd(), "db/migrations");
    for (const name of (await readdir(folder))
      .filter((f) => f.endsWith(".sql"))
      .sort()) {
      const sql = await readFile(resolve(folder, name), "utf8");
      const checksum = createHash("sha256").update(sql).digest("hex");
      const existing = await db.query(
        "select checksum from public.schema_migrations where name=$1",
        [name],
      );
      if (existing.rows.length) {
        if (existing.rows[0].checksum !== checksum)
          throw new Error(
            `Applied migration ${name} changed. Restore it and create a new migration.`,
          );
        continue;
      }
      await db.transaction(async (tx) => {
        await tx.exec(sql);
        await tx.query(
          "insert into public.schema_migrations(name,checksum) values($1,$2)",
          [name, checksum],
        );
      });
    }
    return db;
  } catch (error) {
    await db.close();
    throw error;
  }
}
/** @returns {Promise<PGlite>} */
export function getDatabase() {
  globalThis.brillDatabasePromise ??= openDatabase();
  return globalThis.brillDatabasePromise;
}
