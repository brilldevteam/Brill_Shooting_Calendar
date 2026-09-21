import { redirect } from "next/navigation";
import { getProfile, hasAccounts } from "@/server/auth";
import { loadPortal } from "@/server/data";
import { Portal } from "@/components/portal";
export const dynamic = "force-dynamic";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ booking?: string }>;
}) {
  if (!(await hasAccounts())) redirect("/setup");
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (profile.must_change_password) redirect("/account");
  return (
    <Portal
      data={await loadPortal()}
      initialBookingId={(await searchParams).booking}
    />
  );
}
