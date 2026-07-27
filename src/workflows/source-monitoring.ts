import {
  beginSourceMonitoringRun,
  executeSourceMonitoringRun,
  failSourceMonitoringRun,
  notifySourceMonitoringReview,
} from "@/lib/source-monitoring";

export async function sourceMonitoringWorkflow(runId: string): Promise<void> {
  "use workflow";

  const context = await beginRun(runId);
  if (!context) return;
  try {
    const result = await inspectSources(context);
    if (result.suggestionCount > 0) {
      await notifyReview(runId);
    }
  } catch (error) {
    await recordFailure(runId, error);
    throw error;
  }
}

async function beginRun(runId: string) {
  "use step";
  return beginSourceMonitoringRun(runId);
}

async function inspectSources(
  context: NonNullable<
    Awaited<ReturnType<typeof beginSourceMonitoringRun>>
  >,
) {
  "use step";
  return executeSourceMonitoringRun(context);
}
inspectSources.maxRetries = 4;

async function notifyReview(runId: string) {
  "use step";
  return notifySourceMonitoringReview(runId);
}
notifyReview.maxRetries = 4;

async function recordFailure(runId: string, error: unknown) {
  "use step";
  await failSourceMonitoringRun(runId, error);
}
