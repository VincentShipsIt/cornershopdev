export function configuredSuperadminEmails(
  value = process.env.SUPERADMIN_EMAILS,
): Set<string> {
  return new Set(
    (value ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isConfiguredSuperadminEmail(
  email: string,
  value = process.env.SUPERADMIN_EMAILS,
): boolean {
  return configuredSuperadminEmails(value).has(email.trim().toLowerCase());
}
