import { platformSubdomainParents } from "@/lib/hostnames";

const SHA_PATTERN = /^[0-9a-f]{40}$/;
const IPV4_PATTERN = /^(?:\d{1,3}\.){3}\d{1,3}$/;

export type PlatformDnsProbe = {
  hostname: string;
  expectedAddress: string;
  addresses: string[];
  ready: boolean;
};

export function platformDnsProbeHostnames(
  deployedSha: string,
  configuredHostnames?: string,
): string[] {
  if (!SHA_PATTERN.test(deployedSha)) {
    throw new Error("DEPLOYED_GIT_SHA must be a full lowercase commit SHA");
  }
  const label = `release-${deployedSha.slice(0, 12)}`;
  return platformSubdomainParents(configuredHostnames).map(
    (parent) => `${label}.${parent}`,
  );
}

export function evaluatePlatformDnsProbes(
  hostnames: string[],
  expectedAddress: string,
  addressesByHostname: ReadonlyMap<string, readonly string[]>,
): { ready: boolean; probes: PlatformDnsProbe[] } {
  if (!isIpv4Address(expectedAddress)) {
    throw new Error("PUBLIC_APP_IP must be an IPv4 address");
  }
  const probes = hostnames.map((hostname) => {
    const addresses = [...(addressesByHostname.get(hostname) ?? [])].sort();
    return {
      hostname,
      expectedAddress,
      addresses,
      ready: addresses.includes(expectedAddress),
    };
  });
  return { ready: probes.length > 0 && probes.every((probe) => probe.ready), probes };
}

export function platformTlsProbeHostnames(
  siteSlug: string,
  configuredHostnames?: string,
): string[] {
  if (!/^[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$/.test(siteSlug)) {
    throw new Error("A persisted DNS-safe site slug is required");
  }
  return platformSubdomainParents(configuredHostnames).map(
    (parent) => `${siteSlug}.${parent}`,
  );
}

function isIpv4Address(value: string): boolean {
  if (!IPV4_PATTERN.test(value)) return false;
  return value.split(".").every((octet) => Number(octet) <= 255);
}
