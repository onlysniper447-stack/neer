import { describe, expect, it } from "vitest";
import { STATUSES, describeStatus, isTerminal } from "../src/index.js";
import { TOKENS, arbUsdc, makeStatus } from "../../../fixtures/src/scenarios.js";

const now = new Date("2026-11-07T12:00:00Z");
const qr = arbUsdc(now);

describe("describeStatus", () => {
  it("has plain-English copy for every 1Click status", () => {
    for (const s of STATUSES) {
      const v = describeStatus(makeStatus(qr, s, now), TOKENS);
      expect(v.label.length).toBeGreaterThan(3);
      expect(v.message.length).toBeGreaterThan(10);
      expect(v.timeline.length).toBeGreaterThanOrEqual(4);
      if (v.terminal) expect(v.timeline.every((x) => x.state === "done")).toBe(true);
      else expect(v.timeline.filter((x) => x.state === "current")).toHaveLength(1);
    }
  });

  it("PENDING_DEPOSIT tells you what to send and where", () => {
    const v = describeStatus(makeStatus(qr, "PENDING_DEPOSIT", now), TOKENS);
    expect(v.label).toBe("Waiting for your deposit");
    expect(v.message).toBe("Send 5.0 USDC on Arbitrum to this address before the deadline.");
    expect(v.terminal).toBe(false);
  });

  it("PROCESSING uses the quote's time estimate", () => {
    const v = describeStatus(makeStatus(qr, "PROCESSING", now), TOKENS);
    expect(v.message).toBe("This usually takes about 22 seconds.");
    expect(v.timeline.map((s) => s.state)).toEqual(["done", "done", "current", "upcoming"]);
  });

  it("SUCCESS names the destination token and recipient", () => {
    const v = describeStatus(makeStatus(qr, "SUCCESS", now), TOKENS);
    expect(v.label).toBe("Done. Your USDC has arrived");
    expect(v.message).toContain("13QkxhNMrTPxoCkRdYdJ65tFuwXPhL5gLS2Z5Nr6gjRK");
    expect(v.tone).toBe("safe");
    expect(v.terminal).toBe(true);
  });

  it("terminal statuses stop polling", () => {
    expect(isTerminal("SUCCESS")).toBe(true);
    expect(isTerminal("REFUNDED")).toBe(true);
    expect(isTerminal("FAILED")).toBe(true);
    expect(isTerminal("PROCESSING")).toBe(false);
    expect(isTerminal("INCOMPLETE_DEPOSIT")).toBe(false);
  });

  it("FAILED never asks for a seed phrase and doesn't point to a missing helper", () => {
    const v = describeStatus(makeStatus(qr, "FAILED", now), TOKENS);
    expect(v.message).toContain("never asks for your seed phrase");
    expect(v.message).not.toMatch(/refund helper/i);
  });
});
