import "server-only";
import { requireProfile } from "./auth";
import { userTransaction } from "./database";
import type { PortalData, Rules } from "@/types/domain";
export async function loadPortal(): Promise<PortalData> {
  const { profile } = await requireProfile();
  return userTransaction(profile.id, async (tx) => {
    const query = async <T>(sql: string, params: unknown[] = []) =>
      (await tx.query<T>(sql, params)).rows;
    const [
      profiles,
      organizations,
      contracts,
      bookings,
      ledger,
      audits,
      notifications,
      blocks,
      resources,
      files,
      carry,
      templates,
      logs,
    ] = await Promise.all(
      [
        "profiles",
        "organizations",
        "contracts",
        "bookings",
        "session_ledger",
        "audit_logs",
        "notifications",
        "calendar_blocks",
        "resources",
        "booking_files",
        "carry_forward",
        "notification_templates",
        "shooting_logs",
      ].map((table) => query(`select * from public.${table}`)),
    );
    const rules = (
      await query<{ value: Rules }>(
        "select value from system_settings where key='booking_rules'",
      )
    )[0].value;
    const allocations = await query("select * from session_balances()");
    const balances = await query("select * from contract_balances()");
    const busy = await query(
      "select * from calendar_availability(now()-interval '30 days',now()+interval '360 days')",
    );
    return {
      profile,
      profiles,
      organizations,
      contracts,
      bookings,
      ledger,
      audits,
      notifications,
      blocks,
      resources,
      files,
      carry,
      templates,
      logs,
      rules,
      allocations,
      balances,
      busy,
    } as PortalData;
  });
}
