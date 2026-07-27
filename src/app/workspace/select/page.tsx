import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { WorkspaceChooser } from "@/app/workspace/select/workspace-chooser";
import { AccountActions } from "@/components/account-actions";
import { getCurrentSession } from "@/lib/current-session";
import { listAccountWorkspaces } from "@/lib/workspaces";

export const metadata: Metadata = {
  title: "Choose workspace",
  robots: { index: false, follow: false },
};

export default async function WorkspaceSelectPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/sign-in");
  const workspaces = await listAccountWorkspaces(session.userId);
  if (workspaces.length === 0) redirect("/sign-in");

  return (
    <main className="min-h-screen bg-muted/30 px-4 py-16">
      <section className="mx-auto max-w-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              Account workspace
            </p>
            <h1 className="font-display mt-3 text-5xl tracking-[-0.045em]">
              Choose where to work.
            </h1>
            <p className="mt-4 text-sm text-muted-foreground">
              Your session will be freshly bound to the workspace you select.
            </p>
          </div>
          <AccountActions canSwitch={false} />
        </div>
        <WorkspaceChooser workspaces={workspaces} />
      </section>
    </main>
  );
}
