import { toNextJsHandler } from "better-auth/next-js";
import type { NextRequest } from "next/server";
import { auth } from "@/lib/better-auth";
import { dispatchBetterAuthCatchallRequest } from "@/lib/better-auth-route-policy";

const handlers = toNextJsHandler(auth);

export function GET(request: NextRequest) {
  return dispatchBetterAuthCatchallRequest(request, () =>
    handlers.GET(request),
  );
}

export function POST(request: NextRequest) {
  return dispatchBetterAuthCatchallRequest(request, () =>
    handlers.POST(request),
  );
}
