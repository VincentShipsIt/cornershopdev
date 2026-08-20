import { logoutResponseAfterAtomicRevocation } from "@/lib/auth-evidence-responses";
import {
  resolveBetterAuthSession,
  revokeCurrentSessionAtomically,
} from "@/lib/auth-sessions";
import { isSameOriginMutation } from "@/lib/request-origin";

export async function POST(request: Request) {
  if (!isSameOriginMutation(request, { requireOrigin: true })) {
    return Response.json({ error: "Invalid request origin" }, { status: 403 });
  }
  let current;
  try {
    current = await resolveBetterAuthSession(request.headers, {
      failOnSessionLookupError: true,
      requireOwnerMembership: false,
    });
  } catch {
    return Response.json(
      { error: "Sign-out could not verify the current session." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
  return logoutResponseAfterAtomicRevocation(
    current,
    revokeCurrentSessionAtomically,
  );
}
