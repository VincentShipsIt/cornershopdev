export type SessionPurpose = "ADMIN" | "WORKSPACE_SELECTION" | "SITE";

export type SessionWorkspace = {
  id: string;
  organizationId: string | null;
};

export type SessionBinding = {
  purpose: SessionPurpose;
  organizationId: string | null;
  siteId: string | null;
};

export function resolveSessionBinding(input: {
  operator: boolean;
  workspaces: SessionWorkspace[];
}): SessionBinding | null {
  if (input.operator) {
    return {
      purpose: "ADMIN",
      organizationId: null,
      siteId: null,
    };
  }

  const workspaces = input.workspaces.filter(
    (workspace): workspace is SessionWorkspace & { organizationId: string } =>
      Boolean(workspace.organizationId),
  );
  if (workspaces.length === 0) return null;
  if (workspaces.length > 1) {
    return {
      purpose: "WORKSPACE_SELECTION",
      organizationId: null,
      siteId: null,
    };
  }

  return {
    purpose: "SITE",
    organizationId: workspaces[0].organizationId,
    siteId: workspaces[0].id,
  };
}

export function isSessionPurpose(value: unknown): value is SessionPurpose {
  return (
    value === "ADMIN" ||
    value === "WORKSPACE_SELECTION" ||
    value === "SITE"
  );
}
