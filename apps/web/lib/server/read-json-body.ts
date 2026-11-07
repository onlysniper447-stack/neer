const MAX_BODY_BYTES = 64 * 1024;

type BodyResult = { ok: true; value: unknown } | { ok: false; message: string };

/** Count streamed bytes before decoding, including when Content-Length is absent or false. */
export async function readJsonBody(request: Pick<Request, "body">): Promise<BodyResult> {
  if (!request.body) return { ok: false, message: "Request body must be JSON." };
  const reader = request.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let bytes = 0;
  let text = "";
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > MAX_BODY_BYTES) {
        await reader.cancel();
        return { ok: false, message: "Request body is too large." };
      }
      text += decoder.decode(part.value, { stream: true });
    }
    text += decoder.decode();
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    await reader.cancel().catch(() => {});
    return { ok: false, message: "Request body must be valid UTF-8 JSON." };
  } finally {
    reader.releaseLock();
  }
}
