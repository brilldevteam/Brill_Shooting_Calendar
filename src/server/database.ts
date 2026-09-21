import "server-only";
import { getDatabase } from "../../db/runtime.mjs";
import type { Transaction } from "@electric-sql/pglite";
export { getDatabase };
export function plain<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value, (_key, v) => (typeof v === "bigint" ? Number(v) : v)),
  ) as T;
}
export async function systemQuery<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  return plain((await (await getDatabase()).query<T>(sql, params)).rows);
}
export async function userTransaction<T>(
  userId: string,
  work: (tx: Transaction) => Promise<T>,
): Promise<T> {
  const db = await getDatabase();
  return db.transaction(async (tx) => {
    await tx.exec("set local role authenticated");
    await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [
      userId,
    ]);
    return plain(await work(tx));
  });
}
export async function userQuery<T = Record<string, unknown>>(
  userId: string,
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  return userTransaction(
    userId,
    async (tx) => (await tx.query<T>(sql, params)).rows,
  );
}
const commands = {
  create_booking_request: ["input"],
  booking_command: ["bid", "command", "input"],
  manage_record: ["kind", "input"],
  register_booking_file: ["input"],
} as const;
export async function runCommand(
  userId: string,
  name: keyof typeof commands,
  input: Record<string, unknown>,
) {
  const keys = commands[name];
  const params = keys.map((k) =>
    typeof input[k] === "object" ? JSON.stringify(input[k]) : input[k],
  );
  const rows = await userQuery<{ id: string }>(
    userId,
    `select public.${name}(${keys.map((_, i) => `$${i + 1}`).join(",")}) id`,
    params,
  );
  return rows[0].id;
}
