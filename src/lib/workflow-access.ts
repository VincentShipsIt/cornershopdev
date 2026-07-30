import "server-only";
import { getDb } from "@/lib/db";

/**
 * Workflow run IDs are capability-like secrets, but they still appear in browser
 * history and network logs. Require the import job that owns the run so status
 * and event streams cannot be read from a runId alone.
 */
export async function assertImportWorkflowAccess(
  runId: string,
  importJobId: string | null,
): Promise<boolean> {
  if (!importJobId || !runId) return false;
  if (!process.env.DATABASE_URL) return false;

  const job = await getDb().importJob.findFirst({
    where: {
      id: importJobId,
      workflowRunId: runId,
    },
    select: { id: true },
  });
  return Boolean(job);
}
