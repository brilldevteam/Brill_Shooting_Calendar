import { ShieldCheck } from "lucide-react";
import { initializeWorkspace } from "@/server/actions";
import { PasswordField } from "@/components/password-field";
import { BrandLogo } from "@/components/brand-logo";
export function Setup({ error }: { error?: string }) {
  return (
    <main className="login">
      <section className="login-brand">
        <div className="brand">
          <BrandLogo priority />
        </div>
        <div>
          <span className="eyebrow">YOUR PRODUCTION WORKSPACE</span>
          <h1>
            Great shoots start
            <br />
            with a clear plan.
          </h1>
          <p>One calendar. Your clients. Your crew.</p>
        </div>
        <small>BRILL CREATIONS · READY TO CREATE</small>
      </section>
      <section className="login-form">
        <span className="eyebrow">FIRST-TIME SETUP</span>
        <h2>Make this workspace yours.</h2>
        <p>Create the first administrator to get started.</p>
        {error && (
          <p className="alert" role="alert">
            {error}
          </p>
        )}
        <form action={initializeWorkspace}>
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
            Email address
            <input name="email" type="email" required autoComplete="email" />
          </label>
          <PasswordField
            name="password"
            label="Password"
            minLength={12}
            maxLength={256}
            autoComplete="new-password"
            hint="At least 12 characters."
          />
          <button className="button button-primary">Create workspace</button>
        </form>
        <div className="setup-note">
          <ShieldCheck size={18} />
          <span>
            Your account, bookings and files are stored privately on this
            application’s server.
          </span>
        </div>
      </section>
    </main>
  );
}
