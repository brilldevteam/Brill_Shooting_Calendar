"use client";
import { useAvailability } from "@/features/calendar/use-availability";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { fromZonedTime, formatInTimeZone } from "date-fns-tz";
import { addDays, format } from "date-fns";
import { ArrowRight, CheckCircle2, Info } from "lucide-react";
import { bookingSchema, type BookingInput } from "@/validation/booking";
import {
  calculateBookingEligibility,
  checkCalendarConflict,
} from "@/features/bookings/rules";
import { createBookingRequest } from "@/server/actions";
import type { PortalData } from "@/types/domain";
import { Button } from "./ui/button";
export function BookingForm({
  data,
  initialDate,
  onSaved,
}: {
  data: PortalData;
  initialDate?: string;
  onSaved: (id: string) => void;
}) {
  const admin = data.profile.role !== "client";
  const [day, setDay] = useState(
    initialDate || format(addDays(new Date(), 8), "yyyy-MM-dd"),
  );
  const [time, setTime] = useState("10:00");
  const [review, setReview] = useState<BookingInput | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [key] = useState(() => crypto.randomUUID());
  const [success, setSuccess] = useState("");
  const [savedDraft, setSavedDraft] = useState(false);
  const first = data.contracts.find((c) => c.status === "active");
  const form = useForm<BookingInput>({
    resolver: zodResolver(bookingSchema),
    mode: "onChange",
    defaultValues: {
      organization_id: first?.organization_id || "",
      contract_id: first?.id || "",
      start_at: fromZonedTime(
        `${day}T${time}`,
        data.rules.timezone,
      ).toISOString(),
      duration_minutes: 120,
      location: "",
      subject: "",
      expected_reels: 4,
      topics: "",
      script_ready: false,
      content_plan_ready: false,
      equipment_requirements: "",
      additional_notes: "",
      shoot_type: "Content shoot",
      resource_id: null,
      urgent: false,
      draft: false,
      idempotency_key: key,
    },
  });
  const watched = useWatch({ control: form.control });
  const contract = data.contracts.find((c) => c.id === watched.contract_id);
  const start = fromZonedTime(`${day}T${time}`, data.rules.timezone);
  const eligibility = calculateBookingEligibility(new Date(), start, {
    ...data.rules,
    lead_time_days: contract?.lead_time_days ?? data.rules.lead_time_days,
    ...(contract && {
      start_date: contract.start_date,
      end_date: contract.end_date,
    }),
  });
  const month = `${day.slice(0, 7)}-01`;
  const allocation = data.allocations.find(
    (a) => a.contract_id === contract?.id && a.month === month,
  );
  const remaining =
    (allocation?.remaining || 0) + (allocation?.carry_forward_received || 0);
  const rangeDay = day || format(new Date(), "yyyy-MM-dd");
  const availability = useAvailability(
    data.busy,
    fromZonedTime(`${rangeDay}T00:00:00`, data.rules.timezone).toISOString(),
    fromZonedTime(
      `${format(addDays(new Date(`${rangeDay}T12:00:00`), 1), "yyyy-MM-dd")}T00:00:00`,
      data.rules.timezone,
    ).toISOString(),
    data.preview,
  );
  const slots = availability.slots.filter(
    (b) =>
      !watched.resource_id ||
      !b.resource_id ||
      b.resource_id === watched.resource_id,
  );
  const conflict = checkCalendarConflict(
    start,
    new Date(+start + Number(watched.duration_minutes) * 60000),
    slots,
  );
  const minutes = Number(time.split(":")[0]) * 60 + Number(time.split(":")[1]);
  const outsideHours =
    !watched.urgent &&
    minutes + Number(watched.duration_minutes) > data.rules.day_end * 60;
  const setSchedule = (newDay: string, newTime: string) => {
    setDay(newDay);
    setTime(newTime);
    if (newDay && newTime) {
      const value = fromZonedTime(`${newDay}T${newTime}`, data.rules.timezone);
      if (!isNaN(+value))
        form.setValue("start_at", value.toISOString(), {
          shouldValidate: true,
        });
    }
  };
  const field = (
    name: keyof BookingInput,
    label: string,
    props: React.InputHTMLAttributes<HTMLInputElement> = {},
  ) => (
    <label>
      {label}
      <input {...form.register(name)} {...props} />
      {form.formState.errors[name] && (
        <span className="field-error" role="alert">
          {form.formState.errors[name]?.message}
        </span>
      )}
    </label>
  );
  async function save(draft = false) {
    if (!review) return;
    setSaving(true);
    setSavedDraft(draft);
    setError("");
    const result = await createBookingRequest({ ...review, draft });
    setSaving(false);
    if (result.error) setError(result.error);
    else if (result.id) {
      setSuccess(result.id);
    }
  }
  if (success)
    return (
      <div className="success-state">
        <CheckCircle2 size={42} />
        <h2>{savedDraft ? "Draft saved" : "Request received"}</h2>
        <p>
          {savedDraft
            ? "Your draft is saved. Submit it from booking details when ready."
            : "Your shoot is pending Brill Admin approval. A submitted request is not a confirmed booking."}
        </p>
        <Button onClick={() => onSaved(success)}>Open booking</Button>
      </div>
    );
  return (
    <div className="dialog-body">
      {error && (
        <p role="alert" className="alert">
          {error}
        </p>
      )}
      {review ? (
        <>
          <div className="callout">
            <Info size={20} />
            Review your request before submitting. Brill Admin will confirm
            availability and session allocation.
          </div>
          <dl className="details-grid">
            <div>
              <dt>Preferred schedule</dt>
              <dd>
                {formatInTimeZone(
                  review.start_at,
                  data.rules.timezone,
                  "EEEE, dd MMM yyyy · HH:mm",
                )}
              </dd>
            </div>
            <div>
              <dt>Duration</dt>
              <dd>{review.duration_minutes} minutes</dd>
            </div>
            <div>
              <dt>Location</dt>
              <dd>{review.location}</dd>
            </div>
            <div>
              <dt>Doctor / subject</dt>
              <dd>{review.subject}</dd>
            </div>
            <div>
              <dt>Expected contents</dt>
              <dd>{review.expected_reels}</dd>
            </div>
            <div>
              <dt>Session impact</dt>
              <dd>
                1 session on approval
                {remaining < 1
                  ? " · Future month requires admin selection"
                  : ""}
              </dd>
            </div>
            <div>
              <dt>Topics</dt>
              <dd>{review.topics}</dd>
            </div>
          </dl>
          <p className="policy">
            Cancellation or rescheduling within{" "}
            {contract?.cancellation_window_hours ??
              data.rules.cancellation_window_hours}{" "}
            hours of the confirmed shoot counts as a used session.
          </p>
          <div className="dialog-actions">
            <Button
              variant="outline"
              onClick={() => setReview(null)}
              disabled={saving}
            >
              Back to edit
            </Button>
            <Button
              variant="outline"
              onClick={() => save(true)}
              disabled={saving}
            >
              Save draft
            </Button>
            <Button onClick={() => save()} disabled={saving}>
              {saving ? "Submitting…" : "Submit request"}
              <ArrowRight size={16} />
            </Button>
          </div>
        </>
      ) : (
        <form
          onSubmit={form.handleSubmit((values) => {
            setError("");
            if (
              (!eligibility.eligible && !values.urgent) ||
              conflict ||
              outsideHours ||
              availability.loading ||
              availability.error
            ) {
              setError(
                availability.error ||
                  (outsideHours
                    ? "The shoot must finish within production hours."
                    : conflict
                      ? "This time is unavailable."
                      : eligibility.reason || "Choose an eligible date"),
              );
              return;
            }
            setReview(values);
          })}
        >
          <div className="form-section">
            <span className="eyebrow">01 / FIND YOUR SLOT</span>
            <div className="form-grid">
              <label>
                Client contract
                <select
                  {...form.register("contract_id")}
                  onChange={(e) => {
                    form.setValue("contract_id", e.target.value);
                    const c = data.contracts.find(
                      (c) => c.id === e.target.value,
                    );
                    if (c) form.setValue("organization_id", c.organization_id);
                  }}
                >
                  {!first && <option value="">No active contracts</option>}
                  {data.contracts
                    .filter((c) => c.status === "active")
                    .map((c) => (
                      <option value={c.id} key={c.id}>
                        {
                          data.organizations.find(
                            (o) => o.id === c.organization_id,
                          )?.name
                        }{" "}
                        · {c.start_date} to {c.end_date}
                      </option>
                    ))}
                </select>
              </label>
              {admin && (
                <label>
                  Team / resource
                  <select
                    {...form.register("resource_id", {
                      setValueAs: (v) => v || null,
                    })}
                  >
                    <option value="">Assign later</option>
                    {data.resources
                      .filter((r) => r.active)
                      .map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                  </select>
                </label>
              )}
              <label>
                Preferred date
                <input
                  type="date"
                  value={day}
                  min={format(new Date(), "yyyy-MM-dd")}
                  onChange={(e) => setSchedule(e.target.value, time)}
                  required
                />
              </label>
              <label>
                Start time · {data.rules.timezone}
                <select
                  value={time}
                  onChange={(e) => setSchedule(day, e.target.value)}
                >
                  {Array.from(
                    { length: (data.rules.day_end - data.rules.day_start) * 2 },
                    (_, i) => {
                      const t = `${String(data.rules.day_start + Math.floor(i / 2)).padStart(2, "0")}:${i % 2 ? "30" : "00"}`;
                      const s = fromZonedTime(
                        `${day}T${t}`,
                        data.rules.timezone,
                      );
                      const busy =
                        checkCalendarConflict(
                          s,
                          new Date(
                            +s + Number(watched.duration_minutes) * 60000,
                          ),
                          slots,
                        ) ||
                        (!watched.urgent &&
                          data.rules.day_start * 60 +
                            i * 30 +
                            Number(watched.duration_minutes) >
                            data.rules.day_end * 60);
                      return (
                        <option key={t} disabled={busy} value={t}>
                          {t}
                          {busy ? " — Unavailable" : ""}
                        </option>
                      );
                    },
                  )}
                </select>
              </label>
              <label>
                Expected duration
                <select
                  {...form.register("duration_minutes", {
                    valueAsNumber: true,
                  })}
                >
                  {[30, 60, 90, 120, 180, 240, 360, 480, 600, 720].map((n) => (
                    <option key={n} value={n}>
                      {n < 60 ? `${n} minutes` : `${n / 60} hours`}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Shoot type
                <select {...form.register("shoot_type")}>
                  <option>Content shoot</option>
                  <option>Product shoot</option>
                  <option>Interview</option>
                  <option>Campaign</option>
                  <option>Event</option>
                </select>
              </label>
            </div>
            {admin && (
              <label className="checkbox">
                <input type="checkbox" {...form.register("urgent")} /> Urgent
                Shoot — Subject to Brill Availability
              </label>
            )}
            <p
              className={
                eligibility.eligible && !conflict ? "inline-success" : "callout"
              }
            >
              {availability.error ||
                (availability.loading
                  ? "Checking availability?"
                  : outsideHours
                    ? "The shoot must finish within production hours."
                    : conflict
                      ? "This slot is unavailable."
                      : watched.urgent
                        ? "Urgent request: admin approval and resource availability required."
                        : eligibility.eligible
                          ? `${eligibility.workingDays} full working days in advance · Eligible for standard booking`
                          : `${eligibility.reason}. Working days: ${data.rules.working_days.map((d) => ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][d]).join(", ")}. For urgent shooting requirements, contact Brill Creations directly.`)}
            </p>
            <p className="allowance-preview">
              {remaining > 0
                ? `${remaining} session${remaining === 1 ? "" : "s"} available this month. Approval reserves 1 session.`
                : "Current month exhausted. Future usage must be allowed by your contract; Brill Admin chooses the deduction month."}
            </p>
          </div>
          <div className="form-section">
            <span className="eyebrow">02 / PRODUCTION DETAILS</span>
            <div className="form-grid">
              {field("location", "Location", {
                placeholder: "Branch, studio or address",
                required: true,
              })}
              {field("subject", "Doctor / spokesperson / subject", {
                required: true,
              })}
              {field("expected_reels", "Expected reels / contents", {
                type: "number",
                min: 1,
                max: 500,
                required: true,
              })}
              <div className="readiness">
                <label className="checkbox">
                  <input type="checkbox" {...form.register("script_ready")} />{" "}
                  Script ready
                </label>
                <label className="checkbox">
                  <input
                    type="checkbox"
                    {...form.register("content_plan_ready")}
                  />{" "}
                  Content plan ready
                </label>
              </div>
            </div>
            <label>
              Shoot purpose / topics
              <textarea {...form.register("topics")} rows={3} required />
              {form.formState.errors.topics && (
                <span className="field-error">
                  {form.formState.errors.topics.message}
                </span>
              )}
            </label>
            <label>
              Special equipment / requirements
              <textarea {...form.register("equipment_requirements")} rows={2} />
            </label>
            <label>
              Additional notes
              <textarea {...form.register("additional_notes")} rows={2} />
            </label>
            <small>
              Upload scripts, content plans, mood boards and references in
              booking details after saving. PDF, JPG, PNG, WebP, TXT, DOCX, PPTX
              · 10 MB each · 20 files per booking.
            </small>
          </div>
          <p className="policy">
            Requests stay Pending Approval until Brill confirms. Changes within{" "}
            {contract?.cancellation_window_hours ??
              data.rules.cancellation_window_hours}{" "}
            hours of a confirmed shoot count as a used session.
          </p>
          <div className="dialog-actions">
            <Button
              type="submit"
              disabled={
                !first ||
                conflict ||
                outsideHours ||
                availability.loading ||
                Boolean(availability.error) ||
                (!eligibility.eligible && !watched.urgent)
              }
            >
              Review request <ArrowRight size={16} />
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
