import { addDays, addMonths, format, startOfMonth, endOfMonth } from "date-fns";
import { fromZonedTime } from "date-fns-tz";
import type { PortalData, Booking } from "../../src/types/domain";
export function portalFixture(client = false): PortalData {
  const now = new Date();
  const orgs = [
    {
      id: "11111111-1111-4111-8111-111111111111",
      name: "DEMO · Olive Dental Studio",
      status: "active",
    },
    {
      id: "22222222-2222-4222-8222-222222222222",
      name: "DEMO · Forma Wellness",
      status: "active",
    },
    {
      id: "33333333-3333-4333-8333-333333333333",
      name: "DEMO · Northline Interiors",
      status: "active",
    },
  ];
  const profiles = [
    {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      organization_id: null,
      role: "super_admin" as const,
      name: "Demo Production Admin",
      email: "super@example.test",
      phone: null,
      status: "active",
    },
    {
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      organization_id: orgs[0].id,
      role: "client" as const,
      name: "Demo Client",
      email: "client@example.test",
      phone: null,
      status: "active",
    },
  ];
  const contracts = orgs.map((o, i) => ({
    id: `44444444-4444-4444-8444-44444444444${i}`,
    organization_id: o.id,
    start_date: format(startOfMonth(now), "yyyy-MM-dd"),
    end_date: format(endOfMonth(addMonths(now, 11)), "yyyy-MM-dd"),
    monthly_allowance: 4,
    total_entitlement: 48,
    lead_time_days: null,
    cancellation_window_hours: null,
    allow_future_usage: true,
    max_advance_sessions: 2,
    advance_policy: "numeric" as const,
    allow_carry_forward: true,
    carry_forward_expiry_months: 2,
    status: "active",
  }));
  const bookings: Booking[] = Array.from({ length: 9 }, (_, i) => {
    let day = addDays(now, i < 3 ? i + 1 : i + 6);
    while ([5, 6].includes(day.getDay())) day = addDays(day, 1);
    const start = fromZonedTime(
      `${format(day, "yyyy-MM-dd")}T${i % 2 ? "14" : "10"}:00:00`,
      "Asia/Riyadh",
    );
    return {
      id: `55555555-5555-4555-8555-55555555555${i}`,
      organization_id: orgs[i % 3].id,
      contract_id: contracts[i % 3].id,
      created_by: profiles[0].id,
      status:
        i < 3
          ? "Confirmed"
          : i === 8
            ? "Urgent Shoot"
            : i === 7
              ? "Completed"
              : "Pending Approval",
      start_at: start.toISOString(),
      end_at: new Date(+start + 7200000).toISOString(),
      location: [
        "Main branch · Riyadh",
        "Brill production studio",
        "Showroom · Olaya",
      ][i % 3],
      subject: [
        "Dr. Maya · Dental care series",
        "September wellness campaign",
        "The new collection",
      ][i % 3],
      topics: "Fictional production brief for interface verification.",
      expected_reels: 4,
      script_ready: i % 2 === 0,
      content_plan_ready: true,
      equipment_requirements: "",
      additional_notes: "",
      shoot_type: i % 2 ? "Interview" : "Content shoot",
      resource_id: null,
      urgent: i === 8,
      cancellation_deadline:
        i < 3 ? new Date(+start - 86400000).toISOString() : null,
      allocation_month: i < 3 ? format(startOfMonth(now), "yyyy-MM-dd") : null,
      session_source: i < 3 ? "current" : null,
      proposed_start: null,
      proposed_end: null,
      change_reason: null,
      late_change: false,
      created_at: now.toISOString(),
      approved_at: i < 3 ? now.toISOString() : null,
      shooting_log_id: null,
    };
  });
  const allocations = contracts.flatMap((c, i) =>
    Array.from({ length: 12 }, (_, n) => ({
      id: `allocation-${i}-${n}`,
      contract_id: c.id,
      month: format(startOfMonth(addMonths(now, n)), "yyyy-MM-dd"),
      original_allocation: 4,
      carry_forward_received: 0,
      advance_sessions_used: 0,
      normal_sessions_used: n === 0 ? 2 : 0,
      remaining: n === 0 ? 2 : 4,
    })),
  );
  return {
    preview: true,
    balances: (client ? [contracts[0]] : contracts).map((c) => ({
      contract_id: c.id,
      total_remaining: 46,
      future_used: 0,
      confirmed_upcoming: 1,
    })),
    profile: profiles[client ? 1 : 0],
    profiles: client ? [profiles[1]] : profiles,
    organizations: client ? [orgs[0]] : orgs,
    contracts: client ? [contracts[0]] : contracts,
    bookings: client
      ? bookings.filter((b) => b.organization_id === orgs[0].id)
      : bookings,
    allocations: client
      ? allocations.filter((a) => a.contract_id === contracts[0].id)
      : allocations,
    ledger: [],
    audits: [],
    notifications: [],
    blocks: [],
    busy: bookings
      .filter((b) => b.status === "Confirmed")
      .map((b) => ({
        start_at: b.start_at,
        end_at: b.end_at,
        resource_id: b.resource_id,
      })),
    resources: [],
    files: [],
    carry: [],
    templates: [],
    logs: [],
    rules: {
      timezone: "Asia/Riyadh",
      working_days: [0, 1, 2, 3, 4],
      lead_time_days: 4,
      cancellation_window_hours: 24,
      pending_blocks: false,
      day_start: 8,
      day_end: 20,
      allow_future_usage: true,
      allow_carry_forward: true,
      max_advance_sessions: 2,
      advance_policy: "numeric",
      carry_forward_expiry_months: 2,
    },
  };
}
