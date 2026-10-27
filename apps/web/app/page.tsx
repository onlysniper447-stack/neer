import { headers } from "next/headers";
import { PasteForm } from "@/components/paste-form";
import { apiExample } from "@/lib/api-example";

/** Origin for the curl example, from the request (host header is validated to a hostname shape). */
async function requestOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  if (!/^[a-z0-9.-]+(:\d{1,5})?$/i.test(host)) return "https://neer.example";
  const proto = h.get("x-forwarded-proto") === "http" || host.startsWith("127.0.0.1") || host.startsWith("localhost") ? "http" : "https";
  return `${proto}://${host}`;
}

export default async function Home() {
  const example = apiExample(await requestOrigin());
  return (
    <div className="space-y-14">
      <section className="space-y-6">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Check before you send.</h1>
          <p className="text-lg text-muted">Paste the deposit address from your swap. We compare it with the NEAR Intents quote before you send.</p>
        </div>
        <PasteForm />
        <p className="text-sm text-muted">Neer never asks for your seed phrase, a signature or an approval. It only reads public quote data.</p>
      </section>

      <section id="how-it-works" className="scroll-mt-20 space-y-4">
        <h2 className="text-xl font-semibold">How it works</h2>
        <ol className="space-y-3">
          {[
            ["Paste the address", "We look up the quote NEAR Intents issued for it and confirm the quote's signature."],
            ["Tell us how you'll send", "Pick the network, token and amount you're about to use. There are no defaults on purpose."],
            ["Get one clear answer", "Safe to send, Check this, or Don't send, with the reason and what to do about it."],
          ].map(([title, text], i) => (
            <li key={title} className="flex gap-3">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-surface font-medium text-brand tabular">{i + 1}</span>
              <div>
                <p className="font-medium">{title}</p>
                <p className="text-muted">{text}</p>
              </div>
            </li>
          ))}
        </ol>
        <p className="text-muted">
          Neer checks the network, token, memo, amount, time left, network minimums, refund address and lookalike addresses. Safe to send
          means your transfer matches a quote signed by NEAR Intents. It is a check, not a guarantee.
        </p>
      </section>

      <section id="for-apps" className="scroll-mt-20 space-y-3">
        <h2 className="text-xl font-semibold">For apps</h2>
        <p className="text-muted">
          The same checks are available as a JSON API. <code className="font-mono text-sm">POST /api/v1/preflight</code> returns a verdict
          and every check; <code className="font-mono text-sm">GET /api/v1/track?address=…</code> returns the swap status in plain English.
          Errors never return Safe.
        </p>
        <pre className="overflow-x-auto rounded-xl border border-line bg-surface p-4 font-mono text-sm leading-6">{example}</pre>
      </section>
    </div>
  );
}
