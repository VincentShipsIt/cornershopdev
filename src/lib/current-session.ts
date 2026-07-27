import "server-only";
import { headers } from "next/headers";
import {
  resolveBetterAuthSession,
  type CurrentSession,
} from "@/lib/auth-sessions";

export async function getCurrentSession(): Promise<CurrentSession | null> {
  return resolveBetterAuthSession(await headers());
}
