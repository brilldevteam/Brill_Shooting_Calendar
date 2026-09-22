"use client";
import Link from "next/link";
import { useNow } from "@/lib/use-now";
import { useEffect, useRef, useState } from "react";
import { formatInTimeZone } from "date-fns-tz";
import {
  LayoutDashboard,
  CalendarDays,
  ClipboardList,
  Building2,
  Wallet,
  Bell,
  Settings2,
  Clapperboard,
  LogOut,
  Plus,
  Search,
  ChevronRight,
  ChevronLeft,
  ArrowUpRight,
  Clock3,
  CheckCircle2,
  Video,
  Ban,
  Users,
  FileBarChart,
  History,
  Menu,
  Download,
  RefreshCw,
  ChevronDown,
  KeyRound,
} from "lucide-react";
import type { Booking, Json, PortalData } from "@/types/domain";
import {
  signOut,
  manageRecord,
  markMyNotificationsRead,
} from "@/server/actions";
import { Button } from "./ui/button";
import { BrandLogo } from "./brand-logo";
import { Dialog } from "./ui/dialog";
import { Calendar, Status } from "./calendar";
import { BookingForm } from "./booking-form";
import { BookingDetail } from "./booking-detail";
import { ManagementForm, Settings } from "./management";
const navigation = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "calendar", label: "Shooting calendar", icon: CalendarDays },
  { id: "bookings", label: "Bookings", icon: ClipboardList },
  { id: "contracts", label: "Sessions & contracts", icon: Wallet },
  { id: "clients", label: "Clients & users", icon: Building2, admin: true },
  { id: "resources", label: "Team & availability", icon: Users, admin: true },
  { id: "logs", label: "Shooting log", icon: Video },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "reports", label: "Reports & ledger", icon: FileBarChart },
  { id: "audit", label: "Audit history", icon: History, admin: true },
  { id: "settings", label: "Settings", icon: Settings2, admin: true },
];
const clientNavigation = [
  { id: "overview", label: "Home", icon: LayoutDashboard },
  { id: "calendar", label: "Calendar", icon: CalendarDays },
  { id: "bookings", label: "My shoots", icon: ClipboardList },
  { id: "contracts", label: "My sessions", icon: Wallet },
  { id: "notifications", label: "Updates", icon: Bell },
];
export function Portal({
  data,
  initialBookingId = null,
}: {
  data: PortalData;
  initialBookingId?: string | null;
}) {
  const now = useNow();
  const [tab, setTab] = useState("overview");
  const [collapsed, setCollapsed] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("");
  const [bookingId, setBookingId] = useState<string | null>(initialBookingId);
  const [create, setCreate] = useState(false);
  const [initialDate, setInitialDate] = useState<string>();
  const [manage, setManage] = useState("");
  const [initial, setInitial] = useState<Record<string, Json>>({});
  const [flash, setFlash] = useState("");
  const [offline, setOffline] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const notificationMenu = useRef<HTMLDivElement>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const profileMenu = useRef<HTMLDivElement>(null);
  const [removeBlock, setRemoveBlock] = useState<string | null>(null);
  useEffect(() => {
    const off = () => setOffline(true),
      on = () => setOffline(false);
    window.addEventListener("offline", off);
    window.addEventListener("online", on);
    return () => {
      window.removeEventListener("offline", off);
      window.removeEventListener("online", on);
    };
  }, []);
  useEffect(() => {
    if (!notificationsOpen) return;
    const close = (event: PointerEvent) => {
      if (!notificationMenu.current?.contains(event.target as Node)) {
        setNotificationsOpen(false);
      }
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [notificationsOpen]);
  useEffect(() => {
    if (!profileOpen) return;
    const close = (event: PointerEvent) => {
      if (!profileMenu.current?.contains(event.target as Node)) {
        setProfileOpen(false);
      }
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [profileOpen]);
  const admin = data.profile.role !== "client";
  const visibleNavigation = admin ? navigation : clientNavigation;
  const superAdmin = data.profile.role === "super_admin";
  const zone = data.rules.timezone;
  const today = formatInTimeZone(new Date(), zone, "yyyy-MM-dd");
  const month = today.slice(0, 7);
  const fmt = (date: string, pattern = "dd MMM · HH:mm") =>
    formatInTimeZone(date, zone, pattern);
  const name = (id: string) =>
    data.organizations.find((o) => o.id === id)?.name || "Client";
  const pending = data.bookings.filter((b) => b.status === "Pending Approval");
  const upcoming = data.bookings
    .filter(
      (b) =>
        ["Confirmed", "Urgent Shoot"].includes(b.status) &&
        +new Date(b.start_at) >= now,
    )
    .sort((a, b) => a.start_at.localeCompare(b.start_at));
  const selected = data.bookings.find((b) => b.id === bookingId);
  const visible = data.bookings.filter(
    (b) =>
      (!filter || b.status === filter) &&
      `${b.subject} ${name(b.organization_id)} ${b.location}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const total = data.contracts.reduce((n, c) => n + c.total_entitlement, 0);
  const used = total - data.balances.reduce((n, c) => n + c.total_remaining, 0);
  const monthAvailable = data.allocations
    .filter((a) => a.month.startsWith(month))
    .reduce((n, a) => n + a.remaining + a.carry_forward_received, 0);
  const failed = data.notifications.filter((n) => n.status === "failed");
  const mySystemNotifications = data.notifications.filter(
    (n) => n.channel === "system" && n.recipient_user_id === data.profile.id,
  );
  const unread = mySystemNotifications.filter((n) => n.status === "sent");
  const recentNotifications = Object.values(
    [...mySystemNotifications, ...(admin ? failed : [])].reduce<
      Record<string, typeof data.notifications>
    >((groups, notice) => {
      const key = `${notice.booking_id || "general"}-${notice.event_type}-${notice.created_at.slice(0, 16)}`;
      (groups[key] ||= []).push(notice);
      return groups;
    }, {}),
  )
    .map((group) => group[0])
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 5);
  const notificationGroups = Object.values(
    data.notifications.reduce<Record<string, typeof data.notifications>>(
      (groups, notice) => {
        const key = `${notice.booking_id || "general"}-${notice.event_type}-${notice.created_at.slice(0, 16)}`;
        (groups[key] ||= []).push(notice);
        return groups;
      },
      {},
    ),
  ).sort((a, b) => b[0].created_at.localeCompare(a[0].created_at));
  const notificationCount = notificationGroups.filter((group) =>
    group.some(
      (notice) =>
        (notice.channel === "system" &&
          notice.recipient_user_id === data.profile.id &&
          notice.status === "sent") ||
        (admin && notice.status === "failed"),
    ),
  ).length;
  const thisMonthUsed = data.bookings.filter(
    (b) =>
      ["Completed", "Late Cancellation", "No Show"].includes(b.status) &&
      fmt(b.start_at, "yyyy-MM") === month,
  ).length;
  const openCreate = (date?: string) => {
    if (!data.contracts.some((contract) => contract.status === "active")) {
      setFlash(
        "Your account is ready. Brill Admin must assign an active contract before you can request a shoot.",
      );
      return;
    }
    setInitialDate(date);
    setCreate(true);
  };
  const openManage = (kind: string, values: Record<string, Json> = {}) => {
    setInitial(values);
    setManage(kind);
  };
  const success = () => {
    setManage("");
    setFlash("Changes saved successfully.");
  };
  async function retry(id: string) {
    const result = await manageRecord("retry_notification", { id });
    setFlash(
      result.error ||
        "Notification queued for retry. The delivery worker will process it.",
    );
  }
  async function retryFailedNotifications(ids: string[]) {
    for (const id of ids) await retry(id);
  }
  async function markAllNotificationsRead() {
    const result = await markMyNotificationsRead();
    if (result.error) setFlash(result.error);
  }
  function exportLedger() {
    const rows = [
      [
        "Date",
        "Client",
        "Booking",
        "Allocation month",
        "Source",
        "Transaction",
        "Quantity",
        "Before",
        "After",
        "Reason",
      ],
      ...data.ledger.map((l) => [
        l.created_at,
        name(l.organization_id),
        l.booking_id || "",
        l.allocation_month,
        l.session_source,
        l.transaction_type,
        String(l.quantity),
        String(l.balance_before),
        String(l.balance_after),
        l.reason,
      ]),
    ];
    const csv = rows
      .map((row) =>
        row
          .map(
            (cell) =>
              `"${(/^[=+@\-]/.test(cell) ? "'" : "") + cell.replaceAll('"', '""')}"`,
          )
          .join(","),
      )
      .join("\r\n");
    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8;" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `brill-session-ledger-${today}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
  function bookingsTable(rows: Booking[]) {
    return rows.length ? (
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>{admin ? "Client / production" : "Production"}</th>
              <th>Schedule</th>
              <th>Status</th>
              <th>Location</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((b) => (
              <tr key={b.id} onClick={() => setBookingId(b.id)}>
                <td>
                  <div className="table-client">
                    <span className="avatar">
                      {(admin ? name(b.organization_id) : b.subject)
                        .slice(0, 2)
                        .toUpperCase()}
                    </span>
                    <span>
                      <strong>
                        {admin ? name(b.organization_id) : b.subject}
                      </strong>
                      <small>{admin ? b.subject : b.shoot_type}</small>
                    </span>
                  </div>
                </td>
                <td>
                  {fmt(b.start_at, "dd MMM yyyy")}
                  <small>
                    {fmt(b.start_at, "HH:mm")} – {fmt(b.end_at, "HH:mm")}
                  </small>
                </td>
                <td>
                  <Status value={b.status} />
                </td>
                <td>{b.location}</td>
                <td>
                  <button
                    aria-label={`Open booking ${b.subject}`}
                    className="button button-ghost button-icon"
                    onClick={() => setBookingId(b.id)}
                  >
                    <ArrowUpRight size={17} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ) : (
      <Empty
        title="Nothing on the call sheet yet"
        text="Your bookings will appear here as soon as a shooting request is created."
        action={() => openCreate()}
        actionLabel="Request a shoot"
      />
    );
  }
  return (
    <div className={`app-shell ${collapsed ? "nav-collapsed" : ""}`}>
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      {mobile && (
        <button
          className="mobile-backdrop"
          aria-label="Close navigation"
          onClick={() => setMobile(false)}
        />
      )}
      <aside className={`sidebar ${mobile ? "mobile-open" : ""}`}>
        <Link className="brand" href="/">
          <BrandLogo priority />
        </Link>
        <div className="workspace-label">PRODUCTION WORKSPACE</div>
        <nav aria-label="Main navigation">
          {visibleNavigation.map((n) => (
            <button
              key={n.id}
              title={n.label}
              className={tab === n.id ? "nav-active" : ""}
              onClick={() => {
                setTab(n.id);
                setMobile(false);
              }}
            >
              <n.icon size={19} />
              <span>{n.label}</span>
              {n.id === "bookings" && pending.length > 0 && (
                <em>{pending.length}</em>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <span className="live-dot" /> ALL SET TO CREATE
            <small>
              {zone}
              <br />
              Your production, in sync.
            </small>
          </div>
          <button
            className="collapse-button"
            onClick={() => setCollapsed(!collapsed)}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
            <span>Collapse sidebar</span>
          </button>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="row">
            <button
              className="mobile-menu button button-ghost button-icon"
              aria-label="Open navigation"
              onClick={() => setMobile(true)}
            >
              <Menu size={21} />
            </button>
            <span className="breadcrumb">
              Workspace <ChevronRight size={14} />{" "}
              <strong>
                {visibleNavigation.find((n) => n.id === tab)?.label}
              </strong>
            </span>
          </div>
          <div className="row">
            <span className="top-date">
              {fmt(new Date().toISOString(), "EEE, dd MMM yyyy")}
            </span>
            <div className="notification-menu" ref={notificationMenu}>
              <button
                className={`bell-button${notificationCount ? " has-notifications" : ""}`}
                aria-label={
                  notificationCount
                    ? `Open notifications, ${notificationCount} need attention`
                    : "Open notifications"
                }
                aria-expanded={notificationsOpen}
                aria-haspopup="dialog"
                onClick={() => {
                  setProfileOpen(false);
                  setNotificationsOpen((open) => !open);
                }}
              >
                <Bell size={17} strokeWidth={1.9} />
                {notificationCount > 0 && (
                  <span className="notification-badge" aria-hidden="true">
                    {notificationCount > 99 ? "99+" : notificationCount}
                  </span>
                )}
              </button>
              {notificationsOpen && (
                <div
                  className="notification-popover"
                  role="dialog"
                  aria-label="Recent notifications"
                >
                  <div className="notification-popover-head">
                    <div>
                      <strong>Notifications</strong>
                      <small>
                        {notificationCount
                          ? `${notificationCount} need attention`
                          : "You’re all caught up"}
                      </small>
                    </div>
                    {unread.length > 0 && (
                      <button type="button" onClick={markAllNotificationsRead}>
                        Mark all read
                      </button>
                    )}
                  </div>
                  <div className="notification-popover-list">
                    {recentNotifications.length ? (
                      recentNotifications.map((notice) => (
                        <button
                          type="button"
                          className={`notification-popover-item${notice.status === "sent" ? " is-unread" : ""}`}
                          key={notice.id}
                          onClick={() => {
                            setNotificationsOpen(false);
                            setTab("notifications");
                          }}
                        >
                          <span className="notification-item-icon">
                            <Bell size={14} />
                          </span>
                          <span>
                            <strong>
                              {notice.event_type.replaceAll("_", " ")}
                            </strong>
                            <small>
                              {typeof notice.payload.body === "string"
                                ? notice.payload.body
                                : `${notice.channel} notification`}
                            </small>
                            <time>{fmt(notice.created_at)}</time>
                          </span>
                          {notice.status === "sent" && (
                            <i aria-label="Unread" />
                          )}
                        </button>
                      ))
                    ) : (
                      <p className="notification-popover-empty">
                        No notifications yet.
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    className="notification-popover-footer"
                    onClick={() => {
                      setNotificationsOpen(false);
                      setTab("notifications");
                    }}
                  >
                    View all notifications <ChevronRight size={14} />
                  </button>
                </div>
              )}
            </div>
            <span className="topbar-divider" />
            <div className="profile-menu" ref={profileMenu}>
              <button
                type="button"
                className="profile-trigger"
                aria-label="Open account menu"
                aria-expanded={profileOpen}
                aria-haspopup="menu"
                onClick={() => {
                  setNotificationsOpen(false);
                  setProfileOpen((open) => !open);
                }}
              >
                <span className="avatar user-avatar">
                  {data.profile.name.slice(0, 2).toUpperCase()}
                </span>
                <span className="profile-name">
                  <strong>{data.profile.name}</strong>
                  <small>{data.profile.role.replaceAll("_", " ")}</small>
                </span>
                <ChevronDown
                  className={
                    profileOpen ? "profile-chevron is-open" : "profile-chevron"
                  }
                  size={14}
                />
              </button>
              {profileOpen && (
                <div className="profile-dropdown" role="menu">
                  <div className="profile-dropdown-heading">
                    <strong>{data.profile.name}</strong>
                    <small>{data.profile.email}</small>
                  </div>
                  <Link href="/account" role="menuitem">
                    <KeyRound size={16} />
                    <span>
                      Change password
                      <small>Update your sign-in password</small>
                    </span>
                  </Link>
                  <form action={signOut}>
                    <button type="submit" role="menuitem">
                      <LogOut size={16} />
                      <span>Sign out</span>
                    </button>
                  </form>
                </div>
              )}
            </div>
          </div>
        </header>
        <main id="main-content" className="main-content">
          {offline && (
            <p role="alert" className="alert">
              You’re offline. Reconnect before submitting changes.
            </p>
          )}
          {flash && (
            <div className="flash" role="status">
              {flash}
              <button onClick={() => setFlash("")} aria-label="Dismiss message">
                ×
              </button>
            </div>
          )}
          {(admin || tab !== "overview") && (
            <div className="page-heading">
              <div>
                <span className="eyebrow">
                  {admin
                    ? "BRILL CREATIONS / OPERATIONS"
                    : "YOUR CREATIVE WORKSPACE"}
                </span>
                <h1>
                  {tab === "overview"
                    ? `A clear view of what’s next.`
                    : visibleNavigation.find((n) => n.id === tab)?.label}
                </h1>
                <p>
                  {tab === "overview"
                    ? `Welcome back, ${data.profile.name.split(" ")[0]}. ${pending.length ? `You have ${pending.length} request${pending.length === 1 ? "" : "s"} awaiting approval.` : "Let’s make your next production a great one."}`
                    : tab === "calendar"
                      ? "Make space for your next great shoot. All times are in " +
                        zone +
                        "."
                      : tab === "contracts"
                        ? "Every session accounted for. Every allocation kept intact."
                        : "Keep your production moving with everything in one place."}
                </p>
              </div>
              <div className="row heading-actions">
                {admin && (
                  <Button variant="outline" onClick={() => openManage("block")}>
                    <Ban size={16} /> Block time
                  </Button>
                )}
                <Button onClick={() => openCreate()}>
                  <Plus size={17} />
                  {admin ? "New booking" : "Request a shoot"}
                </Button>
              </div>
            </div>
          )}
          {tab === "overview" && !admin && (
            <ClientHome
              name={data.profile.name.split(" ")[0]}
              available={monthAvailable}
              pending={pending.length}
              upcoming={upcoming}
              totalRemaining={total - used}
              formatDate={fmt}
              onRequest={() => openCreate()}
              onOpenBooking={setBookingId}
              onNavigate={setTab}
            />
          )}
          {tab === "overview" && admin && (
            <>
              <div className="stats-grid">
                <Stat
                  label={admin ? "SHOOTS TODAY" : "THIS MONTH AVAILABLE"}
                  value={
                    admin
                      ? data.bookings.filter(
                          (b) =>
                            fmt(b.start_at, "yyyy-MM-dd") === today &&
                            ["Confirmed", "Urgent Shoot"].includes(b.status),
                        ).length
                      : monthAvailable
                  }
                  note={
                    admin
                      ? "On today’s production schedule"
                      : "Sessions ready to book"
                  }
                  icon={<Video size={20} />}
                />
                <Stat
                  label="PENDING APPROVAL"
                  value={pending.length}
                  note="Awaiting a little green light"
                  icon={<Clock3 size={20} />}
                  amber
                />
                <Stat
                  label="UPCOMING SHOOTS"
                  value={upcoming.length}
                  note="Confirmed and on the calendar"
                  icon={<CalendarDays size={20} />}
                />
                <Stat
                  label={
                    admin ? "SESSIONS USED THIS MONTH" : "CONTRACT REMAINING"
                  }
                  value={admin ? thisMonthUsed : total - used}
                  note={
                    admin
                      ? "Completed, late cancellations & no-shows"
                      : `Of ${total} contracted sessions`
                  }
                  icon={<CheckCircle2 size={20} />}
                />
              </div>
              <div className="overview-grid">
                <section className="panel">
                  <div className="section-heading">
                    <div>
                      <h2>Coming up next</h2>
                      <p>Your next confirmed productions.</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setTab("calendar")}
                    >
                      View calendar <ArrowUpRight size={15} />
                    </Button>
                  </div>
                  {upcoming.length ? (
                    <div className="upcoming-list">
                      {upcoming.slice(0, 4).map((b) => (
                        <button
                          className="upcoming-item"
                          key={b.id}
                          onClick={() => setBookingId(b.id)}
                        >
                          <span className="date-tile">
                            <small>{fmt(b.start_at, "MMM")}</small>
                            <strong>{fmt(b.start_at, "dd")}</strong>
                          </span>
                          <span className="upcoming-copy">
                            <strong>
                              {admin ? name(b.organization_id) : b.subject}
                            </strong>
                            <small>
                              {b.subject} · {b.location}
                            </small>
                            <span>
                              {fmt(b.start_at, "EEE, HH:mm")} –{" "}
                              {fmt(b.end_at, "HH:mm")}
                            </span>
                          </span>
                          <Status value={b.status} />
                          <ChevronRight size={18} />
                        </button>
                      ))}
                    </div>
                  ) : (
                    <Empty
                      title="Your next shoot starts here"
                      text="Approved bookings will appear on your production schedule."
                      action={() => openCreate()}
                      actionLabel="Create a request"
                    />
                  )}
                </section>
                <section className="production-note">
                  <span className="eyebrow">A LITTLE PREP GOES A LONG WAY</span>
                  <Clapperboard size={38} strokeWidth={1.3} />
                  <h2>
                    Ready before
                    <br />
                    the camera rolls.
                  </h2>
                  <p>
                    Share your script, content plan and references ahead of the
                    shoot. Great preparation makes room for great ideas.
                  </p>
                  <Button variant="outline" onClick={() => setTab("bookings")}>
                    Review your bookings <ArrowUpRight size={15} />
                  </Button>
                  <span className="note-footer">PLAN. PREPARE. CREATE.</span>
                </section>
              </div>
              <section className="panel">
                <div className="section-heading">
                  <div>
                    <h2>
                      Requests to review{" "}
                      <span className="count">{pending.length}</span>
                    </h2>
                    <p>
                      Every request needs Brill approval before it’s confirmed.
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setTab("bookings");
                      setFilter("Pending Approval");
                    }}
                  >
                    View all <ArrowUpRight size={15} />
                  </Button>
                </div>
                {bookingsTable(pending.slice(0, 5))}
              </section>
              {admin && (
                <div className="attention-grid">
                  <button onClick={() => setTab("notifications")}>
                    <Bell size={19} />
                    <span>
                      <strong>{failed.length} delivery failures</strong>
                      <small>Review and retry notifications</small>
                    </span>
                    <ChevronRight size={18} />
                  </button>
                  <button onClick={() => setTab("contracts")}>
                    <Wallet size={19} />
                    <span>
                      <strong>
                        {
                          data.allocations.filter(
                            (a) =>
                              a.month.startsWith(month) && a.remaining <= 1,
                          ).length
                        }{" "}
                        allocations need attention
                      </strong>
                      <small>Check client session balances</small>
                    </span>
                    <ChevronRight size={18} />
                  </button>
                </div>
              )}
            </>
          )}
          {tab === "calendar" && (
            <Calendar
              data={data}
              onOpen={(b) => setBookingId(b.id)}
              onCreate={openCreate}
            />
          )}
          {tab === "bookings" && (
            <section className="panel">
              <div className="section-heading">
                <div className="search-field">
                  <Search size={17} />
                  <input
                    aria-label="Search bookings"
                    placeholder="Search client, subject or location…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <select
                  aria-label="Booking status"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                >
                  <option value="">All statuses</option>
                  {Array.from(new Set(data.bookings.map((b) => b.status))).map(
                    (s) => (
                      <option key={s}>{s}</option>
                    ),
                  )}
                </select>
              </div>
              {bookingsTable(visible)}
            </section>
          )}
          {tab === "contracts" && (
            <>
              <div className="toolbar">
                {superAdmin && (
                  <>
                    <Button onClick={() => openManage("contract")}>
                      <Plus size={16} /> Add contract
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => openManage("extend_contract")}
                    >
                      Extend contract
                    </Button>
                  </>
                )}
                {admin && (
                  <>
                    <Button
                      variant="outline"
                      onClick={() => openManage("carry")}
                    >
                      Carry forward
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => openManage("adjustment")}
                    >
                      Adjust allowance
                    </Button>
                  </>
                )}
              </div>
              {data.contracts.length ? (
                data.contracts.map((c) => {
                  const balance =
                    data.balances.find((b) => b.contract_id === c.id)
                      ?.total_remaining ?? 0;
                  return (
                    <section className="panel contract-panel" key={c.id}>
                      <div className="section-heading">
                        <div>
                          <span className="eyebrow">
                            {name(c.organization_id)}
                          </span>
                          <h2>{c.monthly_allowance} sessions / month</h2>
                          <p>
                            {c.start_date} — {c.end_date}
                          </p>
                        </div>
                        <div>
                          <span className="balance-large">
                            {balance}
                            <small>of {c.total_entitlement} remaining</small>
                          </span>
                          {superAdmin && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                openManage("contract_policy", {
                                  ...c,
                                } as unknown as Record<string, Json>)
                              }
                            >
                              Edit contract rules
                            </Button>
                          )}
                        </div>
                      </div>
                      <div className="contract-progress">
                        <span
                          style={{
                            width: `${Math.min(100, Math.max(0, (balance / c.total_entitlement) * 100))}%`,
                          }}
                        />
                      </div>
                      <div className="contract-tags">
                        <span>
                          Future usage:{" "}
                          {c.allow_future_usage
                            ? c.advance_policy === "numeric"
                              ? `up to ${c.max_advance_sessions}`
                              : c.advance_policy
                            : "disabled"}
                        </span>
                        <span>
                          Carry-forward:{" "}
                          {c.allow_carry_forward
                            ? `${c.carry_forward_expiry_months} month expiry`
                            : "disabled"}
                        </span>
                        <span>
                          {c.lead_time_days ?? data.rules.lead_time_days}{" "}
                          working days lead time
                        </span>
                      </div>
                      <div className="table-scroll">
                        <table>
                          <thead>
                            <tr>
                              <th>Allocation month</th>
                              <th>Original</th>
                              <th>Normal used / reserved</th>
                              <th>Advance used</th>
                              <th>Carry available</th>
                              <th>Remaining</th>
                            </tr>
                          </thead>
                          <tbody>
                            {data.allocations
                              .filter((a) => a.contract_id === c.id)
                              .sort((a, b) => a.month.localeCompare(b.month))
                              .map((a) => (
                                <tr key={a.id}>
                                  <td>{a.month.slice(0, 7)}</td>
                                  <td>{a.original_allocation}</td>
                                  <td>{a.normal_sessions_used}</td>
                                  <td>{a.advance_sessions_used}</td>
                                  <td>{a.carry_forward_received}</td>
                                  <td>
                                    <strong>{a.remaining}</strong>
                                  </td>
                                </tr>
                              ))}
                          </tbody>
                        </table>
                      </div>
                      {data.carry
                        .filter((cf) => cf.contract_id === c.id)
                        .map((cf) => (
                          <div className="carry-note" key={cf.id}>
                            Carry-forward from {cf.source_month.slice(0, 7)} →{" "}
                            {cf.target_month.slice(0, 7)} ·{" "}
                            {cf.amount - cf.used} of {cf.amount} remaining ·
                            expires {cf.expires_at}
                          </div>
                        ))}
                    </section>
                  );
                })
              ) : (
                <Empty
                  title="No contracts yet"
                  text="Add a client contract to create monthly allocations and begin booking."
                />
              )}
            </>
          )}
          {tab === "clients" && admin && (
            <>
              <div className="toolbar">
                {superAdmin && (
                  <>
                    <Button onClick={() => openManage("organization")}>
                      <Plus size={16} /> Add client
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => openManage("invite")}
                    >
                      Add user
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => openManage("profile")}
                    >
                      Manage user access
                    </Button>
                  </>
                )}
              </div>
              <section className="panel">
                <div className="section-heading">
                  <h2>Client directory</h2>
                  <span className="count">{data.organizations.length}</span>
                </div>
                <div className="client-grid">
                  {data.organizations.map((o) => (
                    <div className="client-card" key={o.id}>
                      <span className="avatar">
                        {o.name.slice(0, 2).toUpperCase()}
                      </span>
                      <h3>{o.name}</h3>
                      <Status value={o.status} />
                      <p>
                        {
                          data.contracts.filter(
                            (c) => c.organization_id === o.id,
                          ).length
                        }{" "}
                        contracts ·{" "}
                        {
                          data.bookings.filter(
                            (b) => b.organization_id === o.id,
                          ).length
                        }{" "}
                        bookings
                      </p>
                      <div className="client-card-actions">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setTab("contracts")}
                        >
                          View contracts
                        </Button>
                        {superAdmin && (
                          <>
                            <Button
                              size="sm"
                              onClick={() =>
                                openManage("contract", {
                                  organization_id: o.id,
                                })
                              }
                            >
                              <Plus size={14} /> Add contract
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                openManage("organization", {
                                  id: o.id,
                                  name: o.name,
                                })
                              }
                            >
                              Edit client
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
              <section className="panel">
                <div className="section-heading">
                  <h2>Workspace users</h2>
                </div>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Email</th>
                        <th>Organization</th>
                        <th>Role</th>
                        <th>Status</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {data.profiles.map((p) => (
                        <tr key={p.id}>
                          <td>{p.name}</td>
                          <td>{p.email}</td>
                          <td>
                            {p.organization_id
                              ? name(p.organization_id)
                              : "Brill Creations"}
                          </td>
                          <td>{p.role.replaceAll("_", " ")}</td>
                          <td>{p.status}</td>
                          <td>
                            {superAdmin && (
                              <>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() =>
                                    openManage("profile", {
                                      ...p,
                                    } as unknown as Record<string, Json>)
                                  }
                                >
                                  Edit
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() =>
                                    openManage("reset_password", { id: p.id })
                                  }
                                >
                                  Reset password
                                </Button>
                              </>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}
          {tab === "resources" && admin && (
            <>
              <div className="toolbar">
                <Button onClick={() => openManage("resource")}>
                  <Plus size={16} /> Add resource
                </Button>
                <Button variant="outline" onClick={() => openManage("block")}>
                  Block time / full day
                </Button>
              </div>
              <section className="panel">
                <div className="section-heading">
                  <h2>Teams & resources</h2>
                </div>
                <div className="client-grid">
                  {data.resources.map((r) => (
                    <div className="client-card" key={r.id}>
                      <Users size={24} />
                      <h3>{r.name}</h3>
                      <p>
                        {r.kind} · {r.active ? "Active" : "Inactive"}
                      </p>
                    </div>
                  ))}
                </div>
              </section>
              <section className="panel">
                <div className="section-heading">
                  <h2>Blocked periods</h2>
                </div>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Reason</th>
                        <th>Start</th>
                        <th>End</th>
                        <th>Resource</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {data.blocks.map((b) => (
                        <tr key={b.id}>
                          <td>
                            <strong>{b.block_type}</strong>
                            <small>{b.reason}</small>
                          </td>
                          <td>{fmt(b.start_at)}</td>
                          <td>{fmt(b.end_at)}</td>
                          <td>
                            {data.resources.find((r) => r.id === b.resource_id)
                              ?.name || "All resources"}
                          </td>
                          <td>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setRemoveBlock(b.id)}
                            >
                              Unblock
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}
          {tab === "notifications" && (
            <section className="panel">
              <div className="section-heading">
                <div>
                  <h2>Notification center</h2>
                  <p>System updates and delivery status, all in one place.</p>
                </div>
                {superAdmin && (
                  <Button
                    variant="outline"
                    onClick={() => openManage("template")}
                  >
                    New template
                  </Button>
                )}
              </div>
              {notificationGroups.length ? (
                notificationGroups.map((group) => {
                  const notice = group[0];
                  const failedNotices = group.filter(
                    (item) => item.status === "failed",
                  );
                  const channels = [
                    ...new Set(group.map((item) => item.channel)),
                  ].join(", ");
                  return (
                    <div className="notification-row" key={notice.id}>
                      <span className="icon-tile">
                        <Bell size={18} />
                      </span>
                      <div>
                        <strong>{notice.event_type}</strong>
                        <p>
                          {channels} · {fmt(notice.created_at)}
                          {group.length > 1
                            ? ` · ${group.length} deliveries`
                            : ""}
                        </p>
                        {failedNotices[0]?.failure_reason && (
                          <small className="field-error">
                            {failedNotices[0].failure_reason}
                          </small>
                        )}
                      </div>
                      <Status
                        value={
                          failedNotices.length
                            ? `${failedNotices.length} failed`
                            : "sent"
                        }
                      />
                      {admin && failedNotices.length > 0 && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            retryFailedNotifications(
                              failedNotices.map((item) => item.id),
                            )
                          }
                        >
                          <RefreshCw size={14} /> Retry failed
                        </Button>
                      )}
                    </div>
                  );
                })
              ) : (
                <Empty
                  title="You’re all caught up"
                  text="Booking updates will appear here."
                />
              )}
              {superAdmin && (
                <div className="detail-section template-list">
                  <h3>Notification templates</h3>
                  {data.templates.map((t) => (
                    <button
                      key={t.id}
                      className="file-row"
                      onClick={() =>
                        openManage("template", { ...t } as unknown as Record<
                          string,
                          Json
                        >)
                      }
                    >
                      {t.event_type} · {t.channel}
                      <ChevronRight size={17} />
                    </button>
                  ))}
                </div>
              )}
            </section>
          )}
          {tab === "logs" && (
            <section className="panel">
              <div className="section-heading">
                <div>
                  <h2>Production handoff</h2>
                  <p>
                    Completed shoots create a local record. External delivery is
                    tracked separately.
                  </p>
                </div>
              </div>
              {data.logs.length ? (
                data.logs.map((log) => (
                  <div className="notification-row" key={log.id}>
                    <span className="icon-tile">
                      <Clapperboard size={20} />
                    </span>
                    <div>
                      <strong>
                        {String(log.payload.subject || "Completed shoot")}
                      </strong>
                      <p>
                        {name(log.organization_id)} ·{" "}
                        {String(log.payload.shoot_type)}
                      </p>
                      <small>
                        {log.actual_start
                          ? `Actual: ${fmt(log.actual_start)}`
                          : "Actual timing awaiting update"}
                      </small>
                      {log.failure_reason && (
                        <small className="field-error">
                          {log.failure_reason}
                        </small>
                      )}
                    </div>
                    <Status value={log.status} />
                    {admin && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          openManage("shooting_log", {
                            id: log.id,
                            production_notes: log.production_notes,
                            post_shoot_confirmed: log.post_shoot_confirmed,
                          })
                        }
                      >
                        Update / retry
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setBookingId(log.booking_id)}
                    >
                      Booking
                    </Button>
                  </div>
                ))
              ) : (
                <Empty
                  title="From calendar to production history"
                  text="Mark a confirmed shoot completed to create its Shooting Log record."
                />
              )}
            </section>
          )}
          {tab === "reports" && (
            <>
              <div className="stats-grid">
                <Stat
                  label="CONTRACT ENTITLEMENT"
                  value={total}
                  note="Original contracted sessions"
                  icon={<Wallet size={20} />}
                />
                <Stat
                  label="USED / RESERVED"
                  value={used}
                  note="Net ledger deductions"
                  icon={<CheckCircle2 size={20} />}
                />
                <Stat
                  label="CONTRACT REMAINING"
                  value={total - used}
                  note="Across visible contracts"
                  icon={<CalendarDays size={20} />}
                />
                <Stat
                  label="FUTURE SESSIONS USED"
                  value={data.balances.reduce((n, b) => n + b.future_used, 0)}
                  note="Original allocations preserved"
                  icon={<Clock3 size={20} />}
                />
              </div>
              <section className="panel">
                <div className="section-heading">
                  <div>
                    <h2>Session ledger</h2>
                    <p>
                      An append-only record of every allocation, reservation and
                      restoration.
                    </p>
                  </div>
                  <Button variant="outline" onClick={exportLedger}>
                    <Download size={16} /> Export CSV
                  </Button>
                </div>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Date / client</th>
                        <th>Transaction</th>
                        <th>Source month</th>
                        <th>Source</th>
                        <th>Quantity</th>
                        <th>Before → after</th>
                        <th>Reason</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.ledger.map((l) => (
                        <tr key={l.id}>
                          <td>
                            {fmt(l.created_at)}
                            <small>{name(l.organization_id)}</small>
                          </td>
                          <td>{l.transaction_type}</td>
                          <td>{l.allocation_month.slice(0, 7)}</td>
                          <td>{l.session_source}</td>
                          <td>
                            {l.quantity > 0 ? "+" : ""}
                            {l.quantity}
                          </td>
                          <td>
                            {l.balance_before} → {l.balance_after}
                          </td>
                          <td>{l.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}
          {tab === "audit" && admin && (
            <section className="panel">
              <div className="section-heading">
                <h2>Permanent activity history</h2>
              </div>
              <div className="audit-list">
                {data.audits.map((a) => (
                  <details key={a.id}>
                    <summary>
                      <span>{a.action}</span> {fmt(a.created_at)} ·{" "}
                      {data.profiles.find((p) => p.id === a.actor_user_id)
                        ?.name || "System"}
                      <ChevronRight size={14} />
                    </summary>
                    <div className="audit-diff">
                      <div>
                        <h4>Before</h4>
                        <pre>{JSON.stringify(a.old_values, null, 2)}</pre>
                      </div>
                      <div>
                        <h4>After</h4>
                        <pre>{JSON.stringify(a.new_values, null, 2)}</pre>
                      </div>
                    </div>
                    <pre>{JSON.stringify(a.metadata, null, 2)}</pre>
                  </details>
                ))}
              </div>
            </section>
          )}
          {tab === "settings" && admin && <Settings data={data} />}
          <footer className="app-footer">
            <span>BRILL CREATIONS</span>
            <span>Thoughtfully planned. Beautifully created.</span>
          </footer>
        </main>
      </div>
      <Dialog
        open={create}
        onOpenChange={setCreate}
        title={admin ? "New shooting booking" : "Request a shoot"}
        description="Choose a slot, share the details, and leave the coordination to Brill."
        wide
      >
        {create && (
          <BookingForm
            data={data}
            initialDate={initialDate}
            onSaved={(id) => {
              setCreate(false);
              setBookingId(id);
              setFlash(
                "Request saved. Approval is required before confirmation.",
              );
            }}
          />
        )}
      </Dialog>
      <Dialog
        open={Boolean(selected)}
        onOpenChange={(open) => {
          if (!open) setBookingId(null);
        }}
        title="Booking details"
        description="Your schedule, production details and complete activity history."
        wide
      >
        {selected && (
          <BookingDetail
            key={`${selected.id}-${selected.status}-${selected.proposed_start}`}
            booking={selected}
            data={data}
            onDone={() => {
              setBookingId(null);
              setFlash("Booking updated successfully.");
            }}
          />
        )}
      </Dialog>
      <Dialog
        open={Boolean(manage)}
        onOpenChange={(open) => {
          if (!open) setManage("");
        }}
        title={(manage === "invite" ? "Create user" : manage)
          .replaceAll("_", " ")
          .replace(/^./, (s) => s.toUpperCase())}
        description="Changes are permission-checked and recorded in the audit history."
        wide
      >
        {manage && (
          <ManagementForm
            key={manage + JSON.stringify(initial)}
            kind={manage}
            data={data}
            initial={initial}
            onDone={success}
          />
        )}
      </Dialog>
      <Dialog
        open={Boolean(removeBlock)}
        onOpenChange={(open) => {
          if (!open) setRemoveBlock(null);
        }}
        title="Remove blocked period?"
        description="This time will become available for booking again."
      >
        <div className="dialog-body">
          <Button
            variant="destructive"
            onClick={async () => {
              const result = await manageRecord("remove_block", {
                id: removeBlock!,
                reason: "Removed through availability management",
              });
              setFlash(result.error || "Time unblocked.");
              setRemoveBlock(null);
            }}
          >
            Confirm unblock
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
function ClientHome({
  name,
  available,
  pending,
  upcoming,
  totalRemaining,
  formatDate,
  onRequest,
  onOpenBooking,
  onNavigate,
}: {
  name: string;
  available: number;
  pending: number;
  upcoming: Booking[];
  totalRemaining: number;
  formatDate: (date: string, pattern?: string) => string;
  onRequest: () => void;
  onOpenBooking: (id: string) => void;
  onNavigate: (tab: string) => void;
}) {
  const nextShoot = upcoming[0];
  return (
    <div className="client-home">
      <section className="client-welcome">
        <div>
          <span className="eyebrow">WELCOME BACK, {name.toUpperCase()}</span>
          <h1>Ready for your next shoot?</h1>
          <p>
            Choose a date and tell us what you need. Brill will handle the rest.
          </p>
        </div>
        <Button onClick={onRequest}>
          <Plus size={18} /> Request a shoot
        </Button>
      </section>

      <div className="client-quick-stats">
        <button onClick={() => onNavigate("contracts")}>
          <span className="client-stat-icon">
            <Video size={20} />
          </span>
          <span>
            <strong>{available}</strong>
            <small>Available this month</small>
          </span>
          <ChevronRight size={18} />
        </button>
        <button onClick={() => onNavigate("bookings")}>
          <span className="client-stat-icon amber">
            <Clock3 size={20} />
          </span>
          <span>
            <strong>{pending}</strong>
            <small>Waiting for approval</small>
          </span>
          <ChevronRight size={18} />
        </button>
        <button onClick={() => onNavigate("contracts")}>
          <span className="client-stat-icon">
            <CheckCircle2 size={20} />
          </span>
          <span>
            <strong>{totalRemaining}</strong>
            <small>Total sessions left</small>
          </span>
          <ChevronRight size={18} />
        </button>
      </div>

      <div className="client-home-grid">
        <section className="client-next-shoot">
          <div className="client-section-title">
            <div>
              <span className="eyebrow">YOUR SCHEDULE</span>
              <h2>Next shoot</h2>
            </div>
            <button onClick={() => onNavigate("calendar")}>
              Open calendar <ArrowUpRight size={14} />
            </button>
          </div>
          {nextShoot ? (
            <button
              className="client-shoot-card"
              onClick={() => onOpenBooking(nextShoot.id)}
            >
              <span className="client-date-card">
                <small>{formatDate(nextShoot.start_at, "MMM")}</small>
                <strong>{formatDate(nextShoot.start_at, "dd")}</strong>
                <em>{formatDate(nextShoot.start_at, "EEE")}</em>
              </span>
              <span className="client-shoot-copy">
                <Status value={nextShoot.status} />
                <strong>{nextShoot.subject}</strong>
                <small>
                  {formatDate(nextShoot.start_at, "HH:mm")} –{" "}
                  {formatDate(nextShoot.end_at, "HH:mm")}
                </small>
                <small>{nextShoot.location}</small>
              </span>
              <ChevronRight size={20} />
            </button>
          ) : (
            <div className="client-empty-shoot">
              <span className="client-empty-icon">
                <CalendarDays size={28} />
              </span>
              <div>
                <h3>No shoot booked yet</h3>
                <p>Your confirmed shoot will appear here.</p>
              </div>
              <Button variant="outline" size="sm" onClick={onRequest}>
                Choose a date
              </Button>
            </div>
          )}
        </section>

        <section className="client-how-it-works">
          <span className="eyebrow">SIMPLE FROM START TO FINISH</span>
          <h2>How booking works</h2>
          <ol>
            <li>
              <span>1</span>
              <div>
                <strong>Send your request</strong>
                <small>Pick a date and share the shoot details.</small>
              </div>
            </li>
            <li>
              <span>2</span>
              <div>
                <strong>Brill confirms it</strong>
                <small>We review availability and approve your slot.</small>
              </div>
            </li>
            <li>
              <span>3</span>
              <div>
                <strong>Get ready to create</strong>
                <small>Your confirmed shoot appears on the calendar.</small>
              </div>
            </li>
          </ol>
        </section>
      </div>
    </div>
  );
}
function Stat({
  label,
  value,
  note,
  icon,
  amber = false,
}: {
  label: string;
  value: number;
  note: string;
  icon: React.ReactNode;
  amber?: boolean;
}) {
  return (
    <section className="stat-card">
      <div>
        <span>{label}</span>
        <i className={amber ? "amber-icon" : ""}>{icon}</i>
      </div>
      <strong>{String(value).padStart(2, "0")}</strong>
      <small>{note}</small>
    </section>
  );
}
function Empty({
  title,
  text,
  action,
  actionLabel,
}: {
  title: string;
  text: string;
  action?: () => void;
  actionLabel?: string;
}) {
  return (
    <div className="empty-state">
      <CalendarDays size={30} strokeWidth={1.4} />
      <h3>{title}</h3>
      <p>{text}</p>
      {action && (
        <Button variant="outline" size="sm" onClick={action}>
          {actionLabel}
          <ArrowUpRight size={14} />
        </Button>
      )}
    </div>
  );
}
