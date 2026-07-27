import { getDb } from "@/lib/db";
import { dispatchDueOperatorAlerts } from "@/lib/operator-alerts";

try {
  const outcomes = await dispatchDueOperatorAlerts();
  console.log(
    JSON.stringify(
      {
        command: "dispatch-operator-alerts",
        outcomes,
        completedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
  if (outcomes.exhausted > 0 || outcomes.unavailable > 0) {
    process.exitCode = 1;
  }
} catch {
  console.error(
    JSON.stringify({
      command: "dispatch-operator-alerts",
      completed: false,
      failure: "database_or_delivery_unavailable",
      failedAt: new Date().toISOString(),
    }),
  );
  process.exitCode = 1;
} finally {
  try {
    await getDb().$disconnect();
  } catch {
    // The safe failure result above already captures an unavailable database.
  }
}
