import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy",
  description: "How Neer handles deposit lookups, browser statistics and IP-based rate limiting.",
};

export default function PrivacyPage() {
  return (
    <article className="mx-auto max-w-3xl space-y-8 pb-8">
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Neer processes deposit details and request metadata.</h1>
      <section className="space-y-3" aria-labelledby="lookup-data">
        <h2 id="lookup-data" className="text-xl font-semibold">Deposit details are used to look up your quote.</h2>
        <p>Neer sends your deposit address and any memo to the NEAR Intents 1Click API to retrieve the quote and transfer status.</p>
        <p>The application does not write deposit addresses or checks to a persistent database.</p>
        <p>Tracker lookups are cached in server memory, keyed by address and memo. The cache reuses a result for up to five seconds.</p>
        <p>This reuse window is not a deletion deadline. In-memory entries can remain until replaced, cleaned up or the server instance stops.</p>
        <p>Addresses and memos also appear in check and tracker URLs. Browser history and hosting or upstream request logs may retain those URLs.</p>
        <p>Hosting and upstream providers may keep request logs. This page does not specify their retention periods.</p>
      </section>
      <section className="space-y-3" aria-labelledby="rhea-data">
        <h2 id="rhea-data" className="text-xl font-semibold">The RHEA route estimate sends route details to RHEA.</h2>
        <p>When you request an estimate, Neer&apos;s server sends the chains, tokens, amount, slippage limit and the public addresses you entered to the RHEA Finance API.</p>
        <p>Token lists for that page are also loaded from RHEA through Neer&apos;s server and cached in server memory for up to ten minutes.</p>
        <p>Neer does not store these details. RHEA may keep its own request logs. This page does not specify RHEA&apos;s retention periods.</p>
      </section>
      <section className="space-y-3" aria-labelledby="browser-data">
        <h2 id="browser-data" className="text-xl font-semibold">Your browser keeps local statistics and your theme preference.</h2>
        <p>Statistics in localStorage contain verdict counts, network IDs, and first and latest check times, not deposit addresses, amounts or quotes.</p>
        <p>These statistics are not sent to Neer’s server. You can clear them on the <Link href="/analytics" className="text-brand underline">Analytics page</Link>.</p>
        <p>The theme selector also saves your theme preference in localStorage. You can remove localStorage through your browser’s site-data controls.</p>
        <p>If you choose to save a signed quote, Neer downloads a receipt to your device. That file can include deposit details.</p>
      </section>
      <section className="space-y-3" aria-labelledby="ip-data">
        <h2 id="ip-data" className="text-xl font-semibold">IP addresses are used to limit repeated requests.</h2>
        <p>Neer uses the request’s IP address as a rate-limit key. When Upstash Redis is configured, that key is sent to Upstash.</p>
        <p>Otherwise, rate-limit keys are kept in server memory. The configured request-counting window is one minute, not a promise about deletion or log retention.</p>
      </section>
      <section className="space-y-3" aria-labelledby="wallet-data">
        <h2 id="wallet-data" className="text-xl font-semibold">Neer does not connect to your wallet.</h2>
        <p>Neer does not request seed phrases or private keys, ask for wallet signatures, or sign or send transactions.</p>
        <p>Neer cannot recover funds once a transfer is sent. Matching a quote does not verify the counterparty or guarantee delivery.</p>
        <p>Independent project, not affiliated with NEAR Foundation.</p>
      </section>
    </article>
  );
}
