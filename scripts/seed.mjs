import { randomBytes, randomUUID } from "node:crypto";
import { writeFileSync, existsSync } from "node:fs";
import { addDays, addMonths, startOfMonth, endOfMonth, format } from "date-fns";
import { fromZonedTime } from "date-fns-tz";
import { openDatabase } from "../db/runtime.mjs";
import { hashPassword } from "../src/server/passwords.ts";
if (existsSync(".env.local")) process.loadEnvFile(".env.local");
const db = await openDatabase();
try {
  const credentials = [];
  await db.transaction(async (tx) => {
    if ((await tx.query("select id from auth.users limit 1")).rows.length)
      throw new Error(
        "Seed requires an empty workspace and will not overwrite existing accounts or history.",
      );
    const orgs = [
      "Olive Dental Studio",
      "Forma Wellness",
      "Northline Interiors",
    ].map((name) => ({ id: randomUUID(), name: `DEMO · ${name}` }));
    for (const o of orgs)
      await tx.query("insert into organizations(id,name) values($1,$2)", [
        o.id,
        o.name,
      ]);
    let superId;
    for (const item of [
      {
        email: "super@brill.example.test",
        name: "Demo Super Admin",
        role: "super_admin",
        org: null,
      },
      {
        email: "admin@brill.example.test",
        name: "Demo Production Admin",
        role: "admin",
        org: null,
      },
      ...orgs.map((o, i) => ({
        email: `client${i + 1}@brill.example.test`,
        name: `Demo Client ${i + 1}`,
        role: "client",
        org: o.id,
      })),
    ]) {
      const id = randomUUID(),
        password = randomBytes(18).toString("base64url");
      await tx.query(
        "insert into auth.users(id,email,password_hash) values($1,$2,$3)",
        [id, item.email, await hashPassword(password)],
      );
      await tx.query(
        "insert into profiles(id,organization_id,role,name,email) values($1,$2,$3,$4,$5)",
        [id, item.org, item.role, item.name, item.email],
      );
      if (item.role === "super_admin") superId = id;
      credentials.push(`${item.role}: ${item.email}\nPassword: ${password}\n`);
    }
    const command = async (name, args) => {
      await tx.exec("set local role authenticated");
      await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [
        superId,
      ]);
      const values = Object.values(args).map((v) =>
        typeof v === "object" ? JSON.stringify(v) : v,
      );
      return (
        await tx.query(
          `select ${name}(${values.map((_, i) => `$${i + 1}`).join(",")}) id`,
          values,
        )
      ).rows[0].id;
    };
    const now = new Date(),
      start = startOfMonth(addMonths(now, -1)),
      end = endOfMonth(addMonths(start, 11));
    const contracts = [];
    for (const [i, o] of orgs.entries())
      contracts.push(
        await command("manage_record", {
          kind: "contract",
          input: {
            organization_id: o.id,
            start_date: format(start, "yyyy-MM-dd"),
            end_date: format(
              i === 0 ? endOfMonth(addMonths(now, 1)) : end,
              "yyyy-MM-dd",
            ),
            monthly_allowance: i === 1 ? 6 : 4,
            total_entitlement: i === 0 ? 12 : i === 1 ? 72 : 48,
            allow_future_usage: i === 2,
            max_advance_sessions: 2,
            advance_policy: "numeric",
            allow_carry_forward: i !== 0,
            carry_forward_expiry_months: 2,
          },
        }),
      );
    const crew = await command("manage_record", {
      kind: "resource",
      input: { name: "DEMO · Crew A", kind: "crew" },
    });
    await command("manage_record", {
      kind: "resource",
      input: { name: "DEMO · Product studio", kind: "studio" },
    });
    const schedule = (days) => {
      let day = addDays(now, days);
      while ([5, 6].includes(day.getDay())) day = addDays(day, 1);
      return fromZonedTime(
        `${format(day, "yyyy-MM-dd")}T10:00:00`,
        "Asia/Riyadh",
      ).toISOString();
    };
    for (const [i, status] of [
      "Pending Approval",
      "Confirmed",
      "Rejected",
      "Cancelled On Time",
      "Urgent Shoot",
      "Completed",
      "No Show",
    ].entries()) {
      const startAt =
        status === "Urgent Shoot"
          ? new Date(Date.now() + 3 * 3600000).toISOString()
          : schedule(10 + i * 3);
      const id = await command("create_booking_request", {
        input: {
          organization_id: orgs[i % 3].id,
          contract_id: contracts[i % 3],
          start_at: startAt,
          duration_minutes: 120,
          location: [
            "DEMO · Main branch",
            "DEMO · Brill studio",
            "DEMO · Client location",
          ][i % 3],
          subject: [
            "DEMO · Dr. Maya / dental care",
            "DEMO · Wellness campaign",
            "DEMO · Interior collection",
          ][i % 3],
          expected_reels: 4,
          topics: "Clearly fictional development production content.",
          script_ready: i % 2 === 0,
          content_plan_ready: true,
          shoot_type: i % 2 ? "Interview" : "Content shoot",
          resource_id: crew,
          urgent: status === "Urgent Shoot",
          idempotency_key: randomUUID(),
        },
      });
      if (status === "Rejected")
        await command("booking_command", {
          bid: id,
          command: "reject",
          input: { reason: "Development rejection example" },
        });
      if (
        [
          "Confirmed",
          "Cancelled On Time",
          "Urgent Shoot",
          "Completed",
          "No Show",
        ].includes(status)
      )
        await command("booking_command", {
          bid: id,
          command: "approve",
          input: {},
        });
      if (status === "Cancelled On Time")
        await command("booking_command", {
          bid: id,
          command: "cancel",
          input: { reason: "Development cancellation example" },
        });
      if (["Completed", "No Show"].includes(status)) {
        await tx.exec("reset role");
        await tx.query(
          "update bookings set start_at=now()-make_interval(days=>$2),end_at=now()-make_interval(days=>$2)+interval '2 hours',slot_locked=false where id=$1",
          [id, i + 1],
        );
        await command("booking_command", {
          bid: id,
          command: status === "Completed" ? "complete" : "no_show",
          input: { reason: "Development historical example" },
        });
      }
    }
    for (const [i, block_type] of [
      "Holiday",
      "Internal production",
      "Equipment unavailable",
      "Team unavailable",
    ].entries()) {
      const day = addDays(now, 3 + i);
      await command("manage_record", {
        kind: "block",
        input: {
          start_at: fromZonedTime(
            `${format(day, "yyyy-MM-dd")}T08:00:00`,
            "Asia/Riyadh",
          ).toISOString(),
          end_at: fromZonedTime(
            `${format(day, "yyyy-MM-dd")}T20:00:00`,
            "Asia/Riyadh",
          ).toISOString(),
          block_type,
          reason: `DEMO · ${block_type}`,
          resource_id: i < 2 ? null : crew,
        },
      });
    }
  });
  writeFileSync(".env.seed-accounts", credentials.join("\n"), { mode: 0o600 });
  console.log(
    "Demo data created. Random local sign-in passwords are in .env.seed-accounts (Git-ignored). No external messages were sent.",
  );
} finally {
  await db.close();
}
