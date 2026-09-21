import "server-only";
import { systemQuery } from "@/server/database";
import type { Notice, Template } from "@/types/domain";
import { formatInTimeZone } from "date-fns-tz";
export interface Delivery {
  id: string;
}
export interface NotificationProvider {
  send(
    to: string,
    subject: string,
    body: string,
    idempotencyKey: string,
  ): Promise<Delivery>;
}
class EmailProvider implements NotificationProvider {
  async send(
    to: string,
    subject: string,
    body: string,
    idempotencyKey: string,
  ) {
    if (!process.env.EMAIL_API_KEY || !process.env.EMAIL_FROM)
      throw new Error("Email provider is not configured");
    const response = await fetch(
      process.env.EMAIL_API_URL || "https://api.resend.com/emails",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.EMAIL_API_KEY}`,
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({
          from: process.env.EMAIL_FROM,
          to: [to],
          subject,
          text: body,
        }),
        signal: AbortSignal.timeout(15000),
      },
    );
    if (!response.ok)
      throw new Error(`Email delivery failed (${response.status})`);
    const result = await response.json();
    if (!result.id)
      throw new Error("Email provider did not return a message ID");
    return { id: String(result.id) };
  }
}
class WhatsAppProvider implements NotificationProvider {
  async send(
    to: string,
    subject: string,
    body: string,
    idempotencyKey: string,
  ) {
    if (
      !process.env.WHATSAPP_WEBHOOK_URL ||
      !process.env.WHATSAPP_WEBHOOK_TOKEN ||
      !to
    )
      throw new Error("WhatsApp unavailable");
    const response = await fetch(process.env.WHATSAPP_WEBHOOK_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_WEBHOOK_TOKEN}`,
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify({ to, subject, body }),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok)
      throw new Error(`WhatsApp delivery failed (${response.status})`);
    const result = await response.json();
    if (!result.id)
      throw new Error("WhatsApp adapter did not acknowledge delivery");
    return { id: String(result.id) };
  }
}
export async function sendBookingNotifications() {
  const jobs = await systemQuery<Notice>("select * from claim_notifications()");
  const templates = await systemQuery<Template>(
    "select * from notification_templates",
  );
  const [settings] = await systemQuery<{ value: { timezone: string } }>(
    "select value from system_settings where key='booking_rules'",
  );
  let sent = 0,
    failed = 0;
  for (const job of (jobs || []) as Notice[]) {
    try {
      const template = ((templates as Template[]) || []).find(
        (t) => t.event_type === job.event_type && t.channel === job.channel,
      );
      // Mandatory events always deliver; disabling a customized template falls back to the default.
      const vars: Record<string, string> = Object.fromEntries(
        Object.entries(job.payload).map(([k, v]) => [k, String(v ?? "")]),
      );
      vars.link = `${process.env.APP_URL}/?booking=${job.booking_id}`;
      for (const k of ["start", "end", "cancellation_deadline"])
        if (vars[k])
          vars[k] = formatInTimeZone(
            new Date(vars[k]),
            settings?.value.timezone || "Asia/Riyadh",
            "EEE, dd MMM yyyy HH:mm zzz",
          );
      const render = (text: string) =>
        text
          .replace(/\{\{(\w+)\}\}/g, (_, key: string) => vars[key] || "")
          .replace(/\\n/g, "\n");
      const defaultBody =
        "Client: {{client}}\nDate / time: {{start}}\nDuration: {{duration}} minutes\nLocation: {{location}}\nSubject: {{subject}}\nStatus: {{status}}\nCancellation deadline: {{cancellation_deadline}}\nCancellation or rescheduling within {{cancellation_hours}} hours counts as a used session. Please prepare your script and content plan.\n{{link}}";
      const subject = render(
        template?.enabled
          ? template.subject
          : job.event_type === "Booking approved"
            ? "Shooting Session Confirmed - Brill Creations"
            : `${job.event_type} - Brill Creations`,
      );
      const body = render(template?.enabled ? template.body : defaultBody);
      let delivery: Delivery;
      let fallback = false;
      if (job.channel === "whatsapp") {
        try {
          delivery = await new WhatsAppProvider().send(
            vars.phone,
            subject,
            body,
            job.id,
          );
        } catch {
          delivery = await new EmailProvider().send(
            vars.email,
            subject,
            body,
            `${job.id}-email`,
          );
          fallback = true;
        }
      } else
        delivery = await new EmailProvider().send(
          vars.email,
          subject,
          body,
          job.id,
        );
      await systemQuery(
        "update notifications set status='sent',provider_message_id=$1,sent_at=now(),failure_reason=$2 where id=$3",
        [
          delivery.id,
          fallback ? "WhatsApp unavailable; delivered by email fallback" : null,
          job.id,
        ],
      );
      sent++;
    } catch (error) {
      failed++;
      await systemQuery(
        "update notifications set status='failed',failure_reason=$1 where id=$2",
        [(error as Error).message, job.id],
      );
    }
  }
  return { sent, failed };
}
