import { redirect } from "next/navigation";
import { hasAccounts } from "@/server/auth";
import { Setup } from "@/components/setup";
export const dynamic = "force-dynamic";
export default async function SetupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (await hasAccounts()) redirect("/login");
  return <Setup error={(await searchParams).error} />;
}
