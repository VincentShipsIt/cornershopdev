import { describe, expect, it } from "bun:test";
import {
  parseBoundedPhotoForm,
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

    const parsed = await parseBoundedPhotoForm(request);

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
