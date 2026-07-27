import "server-only";
import { getDb } from "@/lib/db";
import { canRetryMagicLink, maskAccountEmail } from "@/lib/session";

export type AuthDeliveryRow = {
  id: string;
  account: string;
  destination: "ADMIN" | "WORKSPACE";
  status: "PENDING" | "SENT" | "FAILED";
  failureCode: string | null;
  retryCount: number;
  retryable: boolean;
  createdAt: Date;
  lastAttemptAt: Date | null;
};

export async function getRecentAuthDeliveries(): Promise<AuthDeliveryRow[]> {
  const rows = await getDb().authMagicLink.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      destination: true,
      deliveryStatus: true,
      failureCode: true,
      retryCount: true,
      expiresAt: true,
      consumedAt: true,
      revokedAt: true,
      createdAt: true,
      lastAttemptAt: true,
      user: { select: { email: true } },
    },
  });
  return rows.map((row) => ({
    id: row.id,
    account: maskAccountEmail(row.user.email),
    destination: row.destination,
    status: row.deliveryStatus,
    failureCode: row.failureCode,
    retryCount: row.retryCount,
    retryable: canRetryMagicLink(row),
    createdAt: row.createdAt,
    lastAttemptAt: row.lastAttemptAt,
  }));
}
