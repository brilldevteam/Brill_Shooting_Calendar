"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { randomUUID, randomBytes } from "node:crypto";
import { z } from "zod";
import { getDatabase, runCommand, systemQuery, userQuery } from "./database";
import {
  requireProfile,
  getProfile,
  createSession,
  deleteSession,
} from "./auth";
import { hashPassword, verifyPassword, tokenHash } from "./passwords";
import { rulesSchema } from "@/validation/management";
import { bookingSchema } from "@/validation/booking";
import type { Json, Audit, BusySlot } from "@/types/domain";
export async function initializeWorkspace(form: FormData) {
  let error = "";
  let id = "";
  try {
    const name = z.string().trim().min(2).max(150).parse(form.get("name"));
    const email = z.email().parse(form.get("email")).toLowerCase();
    const passwordHash = await hashPassword(String(form.get("password")));
    id = randomUUID();
    const db = await getDatabase();
    await db.transaction(async (tx) => {
      await tx.exec("lock table auth.users in exclusive mode");
      if ((await tx.query("select id from auth.users limit 1")).rows.length)
        throw new Error("Workspace is already initialized. Sign in.");
      await tx.query(
        "insert into auth.users(id,email,password_hash) values($1,$2,$3)",
        [id, email, passwordHash],
      );
      await tx.query(
        "insert into profiles(id,role,name,email) values($1,'super_admin',$2,$3)",
        [id, name, email],
      );
    });
  } catch (e) {
    error = (e as Error).message;
  }
  if (error) redirect(`/setup?error=${encodeURIComponent(error)}`);
  await createSession(id);
  redirect("/");
}
export async function signIn(form: FormData) {
  const email = String(form.get("email") || "")
    .trim()
    .toLowerCase();
  const password = String(form.get("password") || "");
  let id = "";
  let change = false;
  try {
    const key = tokenHash(email);
    const limits = await systemQuery<{ attempts: number }>(
      "insert into auth.login_attempts(key,attempts) values($1,1) on conflict(key) do update set attempts=case when login_attempts.window_start<now()-interval '15 minutes' then 1 else login_attempts.attempts+1 end,window_start=case when login_attempts.window_start<now()-interval '15 minutes' then now() else login_attempts.window_start end returning attempts",
      [key],
    );
    if (limits[0].attempts > 10) throw new Error("Rate limited");
    const users = await systemQuery<{
      id: string;
      password_hash: string;
      must_change_password: boolean;
    }>(
      "select u.id,u.password_hash,u.must_change_password from auth.users u join profiles p on p.id=u.id where u.email=$1 and p.status='active'",
      [email],
    );
    if (!users[0] || !(await verifyPassword(password, users[0].password_hash)))
      throw new Error("Invalid credentials");
    id = users[0].id;
    change = users[0].must_change_password;
    await systemQuery("delete from auth.login_attempts where key=$1", [key]);
  } catch {
    redirect(
      "/login?error=Sign-in%20failed.%20Check%20your%20credentials%20or%20try%20again%20in%2015%20minutes.",
    );
  }
  await createSession(id);
  redirect(change ? "/account" : "/");
}
export async function signUp(form: FormData) {
  let id = "";
  let error = "";
  try {
    const name = z.string().trim().min(2).max(150).parse(form.get("name"));
    const organization = z
      .string()
      .trim()
      .min(2)
      .max(180)
      .parse(form.get("organization"));
    const email = z.email().parse(form.get("email")).toLowerCase();
    const phoneValue = String(form.get("phone") || "").trim();
    const phone = phoneValue ? z.string().max(40).parse(phoneValue) : null;
    const password = String(form.get("password") || "");
    if (password !== String(form.get("confirm_password") || ""))
      throw new Error("Passwords do not match.");
    const passwordHash = await hashPassword(password);
    id = randomUUID();
    const organizationId = randomUUID();
    const signupKey = `signup:${tokenHash(email)}`;
    const attempts = await systemQuery<{ attempts: number }>(
      "insert into auth.login_attempts(key,attempts) values($1,1) on conflict(key) do update set attempts=case when login_attempts.window_start<now()-interval '1 hour' then 1 else login_attempts.attempts+1 end,window_start=case when login_attempts.window_start<now()-interval '1 hour' then now() else login_attempts.window_start end returning attempts",
      [signupKey],
    );
    if (attempts[0].attempts > 5)
      throw new Error("Too many sign-up attempts. Try again in one hour.");
    const db = await getDatabase();
    await db.transaction(async (tx) => {
      await tx.exec("lock table auth.users in exclusive mode");
      if (
        (await tx.query("select id from auth.users where email=$1", [email]))
          .rows.length
      )
        throw new Error("An account already exists for this email.");
      await tx.query("insert into organizations(id,name) values($1,$2)", [
        organizationId,
        organization,
      ]);
      await tx.query(
        "insert into auth.users(id,email,password_hash) values($1,$2,$3)",
        [id, email, passwordHash],
      );
      await tx.query(
        "insert into profiles(id,organization_id,role,name,email,phone) values($1,$2,'client',$3,$4,$5)",
        [id, organizationId, name, email, phone],
      );
    });
    await systemQuery("delete from auth.login_attempts where key=$1", [
      signupKey,
    ]);
  } catch (e) {
    error =
      e instanceof z.ZodError
        ? "Check the details and try again."
        : (e as Error).message;
  }
  if (error) redirect(`/signup?error=${encodeURIComponent(error)}`);
  await createSession(id);
  redirect("/");
}
export async function signOut() {
  await deleteSession();
  redirect("/login");
}
export async function markMyNotificationsRead() {
  try {
    const { profile } = await requireProfile();
    await systemQuery(
      "update notifications set status='read' where recipient_user_id=$1 and channel='system' and status='sent'",
      [profile.id],
    );
    revalidatePath("/");
    return {};
  } catch (e) {
    return { error: (e as Error).message };
  }
}
export async function createBookingRequest(input: unknown) {
  try {
    const parsed = bookingSchema.parse(input);
    const { profile } = await requireProfile();
    const id = await runCommand(profile.id, "create_booking_request", {
      input:
        profile.role === "client" ? { ...parsed, resource_id: null } : parsed,
    });
    revalidatePath("/");
    return { id };
  } catch (e) {
    return { error: (e as Error).message };
  }
}
export async function bookingCommand(
  id: string,
  command: string,
  input: Record<string, Json> = {},
) {
  try {
    z.uuid().parse(id);
    const { profile } = await requireProfile();
    const result = await runCommand(profile.id, "booking_command", {
      bid: id,
      command,
      input,
    });
    revalidatePath("/");
    return { id: result };
  } catch (e) {
    return { error: (e as Error).message };
  }
}
export async function manageRecord(kind: string, input: Record<string, Json>) {
  try {
    if (kind === "settings") rulesSchema.parse(input.rules);
    const { profile } = await requireProfile();
    if (kind === "profile") {
      if (profile.role !== "super_admin")
        throw new Error("Super Admin required");
      const email = z.email().parse(input.email).toLowerCase();
      input.email = email;
      const db = await getDatabase();
      await db.transaction(async (tx) => {
        await tx.exec("set local role authenticated");
        await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [
          profile.id,
        ]);
        await tx.query("select manage_record($1,$2)", [
          "profile",
          JSON.stringify(input),
        ]);
        await tx.exec("reset role");
        await tx.query("update auth.users set email=$1 where id=$2", [
          email,
          input.id,
        ]);
      });
      revalidatePath("/");
      return { id: String(input.id) };
    }
    const id = await runCommand(profile.id, "manage_record", { kind, input });
    revalidatePath("/");
    return { id };
  } catch (e) {
    return { error: (e as Error).message };
  }
}
export async function inviteUser(input: {
  email: string;
  name: string;
  role: string;
  organization_id: string | null;
  phone: string;
}) {
  try {
    const { profile } = await requireProfile();
    if (profile.role !== "super_admin") throw new Error("Super Admin required");
    const email = z.email().parse(input.email).toLowerCase();
    z.string().trim().min(2).max(150).parse(input.name);
    z.enum(["client", "admin", "super_admin"]).parse(input.role);
    const password = randomBytes(18).toString("base64url");
    const hash = await hashPassword(password);
    const id = randomUUID();
    const db = await getDatabase();
    await db.transaction(async (tx) => {
      await tx.query(
        "insert into auth.users(id,email,password_hash,must_change_password) values($1,$2,$3,true)",
        [id, email, hash],
      );
      await tx.exec("set local role authenticated");
      await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [
        profile.id,
      ]);
      await tx.query("select manage_record('profile',$1)", [
        JSON.stringify({ ...input, email, id }),
      ]);
    });
    revalidatePath("/");
    return { id, password };
  } catch (e) {
    return { error: (e as Error).message };
  }
}
export async function resetUserPassword(userId: string) {
  try {
    const { profile } = await requireProfile();
    if (profile.role !== "super_admin") throw new Error("Super Admin required");
    z.uuid().parse(userId);
    if (userId === profile.id)
      throw new Error("Use your account page to change your own password");
    const password = randomBytes(18).toString("base64url");
    const hash = await hashPassword(password);
    const db = await getDatabase();
    await db.transaction(async (tx) => {
      const result = await tx.query(
        "update auth.users set password_hash=$1,must_change_password=true where id=$2 returning id",
        [hash, userId],
      );
      if (!result.rows.length) throw new Error("User not found");
      await tx.query("delete from auth.sessions where user_id=$1", [userId]);
      await tx.query(
        "insert into audit_logs(actor_user_id,action,entity_type,entity_id,metadata) values($1,'Password reset','profiles',$2,'{}')",
        [profile.id, userId],
      );
    });
    return { password };
  } catch (e) {
    return { error: (e as Error).message };
  }
}
export async function loadTimeline(id: string) {
  const { profile } = await requireProfile();
  return userQuery<Audit>(
    profile.id,
    "select * from booking_timeline($1) where action not like 'notifications %' limit 12",
    [z.uuid().parse(id)],
  );
}
export async function loadAvailability(start: string, end: string) {
  try {
    z.iso.datetime({ offset: true }).parse(start);
    z.iso.datetime({ offset: true }).parse(end);
    const { profile } = await requireProfile();
    return {
      slots: await userQuery<BusySlot>(
        profile.id,
        "select * from calendar_availability($1,$2)",
        [start, end],
      ),
    };
  } catch (e) {
    return { error: (e as Error).message };
  }
}
export async function updatePassword(form: FormData) {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  let error = "";
  try {
    if (!profile.must_change_password) {
      const [user] = await systemQuery<{ password_hash: string }>(
        "select password_hash from auth.users where id=$1",
        [profile.id],
      );
      if (
        !(await verifyPassword(
          String(form.get("current_password") || ""),
          user.password_hash,
        ))
      )
        throw new Error("Current password is incorrect");
    }
    const hash = await hashPassword(String(form.get("password")));
    await systemQuery(
      "update auth.users set password_hash=$1,must_change_password=false where id=$2",
      [hash, profile.id],
    );
    await systemQuery("delete from auth.sessions where user_id=$1", [
      profile.id,
    ]);
  } catch (e) {
    error = (e as Error).message;
  }
  if (error) redirect(`/account?error=${encodeURIComponent(error)}`);
  await createSession(profile.id);
  redirect("/");
}
