import { describe, expect, it } from "vitest";
import { preflight, RULES } from "@neer/core";
import { FINDING_CODES, verifyLegacyPreflight } from "../src/index.js";
import { projectVerification } from "../src/projection.js";
import { cases, scenario } from "./scenarios.js";

describe("every public FindingCode has an exercised fixture",()=>{
 it("covers the entire public literal union, with no untested code",()=>{expect(Object.keys(cases).sort()).toEqual([...FINDING_CODES].sort());});
 for(const code of FINDING_CODES) {
  it(code,async()=>{
   const l=scenario(code);const rule=RULES[0]!;const original=rule.run;
   try {
    if(code==="RULE_EXECUTION_FAILED")rule.run=()=>{throw new Error("FAKE_RULE_FAILURE");};
    if(code==="REQUIRED_CHECK_MISSING")rule.run=()=>null;
    const result=await verifyLegacyPreflight(l);
    const publicResult=projectVerification(result);
    const finding=publicResult.findings.find((f)=>f.code===code);
    expect(finding,JSON.stringify(publicResult)).toBeDefined();
    expect(finding?.severity).toMatch(/^(block|warn)$/);
    expect(finding?.fix.length).toBeGreaterThan(0);
    expect(finding?.message).toMatchSnapshot(code);
    // Async compatibility exposes exactly the existing legacy structure, not the projection.
    expect(result).toEqual(preflight(l));expect(JSON.stringify(result)).not.toContain('"code":');
   } finally {rule.run=original;}
  });
 }
});
