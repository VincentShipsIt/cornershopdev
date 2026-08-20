export const MAX_PHOTO_MULTIPART_BODY_BYTES = 12_500_000;

export class PhotoUploadBodyError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "PhotoUploadBodyError";
  }
}

function declaredBodyLength(request: Request): number | null {
  const header = request.headers.get("content-length");
  if (header === null) return null;
  if (!/^(?:0|[1-9]\d*)$/.test(header)) {
    throw new PhotoUploadBodyError("The upload length is invalid", 400);
  }
  const length = Number(header);
  if (!Number.isSafeInteger(length)) {
    throw new PhotoUploadBodyError("The upload length is invalid", 400);
  }
  return length;
}

/**
 * Reads a request through a hard byte ceiling before any parser can buffer it.
 * Content-Length is an early rejection hint only; the streamed byte count is
 * authoritative so chunked, missing, and dishonest lengths stay bounded.
 */
export async function readBoundedRequestBody(
  request: Request,
  maxBytes: number,
): Promise<Uint8Array> {
  const declaredLength = declaredBodyLength(request);
  if (declaredLength !== null && declaredLength > maxBytes) {
    throw new PhotoUploadBodyError(
      "The uploaded image is larger than 12 MB",
      413,
    );
  }
  if (!request.body) {
    if (declaredLength !== null && declaredLength !== 0) {
      throw new PhotoUploadBodyError("The upload length did not match its body", 400);
    }
    return new Uint8Array();
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    byteLength += value.byteLength;
    if (byteLength > maxBytes) {
      try {
        await reader.cancel();
      } catch {
        // The byte ceiling already terminated parsing; cancellation is cleanup.
      }
      throw new PhotoUploadBodyError(
        "The uploaded image is larger than 12 MB",
        413,
      );
    }
    chunks.push(value);
  }

  if (declaredLength !== null && declaredLength !== byteLength) {
    throw new PhotoUploadBodyError("The upload length did not match its body", 400);
  }

  const body = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

export async function parseBoundedPhotoForm(
  request: Request,
): Promise<FormData> {
  const contentType = request.headers.get("content-type") ?? "";
  const body = await readBoundedRequestBody(
    request,
    MAX_PHOTO_MULTIPART_BODY_BYTES,
  );
  try {
    return await new Response(body.buffer as ArrayBuffer, {
      headers: { "Content-Type": contentType },
    }).formData();
  } catch {
    throw new PhotoUploadBodyError("The photo upload form is invalid", 400);
  }
}
