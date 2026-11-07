import { ArrowRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import styles from "./home.module.css";

const PROBLEMS = [
  ["Your network must match the quote.", "Compares your selected sending network with the quote’s origin network, not just a list of supported networks."],
  ["Your quote must still be valid.", "Checks the quote deadline against the current time and the network’s estimated confirmation time."],
  ["Your amount must meet the quote’s requirement.", "Compares your entered amount with the quote’s required input or minimum, depending on swap type."],
] as const;

const STEPS = [
  ["Paste your deposit details.", "Paste the deposit address from your swap app, then enter the network, token and amount you intend to send."],
  ["Read the findings and warnings.", "For example, an expired quote returns “Don’t send” and asks you to get a new quote from your swap app."],
  ["Decide whether to send.", "A warning needs review, and no result guarantees success. You decide whether to send from your wallet."],
] as const;

export default function Home() {
  return (
    <div className={styles.home}>
      <header className={styles.header}>
        <Link href="/" aria-label="Neer home" className={styles.brand}>
          <Image src="/neer-logo.png" alt="Neer" width={80} height={78} priority />
        </Link>
      </header>

      <main id="main" tabIndex={-1} className={styles.main}>
        <section className={styles.hero} aria-labelledby="hero-title">
          <p className={styles.eyebrow}>Review a NEAR Intents deposit before sending.</p>
          <h1 id="hero-title">
            <span>Check whether your deposit details</span>{" "}
            <span className={styles.teal}>match your quote.</span>
          </h1>
          <p className={styles.description}>Neer compares your deposit address, chosen network, token, amount and required memo with the signed NEAR Intents quote, and checks its deadline.</p>
          <div className={styles.actions}>
            <Link href="/check" aria-label="Check a deposit" className={styles.primary}>
              Check a deposit
              <span className={styles.arrow} aria-hidden="true"><ArrowRight size={21} aria-hidden="true" /></span>
            </Link>
          </div>
        </section>

        <section id="how-it-works" className={styles.how} aria-labelledby="how-title">
          <h2 id="how-title">Review the findings before deciding whether to send.</h2>
          <ol className={styles.steps}>
            {STEPS.map(([step, detail], index) => (
              <li key={step}>
                <span className={styles.number} aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                <div><h3 className={styles.stepTitle}>{step}</h3><p className={styles.stepDetail}>{detail}</p></div>
              </li>
            ))}
          </ol>
        </section>

        <section className={styles.problems} aria-labelledby="problems-title">
          <h2 id="problems-title">Neer flags mismatches that need your attention.</h2>
          <dl className={styles.problemList}>
            {PROBLEMS.map(([problem, solution]) => (
              <div key={problem} className={styles.problemRow}>
                <dt>{problem}</dt>
                <dd>{solution}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className={styles.banner} aria-labelledby="control-title">
          <h2 id="control-title">Neer cannot recover funds after you send a transfer.</h2>
          <p>Checks happen before sending and do not verify the counterparty or guarantee delivery.</p>
        </section>
        <p className={styles.trust}>Neer does not request seed phrases or private keys, connect a wallet, or ask you to sign transactions.</p>
      </main>

      <footer className={styles.footer}>
        <nav aria-label="Footer">
          <Link href="/">Neer</Link><span aria-hidden="true">/</span>
          <Link href="/tools">Tools</Link><span aria-hidden="true">/</span>
          <Link href="/resources">Resources</Link><span aria-hidden="true">/</span>
          <Link href="/privacy">Privacy</Link>
        </nav>
        <p>Independent project, not affiliated with NEAR Foundation.</p>
        <p>Built for NEAR Hackathon 2026</p>
      </footer>
    </div>
  );
}
