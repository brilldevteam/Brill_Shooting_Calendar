"use client";
import { useAvailability } from "@/features/calendar/use-availability";
import { useState } from "react";
import {
  addDays,
  addMonths,
  addWeeks,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  format,
  isSameDay,
  isSameMonth,
} from "date-fns";
import { fromZonedTime, toZonedTime, formatInTimeZone } from "date-fns-tz";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { Button } from "./ui/button";
import { calculateBookingEligibility } from "@/features/bookings/rules";
import type { Booking, PortalData } from "@/types/domain";
export function Status({ value }: { value: string }) {
  const tone = ["Confirmed", "Completed"].includes(value)
    ? "green"
    : ["Pending Approval", "Reschedule Requested"].includes(value)
      ? "amber"
      : value === "Urgent Shoot"
        ? "purple"
        : ["Rejected", "Late Cancellation", "No Show"].includes(value)
          ? "red"
          : "gray";
  return (
    <span className={`status ${tone}`}>
      <span />
      {value}
    </span>
  );
}
export function Calendar({
  data,
  onOpen,
  onCreate,
}: {
  data: PortalData;
  onOpen: (b: Booking) => void;
  onCreate: (date?: string) => void;
}) {
  const [date, setDate] = useState(new Date());
  const [view, setView] = useState<"Month" | "Week" | "Day">("Month");
  const [client, setClient] = useState("");
  const [status, setStatus] = useState("");
  const [resource, setResource] = useState("");
  const [type, setType] = useState("");
  const admin = data.profile.role !== "client";
  const zone = data.rules.timezone;
  const start =
    view === "Month"
      ? startOfWeek(startOfMonth(date), { weekStartsOn: 0 })
      : view === "Week"
        ? startOfWeek(date, { weekStartsOn: 0 })
        : date;
  const end =
    view === "Month"
      ? endOfWeek(endOfMonth(date), { weekStartsOn: 0 })
      : view === "Week"
        ? endOfWeek(date, { weekStartsOn: 0 })
        : date;
  const days = eachDayOfInterval({ start, end });
  const availability = useAvailability(
    data.busy,
    fromZonedTime(start, zone).toISOString(),
    fromZonedTime(addDays(end, 1), zone).toISOString(),
    data.preview,
  );
  const bookings = data.bookings.filter(
    (b) =>
      (!client || b.organization_id === client) &&
      (!status || b.status === status) &&
      (!resource || b.resource_id === resource) &&
      (!type || b.shoot_type === type),
  );
  function move(direction: number) {
    setDate(
      view === "Month"
        ? addMonths(date, direction)
        : view === "Week"
          ? addWeeks(date, direction)
          : addDays(date, direction),
    );
  }
  return (
    <section className="panel calendar-panel">
      <div className="calendar-toolbar">
        <div className="row">
          <h2>{format(date, "MMMM yyyy")}</h2>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Previous period"
            onClick={() => move(-1)}
          >
            <ChevronLeft size={18} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Next period"
            onClick={() => move(1)}
          >
            <ChevronRight size={18} />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setDate(new Date())}
          >
            Today
          </Button>
        </div>
        <div className="segmented" aria-label="Calendar view">
          {(["Month", "Week", "Day"] as const).map((v) => (
            <button
              key={v}
              aria-pressed={v === view}
              className={v === view ? "active" : ""}
              onClick={() => setView(v)}
            >
              {v}
            </button>
          ))}
        </div>
      </div>
      <div className="calendar-filters">
        {admin && (
          <select
            aria-label="Filter client"
            value={client}
            onChange={(e) => setClient(e.target.value)}
          >
            <option value="">All clients</option>
            {data.organizations.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        )}
        <select
          aria-label="Filter status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">All statuses</option>
          {Array.from(new Set(data.bookings.map((b) => b.status))).map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <select
          aria-label="Filter resource"
          value={resource}
          onChange={(e) => setResource(e.target.value)}
        >
          <option value="">All teams & resources</option>
          {data.resources.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter shoot type"
          value={type}
          onChange={(e) => setType(e.target.value)}
        >
          <option value="">All shoot types</option>
          {Array.from(new Set(data.bookings.map((b) => b.shoot_type))).map(
            (t) => (
              <option key={t}>{t}</option>
            ),
          )}
        </select>
        <span className="muted timezone">{zone}</span>
      </div>
      {availability.error && (
        <p role="alert" className="alert">
          {availability.error}
        </p>
      )}
      {availability.loading && (
        <p className="callout">Checking availability?</p>
      )}
      <div
        className={`calendar-grid view-${view.toLowerCase()}`}
        style={{
          gridTemplateColumns: `repeat(${view === "Day" ? 1 : 7},minmax(0,1fr))`,
        }}
      >
        {view !== "Day" &&
          ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"].map((d) => (
            <div className="day-label" key={d}>
              {d}
            </div>
          ))}
        {days.map((day) => {
          const zoned = fromZonedTime(
            `${format(day, "yyyy-MM-dd")}T12:00:00`,
            zone,
          );
          const contract = data.contracts.find(
            (c) =>
              c.status === "active" &&
              format(day, "yyyy-MM-dd") >= c.start_date &&
              format(day, "yyyy-MM-dd") <= c.end_date,
          );
          const eligibility = calculateBookingEligibility(new Date(), zoned, {
            ...data.rules,
            lead_time_days:
              contract?.lead_time_days ?? data.rules.lead_time_days,
            ...(contract && {
              start_date: contract.start_date,
              end_date: contract.end_date,
            }),
          });
          const disabled =
            availability.loading ||
            Boolean(availability.error) ||
            (!admin && (!eligibility.eligible || !contract));
          const dayBookings = bookings.filter((b) =>
            isSameDay(toZonedTime(b.start_at, zone), day),
          );
          const busy = availability.slots.filter(
            (s) =>
              isSameDay(toZonedTime(s.start_at, zone), day) &&
              (!resource || s.resource_id === resource || !s.resource_id) &&
              !data.bookings.some(
                (b) =>
                  b.start_at === s.start_at &&
                  b.end_at === s.end_at &&
                  ([
                    "Confirmed",
                    "Urgent Shoot",
                    "Reschedule Requested",
                  ].includes(b.status) ||
                    (b.status === "Pending Approval" &&
                      data.rules.pending_blocks)),
              ),
          );
          const blocks = data.blocks.filter((b) =>
            isSameDay(toZonedTime(b.start_at, zone), day),
          );
          return (
            <div
              key={day.toISOString()}
              className={`calendar-day ${!isSameMonth(day, date) ? "outside" : ""} ${disabled ? "restricted" : ""} ${view !== "Month" ? "expanded-day" : ""}`}
            >
              <div className="day-top">
                <span className={isSameDay(day, new Date()) ? "today" : ""}>
                  {view === "Day" ? format(day, "EEEE, d") : format(day, "d")}
                </span>
                <button
                  aria-label={`Request shoot on ${format(day, "yyyy-MM-dd")}`}
                  disabled={disabled}
                  title={
                    disabled
                      ? eligibility.reason || "No active contract"
                      : "Request a shoot"
                  }
                  onClick={() => onCreate(format(day, "yyyy-MM-dd"))}
                >
                  <Plus size={14} />
                </button>
              </div>
              {disabled && dayBookings.length === 0 && (
                <span className="restricted-label">
                  {eligibility.reason || "No contract"}
                </span>
              )}
              {dayBookings.map((b) => (
                <button
                  key={b.id}
                  onClick={() => onOpen(b)}
                  className={`calendar-event event-${b.status.replaceAll(" ", "-").toLowerCase()}`}
                >
                  <span>
                    {formatInTimeZone(b.start_at, zone, "HH:mm")} ·{" "}
                    {Math.round(
                      (+new Date(b.end_at) - +new Date(b.start_at)) / 60000,
                    )}
                    m
                  </span>
                  <strong>
                    {admin
                      ? data.organizations.find(
                          (o) => o.id === b.organization_id,
                        )?.name
                      : b.subject}
                  </strong>
                  <small>
                    {b.status}
                    {view !== "Month" ? ` · ${b.location}` : ""}
                  </small>
                </button>
              ))}
              {admin
                ? blocks.map((b) => (
                    <div className="calendar-busy" key={b.id}>
                      {b.block_type}
                      <small>{b.reason}</small>
                    </div>
                  ))
                : busy.map((s, i) => (
                    <div className="calendar-busy" key={i}>
                      {formatInTimeZone(s.start_at, zone, "HH:mm")} ·
                      Unavailable
                    </div>
                  ))}
            </div>
          );
        })}
      </div>
      <div className="calendar-legend">
        <span>
          <i className="dot green-dot" /> Confirmed
        </span>
        <span>
          <i className="dot amber-dot" /> Pending approval
        </span>
        <span>
          <i className="dot purple-dot" /> Urgent shoot
        </span>
        <span>
          <i className="dot gray-dot" /> Unavailable
        </span>
        <span className="muted">Pending requests require Brill approval.</span>
      </div>
    </section>
  );
}
