import { describe, expect, it } from "bun:test";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";

describe("health endpoint routing", () => {
  it("bypasses custom-domain resolution for container-local probes", async () => {
    for (const pathname of ["/api/health/live", "/api/health/ready"]) {
      const response = await proxy(
        new NextRequest(`http://127.0.0.1:3000${pathname}`),
      );

      expect(response.headers.get("x-middleware-next")).toBe("1");
      expect(response.headers.get("x-middleware-rewrite")).toBeNull();
    }
  });

  it("lets Caddy authorize TLS through its internal service hostname", async () => {
    const response = await proxy(
      new NextRequest(
        "http://cornershopdev:3000/api/domains/authorize?domain=cornershop.dev",
      ),
    );

    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.get("x-middleware-rewrite")).toBeNull();
  });
});
