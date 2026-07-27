"use client";

import { useState } from "react";
import { ArrowRight, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { AccountWorkspace } from "@/lib/workspaces";

export function WorkspaceChooser({
  workspaces,
}: {
  workspaces: AccountWorkspace[];
}) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function choose(siteId: string) {
    setPendingId(siteId);
    setError(null);
    try {
      const response = await fetch("/api/auth/workspace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId }),
      });
      if (!response.ok) throw new Error("Workspace access is unavailable.");
      window.location.assign("/dashboard");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not switch workspace.");
      setPendingId(null);
    }
  }

  return (
    <div className="mt-8 grid gap-3">
      {workspaces.map((workspace) => (
        <Card key={workspace.id}>
          <CardContent className="flex items-center justify-between gap-4 pt-1">
            <div>
              <p className="font-medium">{workspace.name}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {workspace.vertical.toLowerCase()} · {workspace.slug}
              </p>
            </div>
            <Button
              onClick={() => choose(workspace.id)}
              disabled={pendingId !== null}
              aria-label={`Open ${workspace.name}`}
            >
              {pendingId === workspace.id ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <ArrowRight />
              )}
              Open
            </Button>
          </CardContent>
        </Card>
      ))}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
