import "server-only";
import { connect } from "node:tls";

export type DomainTlsCheck =
  | {
      status: "READY";
      failureCode: null;
      message: string;
    }
  | {
      status: "PENDING" | "ERROR";
      failureCode:
        | "CERTIFICATE_NOT_READY"
        | "INGRESS_UNREACHABLE"
        | "TLS_CHECK_FAILED";
      message: string;
    };

type TlsProbe = (hostname: string, address: string) => Promise<void>;

/**
 * Probes the production ingress IP with SNI set to the customer hostname. DNS
 * has already been verified before this runs, so it never follows an arbitrary
 * customer-controlled address and cannot become a general SSRF primitive.
 */
export async function checkDomainTls(
  hostname: string,
  address: string,
  probe: TlsProbe = probeTls,
): Promise<DomainTlsCheck> {
  try {
    await probe(hostname, address);
    return {
      status: "READY",
      failureCode: null,
      message: "Secure connection is ready",
    };
  } catch (error) {
    return tlsFailure(
      typeof error === "object" &&
        error !== null &&
        "code" in error &&
        typeof error.code === "string"
        ? error.code
        : null,
    );
  }
}

export function tlsFailure(code: string | null): DomainTlsCheck {
  if (
    code === "ERR_TLS_CERT_ALTNAME_INVALID" ||
    code === "DEPTH_ZERO_SELF_SIGNED_CERT" ||
    code === "UNABLE_TO_VERIFY_LEAF_SIGNATURE" ||
    code === "CERT_HAS_EXPIRED"
  ) {
    return {
      status: "PENDING",
      failureCode: "CERTIFICATE_NOT_READY",
      message:
        "DNS is connected, but the secure certificate is still being issued. Check again in a few minutes.",
    };
  }
  if (
    code === "ETIMEDOUT" ||
    code === "ECONNREFUSED" ||
    code === "ECONNRESET" ||
    code === "EHOSTUNREACH"
  ) {
    return {
      status: "ERROR",
      failureCode: "INGRESS_UNREACHABLE",
      message:
        "DNS is connected, but the secure site could not be reached. Check again after DNS propagation completes.",
    };
  }
  return {
    status: "ERROR",
    failureCode: "TLS_CHECK_FAILED",
    message:
      "DNS is connected, but secure connection readiness could not be confirmed. Try the check again.",
  };
}

async function probeTls(hostname: string, address: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const socket = connect(
      {
        host: address,
        port: 443,
        servername: hostname,
        rejectUnauthorized: true,
      },
      () => {
        socket.end();
        resolve();
      },
    );
    socket.setTimeout(4_000, () => {
      socket.destroy();
      reject(Object.assign(new Error("TLS probe timed out"), { code: "ETIMEDOUT" }));
    });
    socket.once("error", reject);
  });
}
