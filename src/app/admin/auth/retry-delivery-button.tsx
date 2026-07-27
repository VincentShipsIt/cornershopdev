"use client";

import { useState } from "react";
import { RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

export function RetryDeliveryButton({ id }: { id: string }) {
  const [pending, setPending] = useState(false);

  async function retry() {
    if (!window.confirm("Send one replacement sign-in link?")) return;
    setPending(true);
    try {
      const response = await fetch("/api/admin/auth-deliveries/retry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!response.ok) throw new Error("Retry failed");
      window.location.reload();
    } catch {
      setPending(false);
    }
  }

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={retry}
    >
      <RefreshCcw className={pending ? "animate-spin" : ""} />
      Retry
    </Button>
  );
}
