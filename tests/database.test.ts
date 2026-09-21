import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
let db: PGlite;
const superId = randomUUID(),
  adminId = randomUUID(),
  clientId = randomUUID(),
  otherId = randomUUID(),
  org = randomUUID(),
  otherOrg = randomUUID();
let contract: string;
async function asUser(id: string, sql: string, params: unknown[] = []) {
  await db.exec(
    `set role authenticated; select set_config('request.jwt.claim.sub','${id}',false);`,
  );
  return db.query(sql, params);
}
async function owner(sql: string, params: unknown[] = []) {
  await db.exec(
    "reset role; select set_config('request.jwt.claim.sub','',false);",
  );
  return db.query(sql, params);
}
function future(days = 20, hour = 10) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  d.setUTCHours(hour, 0, 0, 0);
  while ([5, 6].includes(d.getUTCDay())) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString();
}
async function create(
  starts = future(),
  overrides: Record<string, unknown> = {},
  user = clientId,
) {
  const result = await asUser(
    user,
    "select create_booking_request($1::jsonb) id",
    [
      JSON.stringify({
        organization_id: org,
        contract_id: contract,
        start_at: starts,
        duration_minutes: 60,
        location: "Fake studio",
        subject: "Development subject",
        topics: "Testing production rules",
        expected_reels: 4,
        script_ready: true,
        content_plan_ready: true,
        shoot_type: "Content shoot",
        idempotency_key: randomUUID(),
        ...overrides,
      }),
    ],
  );
  return String((result.rows[0] as { id: string }).id);
}
async function command(
  id: string,
  cmd: string,
  input: Record<string, unknown> = {},
  user = adminId,
) {
  return asUser(user, "select booking_command($1,$2,$3::jsonb)", [
    id,
    cmd,
    JSON.stringify(input),
  ]);
}
beforeAll(async () => {
  db = new PGlite({ extensions: { btree_gist } });
  for (const file of [
    "202609140000_auth.sql",
    "202609140001_core.sql",
    "202609140002_workflows.sql",
    "202609140003_management.sql",
    "202609140004_files.sql",
    "202609140005_reporting.sql",
  ]) {
    const sql = readFileSync(`db/migrations/${file}`, "utf8");
    try {
      await db.exec(sql);
    } catch (error) {
      const e = error as { position?: string; message: string };
      throw new Error(
        `${file}: ${e.message} near ${sql.slice(Math.max(0, Number(e.position) - 100), Number(e.position) + 100)}`,
      );
    }
  }
  await owner(
    "insert into auth.users(id,email,password_hash) values ($1,'super@example.test','test'),($2,'admin@example.test','test'),($3,'client@example.test','test'),($4,'other@example.test','test')",
    [superId, adminId, clientId, otherId],
  );
  await owner(
    "insert into organizations(id,name) values ($1,'Fake Alpha'),($2,'Fake Beta')",
    [org, otherOrg],
  );
  await owner(
    "insert into profiles(id,organization_id,role,name,email) values ($1,null,'super_admin','Super','super@example.test'),($2,null,'admin','Admin','admin@example.test'),($3,$5,'client','Client','client@example.test'),($4,$6,'client','Other','other@example.test')",
    [superId, adminId, clientId, otherId, org, otherOrg],
  );
  const start = new Date();
  start.setUTCMonth(start.getUTCMonth() - 1, 1);
  const end = new Date();
  end.setUTCMonth(end.getUTCMonth() + 11, 0);
  const result = await asUser(
    superId,
    "select manage_record('contract',$1::jsonb) id",
    [
      JSON.stringify({
        organization_id: org,
        start_date: start.toISOString().slice(0, 10),
        end_date: end.toISOString().slice(0, 10),
        monthly_allowance: 4,
        total_entitlement: 48,
        allow_future_usage: true,
        advance_policy: "unlimited",
        allow_carry_forward: true,
        carry_forward_expiry_months: 3,
      }),
    ],
  );
  contract = String((result.rows[0] as { id: string }).id);
  await owner(
    "update system_settings set value=jsonb_set(value,'{advance_policy}','\"unlimited\"')",
  );
});
afterAll(async () => {
  await db?.close();
});
describe("Actual PostgreSQL booking workflow and RLS", () => {
  it("isolates private file metadata and denies direct client uploads", async () => {
    const id = await create(future(230, 8));
    const path = `${org}/${id}/script.pdf`;
    await asUser(clientId, "select register_booking_file($1)", [
      JSON.stringify({
        booking_id: id,
        storage_path: path,
        file_name: "script.pdf",
        file_type: "application/pdf",
        category: "script",
      }),
    ]);
    expect(
      (
        await asUser(
          clientId,
          "select * from booking_files where storage_path=$1",
          [path],
        )
      ).rows,
    ).toHaveLength(1);
    expect(
      (
        await asUser(
          otherId,
          "select * from booking_files where storage_path=$1",
          [path],
        )
      ).rows,
    ).toHaveLength(0);
    await expect(
      asUser(
        clientId,
        "insert into booking_files(booking_id,file_name,storage_path,file_type,category,uploaded_by) values ($1,'bad','bad','application/pdf','script',$2)",
        [id, clientId],
      ),
    ).rejects.toThrow(/permission denied/i);
  });
  it("creates original allocations and immutable ledger entries", async () => {
    const result = await asUser(clientId, "select * from session_balances()");
    expect(result.rows).toHaveLength(12);
    expect(
      result.rows.every(
        (r) => (r as { original_allocation: number }).original_allocation === 4,
      ),
    ).toBe(true);
    await expect(
      asUser(clientId, "update contracts set total_entitlement=999"),
    ).rejects.toThrow(/permission denied/i);
  });
  it("isolates organizations, contracts, bookings and accounting helpers", async () => {
    const id = await create();
    const rows = await asUser(otherId, "select * from bookings where id=$1", [
      id,
    ]);
    expect(rows.rows).toHaveLength(0);
    expect(
      (await asUser(otherId, "select * from contracts")).rows,
    ).toHaveLength(0);
    await expect(
      command(id, "cancel", { reason: "Not mine" }, otherId),
    ).rejects.toThrow(/not found/i);
    await expect(
      asUser(clientId, "select contract_remaining($1)", [contract]),
    ).rejects.toThrow(/permission denied/i);
  });
  it("starts pending, allows competing pending requests and locks on approval", async () => {
    const at = future(21);
    const a = await create(at),
      b = await create(at);
    const pending = await asUser(
      clientId,
      "select status,slot_locked from bookings where id=$1",
      [a],
    );
    expect(pending.rows[0]).toMatchObject({
      status: "Pending Approval",
      slot_locked: false,
    });
    await command(a, "approve");
    await expect(command(b, "approve")).rejects.toThrow(/unavailable/i);
    const jobs = await asUser(
      adminId,
      "select * from notifications where booking_id=$1 and event_type='Booking approved' and channel='email'",
      [a],
    );
    expect(jobs.rows.length).toBeGreaterThan(0);
  });
  it("denies client approvals and global settings changes", async () => {
    const id = await create(future(25));
    await expect(command(id, "approve", {}, clientId)).rejects.toThrow(
      /admin/i,
    );
    await expect(
      asUser(adminId, "select manage_record('settings','{}')"),
    ).rejects.toThrow(/super admin/i);
  });
  it("rejects too-soon requests, forged accounting and client urgent requests", async () => {
    await expect(
      create(new Date(Date.now() + 3600000).toISOString()),
    ).rejects.toThrow();
    await expect(create(future(), { balance_before: 99 })).rejects.toThrow(
      /server controlled/i,
    );
    await expect(create(future(), { urgent: true })).rejects.toThrow(/admin/i);
  });
  it("allows urgent admin request inside normal lead time", async () => {
    const id = await create(
      new Date(Date.now() + 7200000).toISOString(),
      { urgent: true },
      adminId,
    );
    await command(id, "approve");
    const result = await asUser(
      adminId,
      "select status from bookings where id=$1",
      [id],
    );
    expect(result.rows[0]).toMatchObject({ status: "Urgent Shoot" });
  });
  it("rejects pending without a session deduction", async () => {
    const id = await create(future(31));
    await command(id, "reject", { reason: "Crew not suitable" });
    const ledger = await asUser(
      clientId,
      "select * from session_ledger where booking_id=$1",
      [id],
    );
    expect(ledger.rows).toHaveLength(0);
  });
  it("restores an on-time cancellation exactly once", async () => {
    const id = await create(future(32, 12));
    await command(id, "approve");
    await command(id, "cancel", { reason: "Client plans changed" }, clientId);
    const result = await asUser(
      clientId,
      "select sum(quantity)::int q from session_ledger where booking_id=$1",
      [id],
    );
    expect(result.rows[0]).toMatchObject({ q: 0 });
    await expect(
      command(id, "cancel", { reason: "Repeated" }, clientId),
    ).rejects.toThrow(/status/i);
  });
  it("requires late acknowledgement and consumes only the existing reservation", async () => {
    const id = await create(
      new Date(Date.now() + 4 * 3600000).toISOString(),
      { urgent: true },
      adminId,
    );
    await command(id, "approve");
    await expect(
      command(id, "cancel", { reason: "Late cancel" }, clientId),
    ).rejects.toThrow(/acknowledge/i);
    await command(
      id,
      "cancel",
      { reason: "Late cancel", acknowledged: true },
      clientId,
    );
    const result = await asUser(
      clientId,
      "select sum(quantity)::int q from session_ledger where booking_id=$1",
      [id],
    );
    expect(result.rows[0]).toMatchObject({ q: -1 });
  });
  it("restores a late cancellation only with an audited admin exception", async () => {
    const id = await create(
      new Date(Date.now() + 6 * 3600000).toISOString(),
      { urgent: true },
      adminId,
    );
    await command(id, "approve");
    await expect(
      command(id, "cancel", { exception: true, reason: "x" }),
    ).rejects.toThrow(/reason/i);
    await command(id, "cancel", {
      exception: true,
      reason: "Medical emergency",
    });
    const result = await asUser(
      adminId,
      "select * from audit_logs where booking_id=$1 and action='Admin exception'",
      [id],
    );
    expect(result.rows).toHaveLength(1);
  });
  it("exposes anonymous availability without metadata", async () => {
    const result = await asUser(
      otherId,
      "select * from calendar_availability(now(),now()+interval '60 days')",
    );
    expect(result.rows.length).toBeGreaterThan(0);
    expect(Object.keys(result.rows[0] as object).sort()).toEqual([
      "end_at",
      "resource_id",
      "start_at",
    ]);
  });
  it("preserves old/new schedule and prevents client audit access", async () => {
    const id = await create(future(40));
    await command(id, "suggest", {
      start_at: future(42),
      duration_minutes: 90,
      reason: "Better production slot",
    });
    await command(id, "accept_suggestion", {}, clientId);
    const result = await asUser(
      adminId,
      "select * from audit_logs where booking_id=$1 and entity_type='bookings'",
      [id],
    );
    expect(result.rows.length).toBeGreaterThan(1);
    expect(
      (await asUser(clientId, "select * from audit_logs")).rows,
    ).toHaveLength(0);
    const timeline = await asUser(
      clientId,
      "select * from booking_timeline($1)",
      [id],
    );
    expect(timeline.rows.length).toBeGreaterThan(0);
  });
  it("records carry-forward independently without altering source allocation", async () => {
    const source = new Date();
    source.setUTCMonth(source.getUTCMonth() - 1, 1);
    const mon = source.toISOString().slice(0, 10);
    await asUser(adminId, "select manage_record('carry',$1)", [
      JSON.stringify({ contract_id: contract, source_month: mon }),
    ]);
    const result = await asUser(
      clientId,
      "select original_allocation from contract_month_allocations where contract_id=$1 and month=$2",
      [contract, mon],
    );
    expect(result.rows[0]).toMatchObject({ original_allocation: 4 });
    expect(
      (await asUser(clientId, "select * from carry_forward")).rows,
    ).toHaveLength(1);
  });
  it("prevents mutations to immutable history even from owner", async () => {
    await expect(
      owner("update session_ledger set reason='rewrite'"),
    ).rejects.toThrow(/append-only/i);
    await expect(owner("delete from audit_logs")).rejects.toThrow(
      /append-only/i,
    );
  });
  it("borrows future sessions without rewriting allocations and enforces maximum advance", async () => {
    const start = new Date();
    start.setUTCDate(1);
    const end = new Date(start);
    end.setUTCMonth(end.getUTCMonth() + 11);
    end.setUTCDate(28);
    const result = await asUser(
      superId,
      "select manage_record('contract',$1) id",
      [
        JSON.stringify({
          organization_id: org,
          start_date: start.toISOString().slice(0, 10),
          end_date: end.toISOString().slice(0, 10),
          monthly_allowance: 1,
          total_entitlement: 12,
          allow_future_usage: true,
          advance_policy: "numeric",
          max_advance_sessions: 1,
        }),
      ],
    );
    const cid = (result.rows[0] as { id: string }).id;
    const a = await create(future(60, 8), { contract_id: cid }),
      b = await create(future(60, 10), { contract_id: cid }),
      c = await create(future(60, 12), { contract_id: cid });
    await command(a, "approve");
    const mon = new Date(future(60));
    mon.setUTCMonth(mon.getUTCMonth() + 1, 1);
    const futureMonth = mon.toISOString().slice(0, 10);
    await expect(command(b, "approve")).rejects.toThrow(
      /future allocation month/i,
    );
    await command(b, "approve", { future_month: futureMonth });
    const original = await asUser(
      clientId,
      "select original_allocation from contract_month_allocations where contract_id=$1 and month=$2",
      [cid, futureMonth],
    );
    expect(original.rows[0]).toMatchObject({ original_allocation: 1 });
    const balances = await asUser(
      clientId,
      "select * from session_balances() where contract_id=$1 and month=$2",
      [cid, futureMonth],
    );
    expect(balances.rows[0]).toMatchObject({
      remaining: 0,
      advance_sessions_used: 1,
    });
    mon.setUTCMonth(mon.getUTCMonth() + 1);
    await expect(
      command(c, "approve", { future_month: mon.toISOString().slice(0, 10) }),
    ).rejects.toThrow(/maximum advance/i);
    await expect(
      command(c, "approve", { future_month: "2099-01-01" }),
    ).rejects.toThrow(/outside contract/i);
  });
  it("completion produces one Shooting Log and does not double deduct; no-show consumes reservation", async () => {
    for (const action of ["complete", "no_show"]) {
      const id = await create(future(action === "complete" ? 75 : 77, 8));
      await command(id, "approve");
      await owner(
        "update bookings set start_at=now()-interval '3 hours',end_at=now()-interval '2 hours',slot_locked=false where id=$1",
        [id],
      );
      await command(id, action, { reason: "Historical test shoot" });
      const result = await asUser(
        clientId,
        "select sum(quantity)::int q from session_ledger where booking_id=$1",
        [id],
      );
      expect(result.rows[0]).toMatchObject({ q: -1 });
      if (action === "complete") {
        expect(
          (
            await asUser(
              clientId,
              "select * from shooting_logs where booking_id=$1",
              [id],
            )
          ).rows,
        ).toHaveLength(1);
        await expect(command(id, "complete")).rejects.toThrow(/confirmed/i);
      }
    }
  });
  it("late rescheduling consumes the old session and reserves the new one atomically", async () => {
    const id = await create(future(80, 8));
    await command(id, "approve");
    await owner(
      "update bookings set cancellation_deadline=now()-interval '1 minute' where id=$1",
      [id],
    );
    await command(
      id,
      "request_reschedule",
      {
        start_at: future(110, 8),
        duration_minutes: 60,
        reason: "New campaign schedule",
        acknowledged: true,
      },
      clientId,
    );
    const before = await asUser(
      clientId,
      "select status,slot_locked,start_at from bookings where id=$1",
      [id],
    );
    expect(before.rows[0]).toMatchObject({
      status: "Reschedule Requested",
      slot_locked: true,
    });
    await command(id, "approve_reschedule");
    const result = await asUser(
      clientId,
      "select sum(quantity)::int q from session_ledger where booking_id=$1",
      [id],
    );
    expect(result.rows[0]).toMatchObject({ q: -2 });
  });
  it("on-time rescheduling preserves one reservation and original slot until approval", async () => {
    const id = await create(future(140, 8));
    await command(id, "approve");
    await command(
      id,
      "request_reschedule",
      {
        start_at: future(141, 12),
        duration_minutes: 60,
        reason: "Preferred new time",
      },
      clientId,
    );
    await command(id, "approve_reschedule");
    const result = await asUser(
      clientId,
      "select sum(quantity)::int q from session_ledger where booking_id=$1",
      [id],
    );
    expect(result.rows[0]).toMatchObject({ q: -1 });
  });
  it("denies inactive members even through security-definer endpoints", async () => {
    const id = await create(future(150, 8));
    await owner("update profiles set status='inactive' where id=$1", [otherId]);
    await expect(
      asUser(otherId, "select register_booking_file($1)", [
        JSON.stringify({
          booking_id: id,
          file_name: "bad.txt",
          file_type: "text/plain",
          category: "script",
          storage_path: `${org}/${id}/bad.txt`,
        }),
      ]),
    ).rejects.toThrow(/not found/i);
    await owner("update profiles set status='active' where id=$1", [otherId]);
  });
  it("blocks calendar creation over a reservation and denies direct client inserts", async () => {
    const id = await create(future(160, 8));
    await command(id, "approve");
    await expect(
      asUser(adminId, "select manage_record('block',$1)", [
        JSON.stringify({
          start_at: future(160, 8),
          end_at: future(160, 10),
          block_type: "Holiday",
          reason: "Blocked",
        }),
      ]),
    ).rejects.toThrow(/conflicts/i);
    await expect(
      asUser(
        clientId,
        "insert into calendar_blocks(created_by,start_at,end_at,block_type,reason) values ($1,now(),now()+interval '1 day','Holiday','Unauthorized')",
        [clientId],
      ),
    ).rejects.toThrow(/permission denied/i);
  });
  it("exactly the stored deadline cancels on time at the database layer", async () => {
    const id = await create(future(180, 8));
    await command(id, "approve");
    await owner("begin");
    try {
      await owner(
        "update bookings set cancellation_deadline=now() where id=$1",
        [id],
      );
      await command(id, "cancel", { reason: "Exactly at deadline" }, clientId);
      const result = await asUser(
        clientId,
        "select status from bookings where id=$1",
        [id],
      );
      expect(result.rows[0]).toMatchObject({ status: "Cancelled On Time" });
      await db.exec("commit");
    } catch (error) {
      await db.exec("rollback");
      throw error;
    }
  });
  it("rejects requests beyond contract end and exhausted total entitlement", async () => {
    await expect(create("2099-01-01T10:00:00Z")).rejects.toThrow(
      /outside contract/i,
    );
    const at = future(200, 8);
    const mon = at.slice(0, 7) + "-01";
    const end = at.slice(0, 7) + "-28";
    const row = await asUser(
      superId,
      "select manage_record('contract',$1) id",
      [
        JSON.stringify({
          organization_id: org,
          start_date: mon,
          end_date: end,
          monthly_allowance: 1,
          total_entitlement: 1,
        }),
      ],
    );
    const cid = (row.rows[0] as { id: string }).id;
    const id = await create(at, { contract_id: cid });
    await command(id, "approve");
    await expect(create(future(200, 10), { contract_id: cid })).rejects.toThrow(
      /total contract entitlement exhausted/i,
    );
  });
  it("consumes eligible carry-forward with a separate source and restores it on time", async () => {
    const id = await create(future(8, 8));
    await command(id, "approve");
    const b = await asUser(
      clientId,
      "select session_source,carry_id from bookings where id=$1",
      [id],
    );
    expect(b.rows[0]).toMatchObject({ session_source: "carry" });
    const carryId = (b.rows[0] as { carry_id: string }).carry_id;
    const before = await asUser(
      clientId,
      "select used from carry_forward where id=$1",
      [carryId],
    );
    await command(id, "cancel", { reason: "Carry restoration test" }, clientId);
    const after = await asUser(
      clientId,
      "select used from carry_forward where id=$1",
      [carryId],
    );
    expect((after.rows[0] as { used: number }).used).toBe(
      (before.rows[0] as { used: number }).used - 1,
    );
  });
  it("rejects incomplete settings and permits Super Admin to update contract rules", async () => {
    await expect(
      asUser(superId, "select manage_record('settings','{\"rules\":{}}')"),
    ).rejects.toThrow(/complete settings/i);
    await asUser(superId, "select manage_record('contract_policy',$1)", [
      JSON.stringify({
        id: contract,
        lead_time_days: 5,
        cancellation_window_hours: 36,
        allow_future_usage: true,
        advance_policy: "unlimited",
        allow_carry_forward: true,
        carry_forward_expiry_months: 3,
      }),
    ]);
    const result = await asUser(
      clientId,
      "select lead_time_days,cancellation_window_hours from contracts where id=$1",
      [contract],
    );
    expect(result.rows[0]).toMatchObject({
      lead_time_days: 5,
      cancellation_window_hours: 36,
    });
  });
});
