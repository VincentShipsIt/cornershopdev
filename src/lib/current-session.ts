import "server-only";
import { cookies } from "next/headers";
import {
  resolveSessionToken,
  type CurrentSession,
} from "@/lib/auth-sessions";
import { SESSION_COOKIE } from "@/lib/session";

export async function getCurrentSession(): Promise<CurrentSession | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return token ? resolveSessionToken(token) : null;
}
