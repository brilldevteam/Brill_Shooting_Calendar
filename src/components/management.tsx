"use client";
import { useState } from "react";
import { fromZonedTime } from "date-fns-tz";
import { manageRecord, inviteUser, resetUserPassword } from "@/server/actions";
import type { Json, PortalData } from "@/types/domain";
import { Button } from "./ui/button";
type Field = {
  key: string;
  label: string;
  type?: string;
  options?: { value: string; label: string }[];
  value?: string;
  required?: boolean;
  hint?: string;
};
export function ManagementForm({
  kind,
  data,
  onDone,
  initial = {},
}: {
  kind: string;
  data: PortalData;
  onDone: () => void;
  initial?: Record<string, Json>;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [password, setPassword] = useState("");
  const [allowFuture, setAllowFuture] = useState(
    Boolean(initial.allow_future_usage),
  );
  const [allowCarry, setAllowCarry] = useState(
    Boolean(initial.allow_carry_forward),
  );
  const orgs = data.organizations.map((o) => ({ value: o.id, label: o.name }));
  const contracts = data.contracts.map((c) => ({
    value: c.id,
    label: `${data.organizations.find((o) => o.id === c.organization_id)?.name} · ${c.start_date}`,
  }));
  const options = (values: string[]) =>
    values.map((v) => ({ value: v, label: v.replaceAll("_", " ") }));
  let fields: Field[] = [];
  if (kind === "organization")
    fields = [
      { key: "name", label: "Client organization name", required: true },
    ];
  if (kind === "contract" || kind === "contract_policy")
    fields = [
      { key: "organization_id", label: "Client organization", options: orgs },
      {
        key: "start_date",
        label: "Contract start",
        type: "date",
        required: true,
      },
      { key: "end_date", label: "Contract end", type: "date", required: true },
      {
        key: "monthly_allowance",
        label: "Sessions allowed each month",
        type: "number",
        value: "4",
        required: true,
        hint: "How many shoots this client can use in one month.",
      },
      {
        key: "total_entitlement",
        label: "Total sessions for this contract",
        type: "number",
        required: true,
        hint: "Example: for one month with 4 sessions, enter 4.",
      },
      {
        key: "lead_time_days",
        label: "Working days needed before a shoot",
        type: "number",
        hint: `Optional. Leave blank to use the normal ${data.rules.lead_time_days}-day rule.`,
      },
      {
        key: "cancellation_window_hours",
        label: "Cancellation notice in hours",
        type: "number",
        hint: `Optional. Leave blank to use the normal ${data.rules.cancellation_window_hours}-hour rule.`,
      },
      {
        key: "allow_future_usage",
        label: "Allow using sessions from a future month",
        type: "checkbox",
        hint: "Use this only if the client may book after this month's sessions are finished.",
      },
      {
        key: "advance_policy",
        label: "How future sessions are limited",
        options: [
          { value: "numeric", label: "Set a maximum number" },
          { value: "unlimited", label: "No limit" },
          { value: "approval", label: "Require approval each time" },
        ],
        hint: "This matters only when future-month sessions are allowed.",
      },
      {
        key: "max_advance_sessions",
        label: "Maximum future sessions",
        type: "number",
        value: "2",
        hint: "This matters only when you choose “Set a maximum number”.",
      },
      {
        key: "allow_carry_forward",
        label: "Move unused sessions to the next month",
        type: "checkbox",
        hint: "If enabled, unused sessions can remain available after the month ends.",
      },
      {
        key: "carry_forward_expiry_months",
        label: "Unused sessions expire after this many months",
        type: "number",
        value: "1",
        hint: "This matters only when unused sessions can move to the next month.",
      },
    ];
  if (kind === "contract_policy")
    fields = fields
      .filter(
        (f) =>
          ![
            "organization_id",
            "start_date",
            "end_date",
            "monthly_allowance",
            "total_entitlement",
          ].includes(f.key),
      )
      .concat({
        key: "status",
        label: "Contract status",
        options: options(["active", "inactive"]),
      });
  if (kind === "profile" || kind === "invite")
    fields = [
      ...(kind === "profile"
        ? [{ key: "id", label: "Auth user ID", required: true }]
        : []),
      { key: "name", label: "Full name", required: true },
      { key: "email", label: "Email", type: "email", required: true },
      { key: "phone", label: "WhatsApp phone (international format)" },
      {
        key: "role",
        label: "Role",
        options: options(["client", "admin", "super_admin"]),
      },
      {
        key: "organization_id",
        label: "Client organization",
        options: [{ value: "", label: "None (admin only)" }, ...orgs],
      },
      ...(kind === "profile"
        ? [
            {
              key: "status",
              label: "Status",
              options: options(["active", "inactive"]),
            },
          ]
        : []),
    ];
  if (kind === "block")
    fields = [
      {
        key: "start_at",
        label: `Start · ${data.rules.timezone}`,
        type: "datetime-local",
        required: true,
      },
      {
        key: "end_at",
        label: `End · ${data.rules.timezone}`,
        type: "datetime-local",
        required: true,
      },
      {
        key: "block_type",
        label: "Block type",
        options: options([
          "Holiday",
          "Internal production",
          "Equipment unavailable",
          "Team unavailable",
          "Unavailable",
        ]),
      },
      {
        key: "resource_id",
        label: "Affected resource",
        options: [
          { value: "", label: "All resources / full studio" },
          ...data.resources.map((r) => ({ value: r.id, label: r.name })),
        ],
      },
      { key: "reason", label: "Reason", required: true },
      { key: "notes", label: "Internal notes", type: "textarea" },
    ];
  if (kind === "resource")
    fields = [
      { key: "name", label: "Resource name", required: true },
      {
        key: "kind",
        label: "Resource type",
        options: options(["crew", "photographer", "equipment", "studio"]),
      },
    ];
  if (kind === "carry")
    fields = [
      { key: "contract_id", label: "Contract", options: contracts },
      {
        key: "source_month",
        label: "Closed source month",
        type: "month",
        required: true,
      },
    ];
  if (kind === "adjustment")
    fields = [
      { key: "contract_id", label: "Contract", options: contracts },
      {
        key: "month",
        label: "Allocation month",
        type: "month",
        required: true,
      },
      {
        key: "quantity",
        label: "Adjustment (+ restores / − consumes)",
        type: "number",
        required: true,
      },
      { key: "reason", label: "Reason", type: "textarea", required: true },
    ];
  if (kind === "extend_contract")
    fields = [
      { key: "id", label: "Contract", options: contracts },
      {
        key: "end_date",
        label: "Extended end date",
        type: "date",
        required: true,
      },
      {
        key: "reason",
        label: "Extension reason",
        type: "textarea",
        required: true,
      },
    ];
  if (kind === "template")
    fields = [
      {
        key: "event_type",
        label: "Event",
        options: options([
          "New booking request",
          "Booking approved",
          "Booking rejected",
          "Alternative time suggested",
          "Reschedule requested",
          "Reschedule declined",
          "Cancellation",
          "Late cancellation",
          "Urgent booking",
          "Booking completed",
          "No show",
          "Admin exception",
          "Booking edited",
        ]),
      },
      {
        key: "channel",
        label: "Channel",
        options: options(["email", "whatsapp"]),
      },
      { key: "subject", label: "Subject", required: true },
      { key: "body", label: "Message body", type: "textarea", required: true },
      {
        key: "enabled",
        label: "Use this customized template (otherwise use default)",
        type: "checkbox",
      },
    ];
  if (kind === "shooting_log")
    fields = [
      { key: "actual_start", label: "Actual start", type: "datetime-local" },
      { key: "actual_end", label: "Actual end", type: "datetime-local" },
      {
        key: "production_notes",
        label: "Production details",
        type: "textarea",
      },
      {
        key: "post_shoot_confirmed",
        label: "Post-shoot confirmation received",
        type: "checkbox",
      },
    ];
  async function submit(form: FormData) {
    setBusy(true);
    setError("");
    const input: Record<string, Json> = { ...initial };
    for (const field of fields) {
      const value = String(form.get(field.key) || "");
      input[field.key] =
        field.type === "checkbox"
          ? form.has(field.key)
          : field.type === "number"
            ? value === ""
              ? null
              : Number(value)
            : field.type === "datetime-local"
              ? value
                ? fromZonedTime(value, data.rules.timezone).toISOString()
                : null
              : field.type === "month"
                ? `${value}-01`
                : value || null;
    }
    const result =
      kind === "reset_password"
        ? await resetUserPassword(String(initial.id))
        : kind === "invite"
          ? await inviteUser(
              input as unknown as Parameters<typeof inviteUser>[0],
            )
          : await manageRecord(kind, input);
    setBusy(false);
    if (result.error) setError(result.error);
    else {
      if ("password" in result && typeof result.password === "string")
        setPassword(result.password);
      else onDone();
    }
  }
  if (password)
    return (
      <div className="dialog-body">
        <h3>Temporary sign-in password</h3>
        <p>
          Share this privately with the user. They must choose a new password on
          first sign-in. It will not be shown again after closing this dialog.
        </p>
        <label>
          Temporary password
          <input readOnly value={password} onFocus={(e) => e.target.select()} />
        </label>
        <Button onClick={onDone}>Done</Button>
      </div>
    );
  const contractForm = kind === "contract" || kind === "contract_policy";
  const contractOptionKeys = new Set([
    "allow_future_usage",
    "advance_policy",
    "max_advance_sessions",
    "allow_carry_forward",
    "carry_forward_expiry_months",
  ]);
  const renderField = (f: Field) => (
    <label key={f.key} className={f.type === "textarea" ? "span-2" : ""}>
      {f.label}
      {f.options ? (
        <select
          name={f.key}
          defaultValue={String(
            initial[f.key] ?? f.value ?? f.options[0]?.value ?? "",
          )}
        >
          {f.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ) : f.type === "textarea" ? (
        <textarea
          name={f.key}
          rows={5}
          defaultValue={String(initial[f.key] ?? "")}
          required={f.required}
        />
      ) : (
        <input
          name={f.key}
          type={f.type || "text"}
          defaultValue={String(initial[f.key] ?? f.value ?? "")}
          required={f.required}
        />
      )}
      {f.hint && <small className="field-hint">{f.hint}</small>}
    </label>
  );
  return (
    <form action={submit} className="dialog-body">
      <div className="form-grid">
        {fields
          .filter((f) => !contractForm || !contractOptionKeys.has(f.key))
          .map((f) =>
            f.type === "checkbox" ? (
              <label key={f.key} className="checkbox">
                <input
                  type="checkbox"
                  name={f.key}
                  defaultChecked={Boolean(initial[f.key])}
                />
                {f.label}
                {f.hint && <small className="field-hint">{f.hint}</small>}
              </label>
            ) : (
              renderField(f)
            ),
          )}
      </div>
      {contractForm && (
        <section className="contract-options">
          <div className="contract-options-heading">
            <h3>Optional session rules</h3>
            <p>Turn these on only when this client needs them.</p>
          </div>
          <div className="contract-toggle-grid">
            <div className={`contract-toggle ${allowFuture ? "enabled" : ""}`}>
              <label className="checkbox contract-toggle-title">
                <input
                  type="checkbox"
                  name="allow_future_usage"
                  checked={allowFuture}
                  onChange={(event) => setAllowFuture(event.target.checked)}
                />
                Use sessions from a future month
              </label>
              <p>
                Use this when the client finishes this month&apos;s sessions early.
              </p>
              {allowFuture && (
                <div className="contract-toggle-fields">
                  {renderField(fields.find((f) => f.key === "advance_policy")!)}
                  {renderField(
                    fields.find((f) => f.key === "max_advance_sessions")!,
                  )}
                </div>
              )}
            </div>
            <div className={`contract-toggle ${allowCarry ? "enabled" : ""}`}>
              <label className="checkbox contract-toggle-title">
                <input
                  type="checkbox"
                  name="allow_carry_forward"
                  checked={allowCarry}
                  onChange={(event) => setAllowCarry(event.target.checked)}
                />
                Keep unused sessions for later
              </label>
              <p>
                Move unused sessions into the next month instead of losing them.
              </p>
              {allowCarry && (
                <div className="contract-toggle-fields single">
                  {renderField(
                    fields.find(
                      (f) => f.key === "carry_forward_expiry_months",
                    )!,
                  )}
                </div>
              )}
            </div>
          </div>
        </section>
      )}
      {kind === "carry" && (
        <p className="policy">
          Transfers the unused amount from a closed month into a separately
          tracked carry-forward record. Original allocations are preserved.
        </p>
      )}
      {kind === "template" && (
        <p className="policy">
          Variables:{" "}
          {
            "{{client}}, {{start}}, {{duration}}, {{location}}, {{subject}}, {{script}}, {{status}}, {{cancellation_deadline}}, {{cancellation_hours}}, {{link}}"
          }
          . System notifications and approval email are mandatory.
        </p>
      )}
      {kind === "invite" && (
        <p className="policy">
          A temporary password will be shown once. Share it privately with the
          user. Client users must belong to an organization.
        </p>
      )}
      {kind === "reset_password" && (
        <p className="policy">
          Reset this user’s password and revoke all their current sessions? A
          new temporary password will be shown once.
        </p>
      )}
      {error && (
        <p role="alert" className="alert">
          {error}
        </p>
      )}
      <div className="dialog-actions">
        <Button type="submit" disabled={busy}>
          {busy
            ? "Saving…"
            : kind === "invite"
              ? "Create user"
              : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
export function Settings({ data }: { data: PortalData }) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const r = data.rules;
  const superAdmin = data.profile.role === "super_admin";
  async function save(form: FormData) {
    setBusy(true);
    const rules = {
      timezone: String(form.get("timezone")),
      working_days: form.getAll("working_days").map(Number),
      lead_time_days: Number(form.get("lead_time_days")),
      cancellation_window_hours: Number(form.get("cancellation_window_hours")),
      pending_blocks: form.has("pending_blocks"),
      day_start: Number(form.get("day_start")),
      day_end: Number(form.get("day_end")),
      allow_future_usage: form.has("allow_future_usage"),
      allow_carry_forward: form.has("allow_carry_forward"),
      max_advance_sessions: Number(form.get("max_advance_sessions")),
      advance_policy: String(form.get("advance_policy")),
      carry_forward_expiry_months: Number(
        form.get("carry_forward_expiry_months"),
      ),
    };
    const result = await manageRecord("settings", { rules });
    setMessage(
      result.error ||
        "Settings saved. Existing confirmed cancellation deadlines remain unchanged.",
    );
    setBusy(false);
  }
  return (
    <section className="panel settings-panel">
      <h2>Booking policies</h2>
      <p className="muted">
        One set of clear rules for a smoother production schedule.
      </p>
      {!superAdmin && (
        <p className="callout">Only Super Admin can change global settings.</p>
      )}
      <form action={save}>
        <fieldset disabled={!superAdmin || busy}>
          <label>
            Business timezone
            <input name="timezone" defaultValue={r.timezone} required />
          </label>
          <div className="form-section">
            <h3>Working week</h3>
            <div className="working-days">
              {[
                "Sunday",
                "Monday",
                "Tuesday",
                "Wednesday",
                "Thursday",
                "Friday",
                "Saturday",
              ].map((d, i) => (
                <label className="checkbox" key={d}>
                  <input
                    type="checkbox"
                    name="working_days"
                    value={i}
                    defaultChecked={r.working_days.includes(i)}
                  />
                  {d}
                </label>
              ))}
            </div>
          </div>
          <div className="form-grid">
            {[
              {
                key: "lead_time_days",
                label: "Full working days before shoot",
                max: 90,
              },
              {
                key: "cancellation_window_hours",
                label: "Cancellation window (hours)",
                max: 720,
              },
              {
                key: "day_start",
                label: "Production day start (hour)",
                max: 23,
              },
              { key: "day_end", label: "Production day end (hour)", max: 23 },
              {
                key: "max_advance_sessions",
                label: "Maximum advance sessions",
                max: 1000,
              },
              {
                key: "carry_forward_expiry_months",
                label: "Carry-forward expiry (months)",
                max: 24,
              },
            ].map((f) => (
              <label key={f.key}>
                {f.label}
                <input
                  name={f.key}
                  type="number"
                  min={0}
                  max={f.max}
                  defaultValue={r[f.key as keyof typeof r] as number}
                  required
                />
              </label>
            ))}
            <label>
              Advance policy
              <select name="advance_policy" defaultValue={r.advance_policy}>
                <option value="numeric">Numeric limit</option>
                <option value="unlimited">Unlimited within contract</option>
                <option value="approval">Admin approval only</option>
              </select>
            </label>
          </div>
          <div className="form-section">
            {[
              {
                key: "pending_blocks",
                label: "Pending requests lock calendar slots",
              },
              {
                key: "allow_future_usage",
                label: "Allow contract-controlled future borrowing",
              },
              {
                key: "allow_carry_forward",
                label: "Allow contract-controlled carry-forward",
              },
            ].map((f) => (
              <label key={f.key} className="checkbox">
                <input
                  name={f.key}
                  type="checkbox"
                  defaultChecked={Boolean(r[f.key as keyof typeof r])}
                />
                {f.label}
              </label>
            ))}
          </div>
          <Button type="submit">
            {busy ? "Saving…" : "Save policy settings"}
          </Button>
        </fieldset>
      </form>
      {message && (
        <p className="callout" role="status">
          {message}
        </p>
      )}
    </section>
  );
}
