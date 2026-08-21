import { describe, expect, it } from "bun:test";
import {
  MAX_PHOTO_REFERENCE_BODY_BYTES,
  parseBoundedPhotoIngestBody,
  readBoundedRequestBody,
} from "@/lib/photo-upload-body";

describe("bounded photo upload bodies", () => {
  it("parses a valid multipart upload without Content-Length", async () => {
    const form = new FormData();
    form.set("photo", new File(["real photo bytes"], "shop.jpg", {
      type: "image/jpeg",
    }));
    form.set("candidateUsages", '["GALLERY"]');
    const request = new Request("https://cornershop.dev/upload", {
      method: "POST",
      body: form,
    });
    request.headers.delete("content-length");

    const parsedBody = await parseBoundedPhotoIngestBody(request);
    expect(parsedBody.kind).toBe("multipart");
    if (parsedBody.kind !== "multipart") throw new Error("Expected multipart");
    const parsed = parsedBody.form;

    expect(parsed.get("candidateUsages")).toBe('["GALLERY"]');
    const photo = parsed.get("photo");
    expect(photo).toBeInstanceOf(File);
    expect((photo as File).name).toBe("shop.jpg");
    expect(await (photo as File).text()).toBe("real photo bytes");
  });

  it("keeps a chunked body bounded without relying on Content-Length", async () => {
    let cancelled = false;
    const request = streamingRequest(
      [new Uint8Array(6), new Uint8Array(6), new Uint8Array(6)],
      { "Transfer-Encoding": "chunked" },
      () => {
        cancelled = true;
      },
    );

    await expect(readBoundedRequestBody(request, 10)).rejects.toEqual(
      expect.objectContaining({
        status: 413,
      }),
    );
    expect(cancelled).toBe(true);
  });

  it("rejects an oversized no-length body while it is streaming", async () => {
    const request = streamingRequest([
      new Uint8Array(5),
      new Uint8Array(5),
      new Uint8Array(1),
    ]);

    await expect(readBoundedRequestBody(request, 10)).rejects.toEqual(
      expect.objectContaining({
        status: 413,
      }),
    );
  });

  it("preserves the fail-closed response when stream cancellation fails", async () => {
    const request = streamingRequest(
      [new Uint8Array(6), new Uint8Array(6)],
      {},
      () => {
        throw new Error("transport cancellation failed");
      },
    );

    await expect(readBoundedRequestBody(request, 10)).rejects.toEqual(
      expect.objectContaining({ status: 413 }),
    );
  });

  it("rejects a lying small length when the streamed body is oversized", async () => {
    const request = streamingRequest(
      [new Uint8Array(6), new Uint8Array(6)],
      { "Content-Length": "4" },
    );

    await expect(readBoundedRequestBody(request, 10)).rejects.toEqual(
      expect.objectContaining({
        status: 413,
      }),
    );
  });

  it("rejects a declared oversize before consuming the request stream", async () => {
    const request = new Request("https://cornershop.dev/upload", {
      method: "POST",
      headers: { "Content-Length": "11" },
      body: new ReadableStream<Uint8Array>({
        pull(controller) {
          controller.enqueue(new Uint8Array(1));
        },
      }),
      duplex: "half",
    } as RequestInit & { duplex: "half" });

    await expect(readBoundedRequestBody(request, 10)).rejects.toEqual(
      expect.objectContaining({
        status: 413,
      }),
    );
    expect(request.body?.locked).toBe(false);
  });

  it("fails closed on invalid and mismatched declared lengths", async () => {
    const invalid = streamingRequest([new Uint8Array(1)], {
      "Content-Length": "not-a-number",
    });
    const mismatch = streamingRequest([new Uint8Array(2)], {
      "Content-Length": "1",
    });

    await expect(readBoundedRequestBody(invalid, 10)).rejects.toEqual(
      expect.objectContaining({ status: 400 }),
    );
    await expect(readBoundedRequestBody(mismatch, 10)).rejects.toEqual(
      expect.objectContaining({ status: 400 }),
    );
  });

  it("parses bounded JSON references without Content-Length", async () => {
    const request = streamingRequest(
      [new TextEncoder().encode('{"sourceImageUrl":"https://example.test/photo.jpg"}')],
      { "Content-Type": "Application/JSON; charset=utf-8" },
    );

    const parsed = await parseBoundedPhotoIngestBody(request);

    expect(parsed).toEqual({
      kind: "reference",
      value: { sourceImageUrl: "https://example.test/photo.jpg" },
    });
  });

  it("rejects oversized JSON with missing or lying Content-Length", async () => {
    const oversized = new Uint8Array(MAX_PHOTO_REFERENCE_BODY_BYTES + 1);
    const missingLength = streamingRequest([oversized], {
      "Content-Type": "application/json",
    });
    const lyingLength = streamingRequest([oversized], {
      "Content-Type": "application/json",
      "Content-Length": "2",
    });

    await expect(parseBoundedPhotoIngestBody(missingLength)).rejects.toEqual(
      expect.objectContaining({ status: 413 }),
    );
    await expect(parseBoundedPhotoIngestBody(lyingLength)).rejects.toEqual(
      expect.objectContaining({ status: 413 }),
    );
  });

  it("rejects declared-oversize JSON before reading and unsupported media types", async () => {
    const declaredOversize = streamingRequest(
      [new Uint8Array(1)],
      {
        "Content-Type": "application/json",
        "Content-Length": String(MAX_PHOTO_REFERENCE_BODY_BYTES + 1),
      },
    );
    const unsupported = streamingRequest(
      [new TextEncoder().encode("https://example.test/photo.jpg")],
      { "Content-Type": "text/plain" },
    );

    await expect(parseBoundedPhotoIngestBody(declaredOversize)).rejects.toEqual(
      expect.objectContaining({ status: 413 }),
    );
    await expect(parseBoundedPhotoIngestBody(unsupported)).rejects.toEqual(
      expect.objectContaining({ status: 415 }),
    );
    expect(unsupported.body?.locked).toBe(false);
  });
});

function streamingRequest(
  chunks: Uint8Array[],
  headers: HeadersInit = {},
  onCancel?: () => void,
): Request {
  let index = 0;
  return new Request("https://cornershop.dev/upload", {
    method: "POST",
    headers,
    body: new ReadableStream<Uint8Array>({
      pull(controller) {
        const chunk = chunks[index];
        if (!chunk) {
          controller.close();
          return;
        }
        index += 1;
        controller.enqueue(chunk);
      },
      cancel() {
        onCancel?.();
      },
    }),
    duplex: "half",
  } as RequestInit & { duplex: "half" });
}
