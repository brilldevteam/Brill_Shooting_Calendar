import "server-only";
import { systemQuery } from "@/server/database";
import type { ShootingLog } from "@/types/domain";
export interface ShootingLogIntegration {
  publish(id: string, payload: unknown): Promise<string>;
}
export class WebhookShootingLog implements ShootingLogIntegration {
  async publish(id: string, payload: unknown) {
    if (
      !process.env.SHOOTING_LOG_WEBHOOK_URL ||
      !process.env.SHOOTING_LOG_WEBHOOK_TOKEN
    )
      throw new Error("External Shooting Log integration is not configured");
    const response = await fetch(process.env.SHOOTING_LOG_WEBHOOK_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.SHOOTING_LOG_WEBHOOK_TOKEN}`,
        "Content-Type": "application/json",
        "Idempotency-Key": id,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok)
      throw new Error(`Shooting Log delivery failed (${response.status})`);
    const result = await response.json();
    if (!result.id) throw new Error("External log did not return an ID");
    return String(result.id);
  }
}
export async function publishShootingLogs() {
  const data = await systemQuery<ShootingLog>(
    "select * from shooting_logs where status='pending' order by created_at limit 25",
  );
  let sent = 0,
    failed = 0;
  for (const log of data || []) {
    try {
      const id = await new WebhookShootingLog().publish(log.id, {
        ...log.payload,
        actual_start: log.actual_start,
        actual_end: log.actual_end,
        production_notes: log.production_notes,
        post_shoot_confirmed: log.post_shoot_confirmed,
      });
      await systemQuery(
        "update shooting_logs set status='sent',external_id=$1,failure_reason=null where id=$2",
        [id, log.id],
      );
      sent++;
    } catch (error) {
      await systemQuery(
        "update shooting_logs set status='failed',failure_reason=$1 where id=$2",
        [(error as Error).message, log.id],
      );
      failed++;
    }
  }
  return { sent, failed };
}
