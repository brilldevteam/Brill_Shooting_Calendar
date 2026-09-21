import { notFound } from "next/navigation";
import Link from "next/link";
import { Portal } from "@/components/portal";
export const dynamic = "force-dynamic";
export default async function Preview({
  searchParams,
}: {
  searchParams: Promise<{ role?: string }>;
}) {
  if (process.env.NODE_ENV !== "development") notFound();
  const { portalFixture } = await import("../../../tests/fixtures/portal");
  const client = (await searchParams).role === "client";
  return (
    <>
      <div className="preview-banner">
        INTERFACE PREVIEW · Fictional data · Saving requires a signed-in
        workspace.{" "}
        <Link href={client ? "/preview" : "/preview?role=client"}>
          View {client ? "admin" : "client"} portal
        </Link>
        <Link href="/">Setup</Link>
      </div>
      <Portal data={portalFixture(client)} />
    </>
  );
}
