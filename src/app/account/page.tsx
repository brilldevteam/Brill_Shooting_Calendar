import { updatePassword } from "@/server/actions";
import { getProfile } from "@/server/auth";
import { redirect } from "next/navigation";
import { PasswordField } from "@/components/password-field";
export default async function Account({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const profile = await getProfile();
  if (!profile) redirect("/login");
  return (
    <main className="account panel">
      <h1>Set your password</h1>
      <p>Use at least 12 characters.</p>
      {error && (
        <p role="alert" className="alert">
          {error}
        </p>
      )}
      <form action={updatePassword}>
        {!profile.must_change_password && (
          <PasswordField
            name="current_password"
            label="Current password"
            autoComplete="current-password"
          />
        )}
        <PasswordField
          name="password"
          label="New password"
          minLength={12}
          maxLength={256}
          autoComplete="new-password"
        />
        <button className="button button-primary">Save password</button>
      </form>
    </main>
  );
}
