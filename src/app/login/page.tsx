import { ArrowRight } from "lucide-react";
import { redirect } from "next/navigation";
import Link from "next/link";
import { signIn } from "@/server/actions";
import { hasAccounts } from "@/server/auth";
import { PasswordField } from "@/components/password-field";
import { BrandLogo } from "@/components/brand-logo";
export const dynamic = "force-dynamic";
export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (!(await hasAccounts())) redirect("/setup");
  const { error } = await searchParams;
  return (
    <main className="login">
      <section className="login-brand">
        <div className="brand">
          <BrandLogo priority />
        </div>
        <div>
          <span className="eyebrow">MAKE ROOM FOR GREAT WORK</span>
          <h1>
            Less back-and-forth.
            <br />
            More action.
          </h1>
          <p>Your next production starts here.</p>
        </div>
        <small>BRILL CREATIONS · PRODUCTION WORKSPACE</small>
      </section>
      <section className="login-form">
        <span className="eyebrow">WELCOME BACK</span>
        <h2>Let’s get you on set.</h2>
        <p>Sign in to your shooting calendar.</p>
        {error && (
          <p className="alert" role="alert">
            {error}
          </p>
        )}
        <form action={signIn}>
          <label>
            Email address
            <input name="email" type="email" required autoComplete="email" />
          </label>
          <PasswordField
            name="password"
            label="Password"
            autoComplete="current-password"
          />
          <button className="button button-primary">
            Sign in <ArrowRight size={17} />
          </button>
        </form>
        <p className="auth-switch">
          New to Brill Creations? <Link href="/signup">Create an account</Link>
        </p>
        <small>Need a password reset? Contact your Brill administrator.</small>
      </section>
    </main>
  );
}
