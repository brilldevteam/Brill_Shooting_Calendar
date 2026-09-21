import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { sendBookingNotifications } from "@/services/notifications";
import { publishShootingLogs } from "@/services/shooting-log";
export async function POST(request: Request) {
  const expected = process.env.CRON_SECRET;
  const received =
    request.headers.get("authorization")?.replace(/^Bearer /, "") || "";
  if (
    !expected ||
    expected.length < 32 ||
    Buffer.byteLength(expected) !== Buffer.byteLength(received) ||
    !timingSafeEqual(Buffer.from(expected), Buffer.from(received))
  )
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const notifications = await sendBookingNotifications();
  const logs = await publishShootingLogs();
  return NextResponse.json({ notifications, logs });
}
