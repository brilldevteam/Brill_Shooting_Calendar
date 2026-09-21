import { describe, it, expect } from "vitest";
import {
  calculateWorkingDays,
  calculateBookingEligibility,
  calculateCancellationDeadline,
  isLateChange,
  checkCalendarConflict,
} from "../src/features/bookings/rules";
import { bookingSchema, validateFile } from "../src/validation/booking";
const rules = {
  working_days: [0, 1, 2, 3, 4],
  timezone: "Asia/Riyadh",
  lead_time_days: 4,
};
describe("Working days and lead time", () => {
  it("counts Sunday through Thursday, excludes both endpoints and Friday/Saturday", () => {
    expect(
      calculateWorkingDays(
        new Date("2026-09-10T08:00:00+03:00"),
        new Date("2026-09-17T10:00:00+03:00"),
        rules.working_days,
        rules.timezone,
      ),
    ).toBe(4);
  });
  it("rejects three full working days", () => {
    expect(
      calculateBookingEligibility(
        new Date("2026-09-10T08:00:00+03:00"),
        new Date("2026-09-16T10:00:00+03:00"),
        rules,
      ).eligible,
    ).toBe(false);
  });
  it("accepts exactly four full working days", () => {
    expect(
      calculateBookingEligibility(
        new Date("2026-09-10T23:59:00+03:00"),
        new Date("2026-09-17T08:00:00+03:00"),
        rules,
      ).eligible,
    ).toBe(true);
  });
  it.each(["2026-09-18", "2026-09-19"])(
    "rejects nonworking shoot %s",
    (date) => {
      expect(
        calculateBookingEligibility(
          new Date("2026-09-01"),
          new Date(`${date}T09:00:00+03:00`),
          rules,
        ).eligible,
      ).toBe(false);
    },
  );
  it("uses business timezone at UTC midnight boundary", () => {
    expect(
      calculateWorkingDays(
        new Date("2026-09-12T22:00:00Z"),
        new Date("2026-09-17T09:00:00Z"),
        rules.working_days,
        rules.timezone,
      ),
    ).toBe(3);
  });
  it("enforces configurable days and contract end", () => {
    expect(
      calculateBookingEligibility(
        new Date("2026-09-01"),
        new Date("2026-09-20T10:00:00+03:00"),
        { ...rules, end_date: "2026-09-19" },
      ).eligible,
    ).toBe(false);
    expect(
      calculateWorkingDays(
        new Date("2026-09-10T08:00:00Z"),
        new Date("2026-09-14T08:00:00Z"),
        [5, 6],
        rules.timezone,
      ),
    ).toBe(2);
  });
});
describe("Cancellation and conflict boundaries", () => {
  const start = new Date("2026-09-20T10:00:00Z");
  const deadline = calculateCancellationDeadline(start, 24);
  it("exactly 24 hours is on time", () =>
    expect(isLateChange(new Date("2026-09-19T10:00:00Z"), deadline)).toBe(
      false,
    ));
  it("more than 24 hours is on time", () =>
    expect(isLateChange(new Date("2026-09-19T09:59:59Z"), deadline)).toBe(
      false,
    ));
  it("less than 24 hours is late", () =>
    expect(isLateChange(new Date("2026-09-19T10:00:00.001Z"), deadline)).toBe(
      true,
    ));
  it("allows adjacent slots but blocks overlap", () => {
    const slots = [
      { start_at: "2026-09-20T10:00:00Z", end_at: "2026-09-20T12:00:00Z" },
    ];
    expect(
      checkCalendarConflict(
        new Date("2026-09-20T12:00:00Z"),
        new Date("2026-09-20T13:00:00Z"),
        slots,
      ),
    ).toBe(false);
    expect(
      checkCalendarConflict(
        new Date("2026-09-20T11:59:00Z"),
        new Date("2026-09-20T13:00:00Z"),
        slots,
      ),
    ).toBe(true);
  });
});
describe("Input and upload safeguards", () => {
  it("rejects client submitted balances", () => {
    expect(bookingSchema.safeParse({ balance_before: 100 }).success).toBe(
      false,
    );
  });
  it("rejects oversized or unsafe files", () => {
    expect(() =>
      validateFile({
        size: 11 * 1024 * 1024,
        type: "application/pdf",
        name: "script.pdf",
      }),
    ).toThrow();
    expect(() =>
      validateFile({ size: 100, type: "image/svg+xml", name: "payload.svg" }),
    ).toThrow();
    expect(() =>
      validateFile({ size: 100, type: "image/png", name: "payload.exe" }),
    ).toThrow();
  });
  it("accepts permitted production documents", () =>
    expect(() =>
      validateFile({ size: 1200, type: "application/pdf", name: "script.pdf" }),
    ).not.toThrow());
});
