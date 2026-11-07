import "./node-only";
import type { IncomingMessage } from "node:http";
import type { NextApiRequest, NextApiResponse } from "next";
import { handleVerifyRequest } from "./verify-handler";
import { verifyInternalErrorResponse, verifyMethodResponse } from "./verify-http";

/**
 * Demand-only bridge: cancellation must NOT destroy IncomingMessage's socket,
 * otherwise the bounded reader cannot send its 400 for an oversized body.
 * Node22's public iterator option leaves the request intact; resume drains it.
 */
export function nodeRequestBody(request: IncomingMessage): ReadableStream<Uint8Array<ArrayBuffer>> {
  const iterator = request.iterator({ destroyOnReturn: false });
  return new ReadableStream<Uint8Array<ArrayBuffer>>({
    async pull(controller) {
      try {
        const part = await iterator.next();
        if (part.done) { controller.close(); return; }
        const chunk: unknown = part.value;
        if (!(chunk instanceof Uint8Array)) throw new Error("Invalid request stream");
        controller.enqueue(new Uint8Array(chunk));
      } catch {
        controller.error(new Error("Request stream failed"));
      }
    },
    async cancel() {
      try { await iterator.return?.(); } finally { request.resume(); }
    },
  }, { highWaterMark: 0 });
}

async function sendResponse(response: Response, target: NextApiResponse): Promise<void> {
  const body = await response.arrayBuffer();
  target.statusCode = response.status;
  response.headers.forEach((value, name) => target.setHeader(name, value));
  target.end(body.byteLength ? Buffer.from(body) : undefined);
}

/** Raw Node method guard runs before any Fetch Request or input-stream construction. */
export async function handleVerifyNodeRequest(request: NextApiRequest, response: NextApiResponse): Promise<void> {
  try {
    const method = request.method ?? "";
    const rejected = verifyMethodResponse(method);
    if (rejected) { await sendResponse(rejected, response); return; }

    const headers = new Headers();
    for (const [name, value] of Object.entries(request.headers)) {
      if (Array.isArray(value)) for (const item of value) headers.append(name, item);
      else if (value !== undefined) headers.set(name, value);
    }
    // No native Request constructor, URL rebuilding or eager body buffering.
    const result = await handleVerifyRequest({ method, headers, body: nodeRequestBody(request) });
    await sendResponse(result, response);
  } catch {
    // Never pass potentially sensitive transport exceptions to Next's logger.
    if (response.headersSent || response.writableEnded || response.destroyed) return;
    try { await sendResponse(verifyInternalErrorResponse(), response); }
    catch { response.destroy(); } // A closed/failed client connection cannot receive an HTTP response.
  }
}
