import { describe, expect, it } from "vitest";
import { STATUSES, describeStatus, isTerminal } from "../src/index.js";
import { TOKENS, arbUsdc, makeStatus } from "../../../fixtures/src/scenarios.js";

const now = new Date("2026-11-07T12:00:00Z");
const qr = arbUsdc(now);

describe("describeStatus", () => {
  it("has plain-English copy for every 1Click status", () => {
    for (const s of STATUSES) {
      const v = describeStatus(makeStatus(qr, s, now), TOKENS, now);
      expect(v.label.length).toBeGreaterThan(3);
      expect(v.message.length).toBeGreaterThan(10);
      expect(v.timeline.length).toBeGreaterThanOrEqual(4);
      if (v.terminal) expect(v.timeline.every((x) => x.state === "done" || x.state === "skipped")).toBe(true);
      else expect(v.timeline.filter((x) => x.state === "current")).toHaveLength(1);
    }
  });

  it("PENDING_DEPOSIT requires preflight rather than authorizing a send", () => {
    const v = describeStatus(makeStatus(qr, "PENDING_DEPOSIT", now), TOKENS, now);
    expect(v.label).toBe("Waiting for your deposit");
    expect(v.message).toBe("NEAR Intents reports no deposit yet. Run preflight before deciding whether to send.");
    expect(v.terminal).toBe(false);
  });

  it("PROCESSING uses the quote's time estimate", () => {
    const v = describeStatus(makeStatus(qr, "PROCESSING", now), TOKENS, now);
    expect(v.message).toBe("NEAR Intents reports processing. The quote estimates about 22 seconds.");
    expect(v.timeline.map((s) => s.state)).toEqual(["done", "done", "current", "upcoming"]);
  });

  it("SUCCESS names the destination token and recipient", () => {
    const v = describeStatus(makeStatus(qr, "SUCCESS", now), TOKENS, now);
    expect(v.label).toBe("NEAR Intents reports completion");
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
    const v = describeStatus(makeStatus(qr, "FAILED", now), TOKENS, now);
    expect(v.message).toContain("never asks for your seed phrase");
    expect(v.message).not.toMatch(/refund helper/i);
  });
});

it("expired pending quotes never invite a deposit, but remain trackable", () => {
  const expired = arbUsdc(now, { requestDeadlineMin: -1 });
  const view = describeStatus(makeStatus(expired, "PENDING_DEPOSIT", now), TOKENS, now);
  expect(view.label).toBe("Quote expired");
  expect(view.message).toContain("Do not send");
  expect(view.tone).toBe("stop");
  expect(view.terminal).toBe(false);
  expect(view.timeline[0]?.title).toBe("Quote expired");
});

it("the pending tracker switches at the exact earlier deadline", () => {
  const st = makeStatus(qr, "PENDING_DEPOSIT", now);
  const deadline = new Date(qr.quoteRequest.deadline);
  expect(describeStatus(st, TOKENS, new Date(deadline.getTime() - 1)).label).toBe("Waiting for your deposit");
  expect(describeStatus(st, TOKENS, deadline).label).toBe("Quote expired");
});
