import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
const state = vi.hoisted(() => ({
  jobs: [] as Record<string, unknown>[],
  updates: [] as Record<string, unknown>[],
}));
vi.mock("server-only", () => ({}));
vi.mock("@/server/database", () => ({
  systemQuery: async (sql: string, params: unknown[] = []) => {
    if (sql.includes("claim_notifications")) return state.jobs;
    if (sql.includes("select * from notification_templates")) return [];
    if (sql.includes("select value"))
      return [{ value: { timezone: "Asia/Riyadh" } }];
    if (sql.includes("status='sent'"))
      state.updates.push({
        status: "sent",
        provider_message_id: params[0],
        failure_reason: params[1],
      });
    else if (sql.includes("status='failed'"))
      state.updates.push({ status: "failed", failure_reason: params[0] });
    return [];
  },
}));
import { sendBookingNotifications } from "../src/services/notifications";
beforeEach(() => {
  state.jobs = [
    {
      id: "notification-1",
      booking_id: "booking-1",
      channel: "email",
      event_type: "Booking approved",
      payload: {
        client: "Fake Studio",
        email: "fake@example.test",
        start: "2026-09-20T10:00:00Z",
        duration: 120,
        location: "Demo location",
        subject: "Demo subject",
        cancellation_hours: 24,
      },
    },
  ];
  state.updates = [];
  vi.stubEnv("EMAIL_API_KEY", "");
  vi.stubEnv("EMAIL_FROM", "");
  vi.stubEnv("WHATSAPP_WEBHOOK_URL", "");
  vi.stubEnv("WHATSAPP_WEBHOOK_TOKEN", "");
  vi.stubEnv("APP_URL", "http://localhost:3000");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
describe("Durable notification delivery", () => {
  it("records failure rather than pretending to send when email is unconfigured", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    expect(await sendBookingNotifications()).toEqual({ sent: 0, failed: 1 });
    expect(fetch).not.toHaveBeenCalled();
    expect(state.updates[0]).toMatchObject({
      status: "failed",
      failure_reason: "Email provider is not configured",
    });
  });
  it("sends confirmation with the mandatory policy and idempotency key", async () => {
    vi.stubEnv("EMAIL_API_KEY", "test-key");
    vi.stubEnv("EMAIL_FROM", "test@example.test");
    const fetch = vi
      .fn()
      .mockResolvedValue({
        ok: true,
        json: async () => ({ id: "provider-1" }),
      });
    vi.stubGlobal("fetch", fetch);
    expect(await sendBookingNotifications()).toEqual({ sent: 1, failed: 0 });
    const args = fetch.mock.calls[0][1];
    expect(args.headers["Idempotency-Key"]).toBe("notification-1");
    expect(JSON.parse(args.body)).toMatchObject({
      subject: "Shooting Session Confirmed - Brill Creations",
      to: ["fake@example.test"],
    });
    expect(JSON.parse(args.body).text).toContain("24 hours");
    expect(state.updates[0]).toMatchObject({
      status: "sent",
      provider_message_id: "provider-1",
    });
  });
  it("falls back to email when WhatsApp is unavailable and records the fallback", async () => {
    state.jobs[0].channel = "whatsapp";
    vi.stubEnv("EMAIL_API_KEY", "test-key");
    vi.stubEnv("EMAIL_FROM", "test@example.test");
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue({
          ok: true,
          json: async () => ({ id: "fallback-1" }),
        }),
    );
    expect(await sendBookingNotifications()).toEqual({ sent: 1, failed: 0 });
    expect(state.updates[0]).toMatchObject({
      status: "sent",
      failure_reason: "WhatsApp unavailable; delivered by email fallback",
    });
  });
  it("does not mark an unacknowledged provider response as sent", async () => {
    vi.stubEnv("EMAIL_API_KEY", "test-key");
    vi.stubEnv("EMAIL_FROM", "test@example.test");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }),
    );
    expect(await sendBookingNotifications()).toEqual({ sent: 0, failed: 1 });
    expect(state.updates[0].status).toBe("failed");
  });
});
