import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { RetryDeliveryButton } from "@/app/admin/auth/retry-delivery-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getRecentAuthDeliveries } from "@/lib/auth-operations";
import { getSuperadminAccess } from "@/lib/authorization";
import { getCurrentSession } from "@/lib/current-session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Authentication delivery",
  robots: { index: false, follow: false },
};

export default async function AuthOperationsPage() {
  if (!(await getCurrentSession())) redirect("/sign-in");
  if (!(await getSuperadminAccess())) notFound();
  const rows = await getRecentAuthDeliveries();

  return (
    <main className="min-h-screen bg-[#f3f1eb] px-4 py-10">
      <section className="mx-auto max-w-6xl">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              Operator console
            </p>
            <h1 className="font-display mt-2 text-5xl tracking-[-0.04em]">
              Sign-in delivery.
            </h1>
            <p className="mt-3 text-sm text-muted-foreground">
              Masked account identifiers, safe provider outcomes, and bounded replacement links.
            </p>
          </div>
          <Button render={<Link href="/admin" />} variant="outline">Back</Button>
        </div>
        <Card className="mt-8 overflow-hidden py-0">
          <CardHeader className="border-b py-5">
            <CardTitle>Latest 100 attempts</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full min-w-[840px] text-left text-sm">
              <thead className="border-b bg-muted/50 text-xs uppercase tracking-[0.12em] text-muted-foreground">
                <tr>
                  <th className="px-5 py-3">Account</th>
                  <th className="px-5 py-3">Destination</th>
                  <th className="px-5 py-3">Delivery</th>
                  <th className="px-5 py-3">Failure</th>
                  <th className="px-5 py-3">Created</th>
                  <th className="px-5 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td className="px-5 py-4 font-mono text-xs">{row.account}</td>
                    <td className="px-5 py-4">{row.destination.toLowerCase()}</td>
                    <td className="px-5 py-4">
                      <Badge variant={row.status === "FAILED" ? "destructive" : "outline"}>
                        {row.status.toLowerCase()}
                      </Badge>
                    </td>
                    <td className="px-5 py-4 text-muted-foreground">
                      {row.failureCode ?? "—"}
                    </td>
                    <td className="px-5 py-4">{row.createdAt.toLocaleString()}</td>
                    <td className="px-5 py-4 text-right">
                      {row.retryable ? <RetryDeliveryButton id={row.id} /> : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length === 0 ? (
              <p className="px-5 py-12 text-center text-muted-foreground">
                No sign-in attempts yet.
              </p>
            ) : null}
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
