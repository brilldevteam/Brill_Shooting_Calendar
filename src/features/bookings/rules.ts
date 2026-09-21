import { addDays, differenceInCalendarDays, startOfDay } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import type { Rules } from "@/types/domain";
export const leadTimeMessage =
  "This date is not available for standard booking. Shooting sessions must be requested at least 4 Brill Creations working days in advance. Brill working days are Sunday to Thursday. For urgent shooting requirements, please contact Brill Creations directly.";
export const lateWarning =
  "This booking is now within the cancellation period. Cancelling or rescheduling this session will result in the session being counted as used and deducted from your shooting allowance.";
export function calculateWorkingDays(
  requestDate: Date,
  shootDate: Date,
  workingDays: number[],
  timezone: string,
) {
  const request = startOfDay(toZonedTime(requestDate, timezone));
  const shoot = startOfDay(toZonedTime(shootDate, timezone));
  const span = differenceInCalendarDays(shoot, request);
  let count = 0;
  for (let i = 1; i < span; i++)
    if (workingDays.includes(addDays(request, i).getDay())) count++;
  return count;
}
export function calculateBookingEligibility(
  requestDate: Date,
  shootDate: Date,
  settings: Pick<Rules, "working_days" | "timezone" | "lead_time_days"> & {
    start_date?: string;
    end_date?: string;
  },
) {
  const days = calculateWorkingDays(
    requestDate,
    shootDate,
    settings.working_days,
    settings.timezone,
  );
  const day = toZonedTime(shootDate, settings.timezone);
  const contractStart = settings.start_date
    ? new Date(`${settings.start_date}T00:00:00`)
    : null;
  const contractEnd = settings.end_date
    ? new Date(`${settings.end_date}T23:59:59`)
    : null;
  const inContract =
    (!contractStart || day >= contractStart) &&
    (!contractEnd || day <= contractEnd);
  const working = settings.working_days.includes(day.getDay());
  return {
    eligible:
      shootDate > requestDate &&
      days >= settings.lead_time_days &&
      working &&
      inContract,
    workingDays: days,
    reason: !inContract
      ? "Outside contract dates"
      : !working
        ? "Non-working day"
        : days < settings.lead_time_days
          ? `Requires ${settings.lead_time_days} full Brill working days in advance`
          : null,
  };
}
export function calculateCancellationDeadline(start: Date, hours: number) {
  return new Date(start.getTime() - hours * 3_600_000);
}
export function isLateChange(now: Date, deadline: Date) {
  return now > deadline;
}
export function checkCalendarConflict(
  start: Date,
  end: Date,
  slots: { start_at: string; end_at: string }[],
) {
  return slots.some(
    (slot) => start < new Date(slot.end_at) && end > new Date(slot.start_at),
  );
}
