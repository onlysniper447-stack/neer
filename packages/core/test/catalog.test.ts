import { describe, expect, it } from "vitest";
import { CHECK_IDS, REQUIRED_CHECKS, RULES, RULE_CATALOG, STATUS_LABELS } from "../src/index.js";

describe("RULE_CATALOG", () => {
  it("lists every rule once, in engine order, with the same titles", () => {
    expect(RULE_CATALOG.map((r) => r.id)).toEqual(RULES.map((r) => r.id));
    expect(RULE_CATALOG.map((r) => r.title)).toEqual(RULES.map((r) => r.title));
    expect(new Set(RULE_CATALOG.map((r) => r.id)).size).toBe(CHECK_IDS.length);
  });

  it("required checks can all block or warn, so none of them is a silent note", () => {
    for (const id of REQUIRED_CHECKS) {
      const r = RULE_CATALOG.find((x) => x.id === id)!;
      expect(r.maxSeverity === "block" || r.maxSeverity === "warn").toBe(true);
    }
  });

  it("maxSeverity agrees with the blocks / warns text", () => {
    for (const r of RULE_CATALOG) {
      if (r.maxSeverity === "block") expect(r.blocksWhen).toBeTruthy();
      else expect(r.blocksWhen).toBeNull();
      if (r.maxSeverity === "info") expect(r.warnsWhen).toBeNull();
    }
  });
});

describe("STATUS_LABELS", () => {
  it("covers every 1Click status with tracker copy", () => {
    expect(STATUS_LABELS.PENDING_DEPOSIT.label).toBe("Waiting for your deposit");
    expect(STATUS_LABELS.SUCCESS.terminal).toBe(true);
    expect(STATUS_LABELS.PROCESSING.terminal).toBe(false);
    expect(Object.keys(STATUS_LABELS)).toHaveLength(7);
  });
});
