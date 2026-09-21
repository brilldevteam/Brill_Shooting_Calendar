"use client";
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <main className="account panel">
      <h1>We couldn’t load your workspace.</h1>
      <p role="alert">{error.message}</p>
      <p>
        Check that the application server can access its data folder, then try
        again.
      </p>
      <button className="button button-primary" onClick={reset}>
        Try again
      </button>
      <a href="/login" className="button button-outline">
        Sign in
      </a>
    </main>
  );
}
