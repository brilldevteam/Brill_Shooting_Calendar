import "server-only";
import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { systemQuery } from "./database";
import { tokenHash } from "./passwords";
import type { Profile } from "@/types/domain";
const cookieName = "brill_session";
export async function hasAccounts() {
  const rows = await systemQuery<{ exists: boolean }>(
    "select exists(select 1 from auth.users)",
  );
  return rows[0].exists;
}
export async function getProfile() {
  const token = (await cookies()).get(cookieName)?.value;
  if (!token) return null;
  const rows = await systemQuery<Profile & { must_change_password: boolean }>(
    "select p.*,u.must_change_password from auth.sessions s join public.profiles p on p.id=s.user_id join auth.users u on u.id=p.id where s.token_hash=$1 and s.expires_at>now() and p.status='active'",
    [tokenHash(token)],
  );
  return rows[0] || null;
}
export async function requireProfile() {
  const profile = await getProfile();
  if (!profile) throw new Error("Please sign in to an active account.");
  if (profile.must_change_password)
    throw new Error("Set your password on the Account page before continuing.");
  return { profile };
}
export async function createSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  await systemQuery(
    "insert into auth.sessions(token_hash,user_id,expires_at) values($1,$2,now()+interval '7 days')",
    [tokenHash(token), userId],
  );
  (await cookies()).set(cookieName, token, {
    httpOnly: true,
    secure:
      process.env.NODE_ENV === "production" &&
      process.env.ALLOW_HTTP_LOCAL !== "true",
    sameSite: "lax",
    path: "/",
    maxAge: 7 * 86400,
  });
}
export async function deleteSession() {
  const jar = await cookies();
  const token = jar.get(cookieName)?.value;
  if (token)
    await systemQuery("delete from auth.sessions where token_hash=$1", [
      tokenHash(token),
    ]);
  jar.delete(cookieName);
}
