"use client";
import { useNow } from "@/lib/use-now";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { Clock3, FileText, History, Upload, AlertCircle } from "lucide-react";
import type { Audit, Booking, PortalData, Json } from "@/types/domain";
import { bookingCommand, loadTimeline } from "@/server/actions";
import { validateFile } from "@/validation/booking";
import { Button } from "./ui/button";
import { Status } from "./calendar";
import { lateWarning } from "@/features/bookings/rules";
export function BookingDetail({
  booking: b,
  data,
  onDone,
}: {
  booking: Booking;
  data: PortalData;
  onDone: () => void;
}) {
  const router = useRouter();
  const now = useNow();
  const admin = data.profile.role !== "client";
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [command, setCommand] = useState("");
  const [reason, setReason] = useState("");
  const [month, setMonth] = useState("");
  const [ack, setAck] = useState(false);
  const [exception, setException] = useState(false);
  const [date, setDate] = useState("");
  const [duration, setDuration] = useState(
    Math.round((+new Date(b.end_at) - +new Date(b.start_at)) / 60000),
  );
  const [location, setLocation] = useState(b.location);
  const [category, setCategory] = useState("script");
  const [timeline, setTimeline] = useState<Audit[]>([]);
  const [timelineError, setTimelineError] = useState("");
  useEffect(() => {
    let active = true;
    loadTimeline(b.id)
      .then((value) => {
        if (active) setTimeline(value);
      })
      .catch((e) => {
        if (active) setTimelineError(e.message);
      });
    return () => {
      active = false;
    };
  }, [b.id]);
  const late =
    b.cancellation_deadline && now > +new Date(b.cancellation_deadline);
  const fmt = (value: string) =>
    formatInTimeZone(value, data.rules.timezone, "dd MMM yyyy · HH:mm");
  const files = data.files.filter((f) => f.booking_id === b.id);
  const bookingNotifications = Object.values(
    data.notifications
      .filter((n) => n.booking_id === b.id)
      .reduce<Record<string, typeof data.notifications>>((groups, notice) => {
        const key = `${notice.event_type}-${notice.created_at.slice(0, 16)}`;
        (groups[key] ||= []).push(notice);
        return groups;
      }, {}),
  )
    .sort((a, b) => b[0].created_at.localeCompare(a[0].created_at))
    .slice(0, 5);
  const contract = data.contracts.find((c) => c.id === b.contract_id);
  const actions: { key: string; label: string }[] = [];
  if (b.status === "Draft")
    actions.push({ key: "submit_draft", label: "Submit for approval" });
  if (b.status === "Pending Approval" && admin)
    actions.push(
      { key: "approve", label: "Approve booking" },
      { key: "reject", label: "Reject request" },
      { key: "suggest", label: "Suggest another time" },
      { key: "edit", label: "Edit details" },
    );
  if (b.status === "Pending Approval" && b.proposed_start)
    actions.push({ key: "accept_suggestion", label: "Accept suggested time" });
  if (["Confirmed", "Urgent Shoot"].includes(b.status)) {
    actions.push({ key: "request_reschedule", label: "Request reschedule" });
    if (admin && +new Date(b.start_at) <= now)
      actions.push(
        { key: "complete", label: "Mark completed" },
        { key: "no_show", label: "Mark no show" },
      );
  }
  if (b.status === "Reschedule Requested" && admin)
    actions.push(
      { key: "approve_reschedule", label: "Approve reschedule" },
      { key: "decline_reschedule", label: "Decline reschedule" },
    );
  if (
    [
      "Draft",
      "Pending Approval",
      "Confirmed",
      "Urgent Shoot",
      "Reschedule Requested",
    ].includes(b.status)
  )
    actions.push({ key: "cancel", label: "Cancel booking" });
  async function execute() {
    setBusy(true);
    setError("");
    const input: Record<string, Json> = {
      reason,
      acknowledged: ack,
      exception,
      duration_minutes: duration,
      location,
    };
    if (month) input.future_month = month;
    if (date)
      input.start_at = fromZonedTime(date, data.rules.timezone).toISOString();
    const result = await bookingCommand(b.id, command, input);
    setBusy(false);
    if (result.error) setError(result.error);
    else {
      router.refresh();
      onDone();
    }
  }
  async function upload(file: File) {
    setError("");
    setBusy(true);
    try {
      validateFile(file);
      if (files.length >= 20) throw new Error("Maximum 20 files per booking");
      const body = new FormData();
      body.set("file", file);
      body.set("booking_id", b.id);
      body.set("category", category);
      const response = await fetch("/api/files", { method: "POST", body });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setNotice("File uploaded securely.");
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="dialog-body booking-detail">
      <div className="row spread">
        <Status value={b.status} />
        <span className="muted">BC–{b.id.slice(0, 8).toUpperCase()}</span>
      </div>
      {b.urgent && (
        <p className="urgent-note">
          Urgent Shoot — Subject to Brill Availability
        </p>
      )}
      <h2>{b.subject}</h2>
      <p className="muted">
        {data.organizations.find((o) => o.id === b.organization_id)?.name} ·{" "}
        {b.shoot_type}
      </p>
      <dl className="details-grid">
        <div>
          <dt>Schedule</dt>
          <dd>
            {fmt(b.start_at)}
            <br />
            {duration} minutes · {data.rules.timezone}
          </dd>
        </div>
        <div>
          <dt>Location</dt>
          <dd>{b.location}</dd>
        </div>
        <div>
          <dt>Production plan</dt>
          <dd>
            {b.expected_reels} contents · Script{" "}
            {b.script_ready ? "ready" : "not ready"}
            <br />
            Content plan {b.content_plan_ready ? "ready" : "not ready"}
          </dd>
        </div>
        <div>
          <dt>Session allocation</dt>
          <dd>
            {b.session_source || "Not reserved"}
            {b.allocation_month && ` · ${b.allocation_month.slice(0, 7)}`}
            <br />
            Contract: {contract?.start_date} — {contract?.end_date}
          </dd>
        </div>
        <div>
          <dt>Team / resource</dt>
          <dd>
            {data.resources.find((r) => r.id === b.resource_id)?.name ||
              "Shared production calendar"}
          </dd>
        </div>
        <div>
          <dt>Cancellation deadline</dt>
          <dd>
            {b.cancellation_deadline
              ? fmt(b.cancellation_deadline)
              : "Calculated on approval"}
          </dd>
        </div>
      </dl>
      <section className="detail-section">
        <h3>Production details</h3>
        <p>{b.topics}</p>
        {b.equipment_requirements && (
          <p>
            <strong>Requirements:</strong> {b.equipment_requirements}
          </p>
        )}
        {b.additional_notes && (
          <p>
            <strong>Notes:</strong> {b.additional_notes}
          </p>
        )}
      </section>
      {b.proposed_start && (
        <div className="callout">
          <Clock3 size={20} />
          <span>
            Proposed schedule: {fmt(b.proposed_start)}
            {b.change_reason && <small>{b.change_reason}</small>}
          </span>
        </div>
      )}
      {late &&
        ["Confirmed", "Urgent Shoot", "Reschedule Requested"].includes(
          b.status,
        ) && (
          <p className="alert">
            <AlertCircle size={18} />
            {lateWarning}
          </p>
        )}
      <section className="detail-section">
        <h3>
          <FileText size={17} /> Production files{" "}
          <span className="count">{files.length}</span>
        </h3>
        {files.length ? (
          files.map((f) => (
            <a className="file-row" href={`/api/files?id=${f.id}`} key={f.id}>
              <FileText size={18} />
              <span>
                {f.file_name}
                <small>
                  {f.category.replace("_", " ")} · {fmt(f.uploaded_at)}
                </small>
              </span>
            </a>
          ))
        ) : (
          <p className="muted">No files uploaded yet.</p>
        )}
        <div className="upload-row">
          <select
            aria-label="File category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            {[
              "script",
              "content_plan",
              "mood_board",
              "reference",
              "supporting",
            ].map((c) => (
              <option key={c} value={c}>
                {c.replaceAll("_", " ")}
              </option>
            ))}
          </select>
          <label className="button button-outline">
            <Upload size={16} /> Upload file
            <input
              className="sr-only"
              type="file"
              disabled={busy}
              accept=".pdf,.jpg,.jpeg,.png,.webp,.txt,.docx,.pptx"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) upload(f);
                e.target.value = "";
              }}
            />
          </label>
        </div>
        <small>
          PDF, JPG, PNG, WebP, TXT, DOCX, PPTX · 10 MB each · Maximum 20 files.
          Files remain private.
        </small>
      </section>
      {actions.length > 0 && (
        <section className="detail-section">
          <h3>Booking actions</h3>
          <div className="action-grid">
            {actions.map((a) => (
              <Button
                key={a.key}
                variant={a.key === command ? "default" : "outline"}
                onClick={() => {
                  setCommand(a.key);
                  setError("");
                }}
              >
                {a.label}
              </Button>
            ))}
          </div>
          {command && (
            <div className="command-form">
              <h4>{actions.find((a) => a.key === command)?.label}</h4>
              <p className="muted">
                Review this action before confirming. All changes are recorded
                in the activity timeline.
              </p>
              {["suggest", "request_reschedule"].includes(command) && (
                <label>
                  New start · {data.rules.timezone}
                  <input
                    type="datetime-local"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    required
                  />
                </label>
              )}
              {["suggest", "request_reschedule", "edit"].includes(command) && (
                <label>
                  Duration (minutes)
                  <input
                    type="number"
                    min={30}
                    max={720}
                    value={duration}
                    onChange={(e) => setDuration(+e.target.value)}
                  />
                </label>
              )}
              {command === "edit" && (
                <label>
                  Location
                  <input
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                  />
                </label>
              )}
              {["approve", "approve_reschedule"].includes(command) && (
                <label>
                  Session allocation
                  <select
                    value={month}
                    onChange={(e) => setMonth(e.target.value)}
                  >
                    <option value="">
                      Current month / eligible carry-forward
                    </option>
                    {data.allocations
                      .filter(
                        (a) =>
                          a.contract_id === b.contract_id &&
                          a.month >
                            (b.proposed_start || b.start_at).slice(0, 7) +
                              "-01" &&
                          a.remaining > 0,
                      )
                      .map((a) => (
                        <option key={a.id} value={a.month}>
                          {a.month.slice(0, 7)} · {a.remaining} remaining
                          (future borrowing)
                        </option>
                      ))}
                  </select>
                </label>
              )}
              <label>
                Reason / approval note
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={2}
                />
              </label>
              {admin &&
                ["cancel", "request_reschedule", "approve_reschedule"].includes(
                  command,
                ) && (
                  <label className="checkbox">
                    <input
                      type="checkbox"
                      checked={exception}
                      onChange={(e) => setException(e.target.checked)}
                    />{" "}
                    Grant policy exception (reason required)
                  </label>
                )}
              {late &&
                ["cancel", "request_reschedule"].includes(command) &&
                !exception && (
                  <label className="checkbox">
                    <input
                      type="checkbox"
                      checked={ack}
                      onChange={(e) => setAck(e.target.checked)}
                    />{" "}
                    I understand that this session will be deducted from my
                    shooting allowance.
                  </label>
                )}
              <Button
                onClick={execute}
                disabled={
                  busy ||
                  (["suggest", "request_reschedule"].includes(command) && !date)
                }
                variant={
                  ["cancel", "reject", "no_show"].includes(command)
                    ? "destructive"
                    : "default"
                }
              >
                {busy ? "Saving…" : "Confirm action"}
              </Button>
            </div>
          )}
        </section>
      )}
      {error && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="inline-success" role="status">
          {notice}
        </p>
      )}
      <section className="detail-section">
        <h3>
          <History size={18} /> Activity timeline
        </h3>
        {timelineError && <p role="alert">{timelineError}</p>}
        <div className="timeline">
          {timeline.map((a) => (
            <div key={a.id}>
              <span className="timeline-dot" />
              <strong>
                {a.action === "booking_files INSERT"
                  ? "File uploaded"
                  : a.action === "booking_files UPDATE"
                    ? "File updated"
                    : a.action === "session_ledger INSERT"
                      ? "Session reserved"
                      : a.action.replaceAll("_", " ")}
              </strong>
              <small>
                {fmt(a.created_at)} ·{" "}
                {data.profiles.find((p) => p.id === a.actor_user_id)?.name ||
                  "System / Brill team"}
              </small>
              {a.old_values &&
                a.new_values &&
                typeof a.old_values === "object" &&
                typeof a.new_values === "object" &&
                "start_at" in a.old_values &&
                "start_at" in a.new_values &&
                a.old_values.start_at !== a.new_values.start_at && (
                  <p>
                    Schedule: {String(a.old_values.start_at)} →{" "}
                    {String(a.new_values.start_at)}
                  </p>
                )}
              {admin &&
                a.metadata &&
                typeof a.metadata === "object" &&
                "reason" in a.metadata && <p>{String(a.metadata.reason)}</p>}
            </div>
          ))}
        </div>
      </section>
      <section className="detail-section">
        <h3>Notifications</h3>
        {bookingNotifications.length ? (
          bookingNotifications.map((group) => {
            const failedCount = group.filter(
              (notice) => notice.status === "failed",
            ).length;
            const channels = [
              ...new Set(group.map((notice) => notice.channel)),
            ].join(", ");
            const notice = group[0];
            return (
              <div className="notification-mini" key={notice.id}>
                <span>
                  {notice.event_type}
                  <small>
                    {channels} · {fmt(notice.created_at)}
                  </small>
                </span>
                <Status
                  value={failedCount ? `${failedCount} failed` : "sent"}
                />
              </div>
            );
          })
        ) : (
          <p className="muted">No notifications for this booking.</p>
        )}
      </section>
    </div>
  );
}
