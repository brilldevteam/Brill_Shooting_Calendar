import { ArrowRight, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { signUp } from "@/server/actions";
import { getProfile, hasAccounts } from "@/server/auth";
import { PasswordField } from "@/components/password-field";
import { BrandLogo } from "@/components/brand-logo";

export const dynamic = "force-dynamic";

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (!(await hasAccounts())) redirect("/setup");
  if (await getProfile()) redirect("/");
  const { error } = await searchParams;
  return (
    <main className="login signup-page">
      <section className="login-brand">
        <div className="brand">
          <BrandLogo priority />
        </div>
        <div>
          <span className="eyebrow">YOUR PRODUCTION CALENDAR</span>
          <h1>
            Plan the shoot.
            <br />
            Keep everyone ready.
          </h1>
          <p>Create your client workspace and request your first production.</p>
        </div>
        <small>BRILL CREATIONS · PRODUCTION WORKSPACE</small>
      </section>
      <section className="login-form signup-form">
        <span className="eyebrow">CREATE AN ACCOUNT</span>
        <h2>Start your client workspace.</h2>
        <p>
          Use your work details. You will be signed in when the account is
          ready.
        </p>
        {error && (
          <p className="alert" role="alert">
            {error}
          </p>
        )}
        <form action={signUp}>
          <div className="auth-field-grid">
            <label>
              Your name
              <input
                name="name"
                required
                minLength={2}
                maxLength={150}
                autoComplete="name"
              />
            </label>
            <label>
              Company name
              <input
                name="organization"
                required
                minLength={2}
                maxLength={180}
                autoComplete="organization"
              />
            </label>
          </div>
          <label>
            Email address
            <input name="email" type="email" required autoComplete="email" />
          </label>
          <label>
            Phone number <span className="optional-label">Optional</span>
            <input name="phone" type="tel" maxLength={40} autoComplete="tel" />
          </label>
          <PasswordField
            name="password"
            label="Password"
            minLength={12}
            maxLength={256}
            autoComplete="new-password"
            hint="Use at least 12 characters."
          />
          <PasswordField
            name="confirm_password"
            label="Confirm password"
            minLength={12}
            maxLength={256}
            autoComplete="new-password"
          />
          <button className="button button-primary">
            Create account <ArrowRight size={17} />
          </button>
        </form>
        <p className="auth-switch">
          Already have an account? <Link href="/login">Sign in</Link>
        </p>
        <div className="setup-note">
          <ShieldCheck size={18} />
          <span>
            Your account and production details stay private to your client
            workspace.
          </span>
        </div>
      </section>
    </main>
  );
}
