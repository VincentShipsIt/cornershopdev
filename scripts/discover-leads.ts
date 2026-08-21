import {
  parseLeadDiscoveryArguments,
  runLeadDiscovery,
} from "@/lib/lead-discovery-runner";

try {
  const summary = await runLeadDiscovery(
    parseLeadDiscoveryArguments(process.argv.slice(2)),
  );
  console.log(JSON.stringify(summary, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : "Lead discovery failed");
  process.exitCode = 1;
}
