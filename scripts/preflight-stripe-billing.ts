import { getStripe } from "@/lib/stripe";
import { preflightRestofrontBilling } from "@/lib/stripe-billing-preflight";

let requiredMode: "test" | "live" | "invalid" = "invalid";

try {
  requiredMode = parseArguments(process.argv.slice(2));
  const evidence = await preflightRestofrontBilling({
    stripe: getStripe(),
    requiredMode,
  });
  console.log(JSON.stringify(evidence, null, 2));
} catch {
  console.error(
    JSON.stringify({
      check: "restofront-founding-billing",
      ready: false,
      mode: requiredMode,
      failure: "configuration_or_provider_resource_mismatch",
      failedAt: new Date().toISOString(),
    }),
  );
  process.exitCode = 1;
}

function parseArguments(args: string[]): "test" | "live" {
  if (args.length !== 2 || args[0] !== "--mode") {
    throw new Error("Usage: --mode test|live");
  }
  if (args[1] !== "test" && args[1] !== "live") {
    throw new Error("Usage: --mode test|live");
  }
  return args[1];
}
