import { createPrivateKey, sign } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import {
  firstCustomerEvidenceAttestationDigest,
  firstCustomerProductionEvidenceSchema,
} from "@/lib/first-customer-evidence";

const input = parseArguments(process.argv.slice(2));
const workspace = resolve(process.cwd());
const manifest = privatePath(input.manifestPath, "unsigned manifest");
const privateKeyPath = privatePath(input.privateKeyPath, "private key");
const output = resolve(input.outputPath);
const relativeOutput = relative(workspace, output);
if (
  !isAbsolute(input.outputPath) ||
  relativeOutput === "" ||
  (!relativeOutput.startsWith("..") && !isAbsolute(relativeOutput))
) {
  throw new Error("The signed manifest must be written outside the repository.");
}

const [source, privateKeyPem] = await Promise.all([
  readFile(manifest, "utf8"),
  readFile(privateKeyPath, "utf8"),
]);
const evidence = firstCustomerProductionEvidenceSchema.parse(JSON.parse(source));
const privateKey = createPrivateKey(privateKeyPem);
if (privateKey.asymmetricKeyType !== "ed25519") {
  throw new Error("The evidence key must be Ed25519.");
}
const unsigned = {
  ...evidence,
  attestation: {
    algorithm: "ed25519" as const,
    signerId: input.signerId,
    signedAt: new Date().toISOString(),
    signature:
      "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==",
  },
};
const digest = firstCustomerEvidenceAttestationDigest(unsigned);
const signature = sign(null, Buffer.from(digest, "hex"), privateKey).toString(
  "base64",
);
await writeFile(
  output,
  `${JSON.stringify(
    { ...unsigned, attestation: { ...unsigned.attestation, signature } },
    null,
    2,
  )}\n`,
  { flag: "wx", mode: 0o600 },
);
console.log(
  JSON.stringify({
    command: "sign-first-customer-evidence",
    signed: true,
    signerId: input.signerId,
    evidenceDigest: digest,
  }),
);

function privatePath(value: string, label: string): string {
  const absolute = resolve(value);
  const candidate = relative(workspace, absolute);
  if (
    !isAbsolute(value) ||
    candidate === "" ||
    (!candidate.startsWith("..") && !isAbsolute(candidate))
  ) {
    throw new Error(`The ${label} must stay outside the repository.`);
  }
  return absolute;
}

function parseArguments(args: string[]) {
  let manifestPath: string | undefined;
  let privateKeyPath: string | undefined;
  let outputPath: string | undefined;
  let signerId: string | undefined;
  let execute = false;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--execute") {
      execute = true;
      continue;
    }
    if (
      argument === "--manifest" ||
      argument === "--private-key" ||
      argument === "--output" ||
      argument === "--signer"
    ) {
      const value = args[index + 1];
      if (!value) throw new Error("Missing argument value.");
      if (argument === "--manifest") manifestPath = value;
      if (argument === "--private-key") privateKeyPath = value;
      if (argument === "--output") outputPath = value;
      if (argument === "--signer") signerId = value;
      index += 1;
      continue;
    }
    throw new Error("Invalid argument.");
  }
  if (!execute || !manifestPath || !privateKeyPath || !outputPath || !signerId) {
    throw new Error(
      "Usage: --manifest <path> --private-key <path> --output <path> --signer <id> --execute",
    );
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._:@/-]{2,119}$/.test(signerId)) {
    throw new Error("Invalid signer ID.");
  }
  return { manifestPath, privateKeyPath, outputPath, signerId };
}
