type TestModeEnvironment = Record<string, string | undefined>;

function isLoopbackUrl(value: string | undefined): boolean {
  if (!value) return false;
  try {
    return ["localhost", "127.0.0.1", "::1"].includes(new URL(value).hostname);
  } catch {
    return false;
  }
}

export function firstCustomerTestModeEnabled(
  environment: TestModeEnvironment = process.env,
): boolean {
  return (
    environment.CORNERSHOP_ENV === "test" &&
    environment.FIRST_CUSTOMER_E2E === "1"
  );
}

export function secureCookieRequired(
  environment: TestModeEnvironment = process.env,
): boolean {
  return (
    environment.NODE_ENV === "production" &&
    !firstCustomerTestModeEnabled(environment)
  );
}

/** Fail closed when any provider-double configuration is partial or unsafe. */
export function assertFirstCustomerTestModeSafety(
  environment: TestModeEnvironment = process.env,
): void {
  const requested =
    environment.CORNERSHOP_ENV === "test" ||
    environment.FIRST_CUSTOMER_E2E === "1" ||
    Boolean(environment.STRIPE_API_BASE_URL) ||
    Boolean(environment.RESEND_API_BASE_URL);
  if (!requested) return;
  if (
    !firstCustomerTestModeEnabled(environment) ||
    Boolean(environment.VERCEL_ENV) ||
    !isLoopbackUrl(environment.NEXT_PUBLIC_APP_URL) ||
    !isLoopbackUrl(environment.STRIPE_API_BASE_URL) ||
    !isLoopbackUrl(environment.RESEND_API_BASE_URL) ||
    !isLoopbackUrl(environment.DATABASE_URL) ||
    !isLoopbackUrl(environment.WORKFLOW_POSTGRES_URL) ||
    !environment.STRIPE_SECRET_KEY?.startsWith("sk_test_") ||
    !environment.RESEND_API_KEY?.startsWith("re_test_")
  ) {
    throw new Error("Unsafe first-customer test-mode configuration");
  }
}
