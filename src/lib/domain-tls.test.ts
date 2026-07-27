import { describe, expect, it, mock } from "bun:test";

mock.module("server-only", () => ({}));

const { checkDomainTls, tlsFailure } = await import("@/lib/domain-tls");

describe("domain TLS readiness", () => {
  it("reports a verified certificate as ready", async () => {
    expect(
      await checkDomainTls(
        "example.com",
        "192.0.2.1",
        async () => undefined,
      ),
    ).toEqual({
      status: "READY",
      failureCode: null,
      message: "Secure connection is ready",
    });
  });

  it("maps certificate issuance and ingress failures to safe messages", () => {
    expect(tlsFailure("ERR_TLS_CERT_ALTNAME_INVALID")).toMatchObject({
      status: "PENDING",
      failureCode: "CERTIFICATE_NOT_READY",
    });
    expect(tlsFailure("ECONNREFUSED")).toMatchObject({
      status: "ERROR",
      failureCode: "INGRESS_UNREACHABLE",
    });
    expect(tlsFailure("SOME_INTERNAL_LIBRARY_ERROR")).toEqual({
      status: "ERROR",
      failureCode: "TLS_CHECK_FAILED",
      message:
        "DNS is connected, but secure connection readiness could not be confirmed. Try the check again.",
    });
  });

  it("never returns the underlying connection error", async () => {
    const result = await checkDomainTls(
      "example.com",
      "192.0.2.1",
      async () => {
        throw Object.assign(new Error("secret internal topology"), {
          code: "ECONNRESET",
        });
      },
    );
    expect(result.message).not.toContain("secret");
    expect(result).toMatchObject({
      status: "ERROR",
      failureCode: "INGRESS_UNREACHABLE",
    });
  });
});
