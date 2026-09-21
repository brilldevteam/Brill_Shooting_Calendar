import Link from "next/link";
export default function NotFound() {
  return (
    <main className="account panel">
      <h1>This page isn’t available.</h1>
      <Link href="/" className="button button-primary">
        Back to workspace
      </Link>
    </main>
  );
}
