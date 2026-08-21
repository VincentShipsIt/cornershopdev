"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";

export function AccountActions({ canSwitch }: { canSwitch: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function logout() {
    setPending(true);
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (response.ok) {
        router.push("/sign-in");
        router.refresh();
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      {canSwitch ? (
        <Button render={<Link href="/workspace/select" />} variant="outline" size="sm">
          Switch workspace
        </Button>
      ) : null}
      <Button
        variant="ghost"
        size="sm"
        disabled={pending}
        onClick={logout}
        aria-label="Sign out"
      >
        <LogOut />
        Sign out
      </Button>
    </div>
  );
}
