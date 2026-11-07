import { ArrowRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import styles from "./home.module.css";

const PROBLEMS = [
  ["Wrong network", "Check the destination network"],
  ["Expired quote", "See the deadline before sending"],
  ["Unclear progress", "Follow the transfer status"],
] as const;

const STEPS = [
  "Paste your deposit details",
  "Review checks and warnings",
  "Send from your wallet when ready",
] as const;

export default function Home() {
  return (
    <div className={styles.home}>
      <header className={styles.header}>
        <Link href="/" aria-label="Neer home" className={styles.wordmark}>
          <span>Neer</span>
          <Image src="/neer-logo.png" alt="" width={52} height={51} priority />
        </Link>
      </header>

      <main id="main" tabIndex={-1} className={styles.main}>
        <section className={styles.hero} aria-labelledby="hero-title">
          <p className={styles.eyebrow}>NEAR Intents, checked.</p>
          <h1 id="hero-title">
            <span>Check the deposit.</span>
            <span className={styles.teal}>Then make your move.</span>
          </h1>
          <p className={styles.description}>Check your NEAR Intents deposit details before you send funds.</p>
          <div className={styles.actions}>
            <Link href="/check" aria-label="Check a deposit" className={styles.primary}>
              Check a deposit
              <span className={styles.arrow} aria-hidden="true"><ArrowRight size={21} aria-hidden="true" /></span>
            </Link>
            <a href="#how-it-works" className={styles.secondary}>How it works</a>
          </div>
        </section>

        <section className={styles.problems} aria-labelledby="problems-title">
          <h2 id="problems-title">Small mistakes. Stuck transfers.</h2>
          <dl className={styles.problemList}>
            {PROBLEMS.map(([problem, solution]) => (
              <div key={problem} className={styles.problemRow}>
                <dt>{problem}</dt>
                <dd>{solution}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section id="how-it-works" className={styles.how} aria-labelledby="how-title">
          <h2 id="how-title">How Neer works</h2>
          <ol className={styles.steps}>
            {STEPS.map((step, index) => (
              <li key={step}>
                <span className={styles.number} aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </section>

        <section className={styles.banner} aria-labelledby="control-title">
          <h2 id="control-title">Your wallet. Your decision.</h2>
          <p>Neer checks details. You stay in control.</p>
        </section>
      </main>

      <footer className={styles.footer}>
        <nav aria-label="Footer">
          <Link href="/">Neer</Link><span aria-hidden="true">/</span>
          <Link href="/tools">Tools</Link><span aria-hidden="true">/</span>
          <Link href="/resources">Resources</Link>
        </nav>
        <p>Built for NEAR Hackathon 2026</p>
      </footer>
    </div>
  );
}
