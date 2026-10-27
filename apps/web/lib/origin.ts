/** Origin for code examples, from the request (the host header must look like a hostname). */
export function requestOrigin(h: Headers): string {
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  if (!/^[a-z0-9.-]+(:\d{1,5})?$/i.test(host)) return "https://neer.example";
  const proto = h.get("x-forwarded-proto") === "http" || host.startsWith("127.0.0.1") || host.startsWith("localhost") ? "http" : "https";
  return `${proto}://${host}`;
}
