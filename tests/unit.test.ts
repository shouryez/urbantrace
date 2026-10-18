// Unit tests (Build Plan, Testing): the category to agency map, the verification pass rule,
// and the Zod schemas against bad model output. Run: npm test
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { CATEGORIES, complaintLetterSchema, fixVerdictSchema, photoReadingSchema, type FixVerdict } from "@/lib/ai/schemas";
import { submitBodySchema } from "@/lib/reports";
import { agencyFor, responsibleBody } from "@/lib/routing";
import { MAX_VERIFY_DISTANCE_M, passesVerification } from "@/lib/verify";

describe("routing: category to agency (F5)", () => {
  test("water leaks and sewage go to BWSSB", () => assert.equal(agencyFor("water_leak_sewage"), "BWSSB"));
  test("power line hazards go to BESCOM", () => assert.equal(agencyFor("power_hazard"), "BESCOM"));
  test("everything else goes to the city corporation", () => {
    for (const c of ["pothole", "garbage", "streetlight", "waterlogging", "other"] as const) {
      assert.equal(agencyFor(c), "corporation", c);
    }
  });
  test("every category has an agency", () => {
    for (const c of CATEGORIES) assert.ok(agencyFor(c));
  });
  test("responsible body names", () => {
    assert.match(responsibleBody("BWSSB", null), /BWSSB/);
    assert.match(responsibleBody("BESCOM", "south"), /BESCOM/);
    assert.equal(responsibleBody("corporation", "south"), "Bengaluru South City Corporation");
    assert.equal(responsibleBody("corporation", null), "the City Corporation");
  });
});

describe("verification pass rule (F7)", () => {
  const fixed: FixVerdict = { same_location: true, issue_resolved: true, confidence: "high", reason: "Patched", same_road: true, residual_issues: [] };

  test("passes within 50 m when the model confirms the fix", () => {
    assert.equal(passesVerification(12, fixed), true);
    assert.equal(passesVerification(MAX_VERIFY_DISTANCE_M, { ...fixed, confidence: "medium" }), true);
  });
  test("fails over 50 m even when the model says fixed", () => {
    assert.equal(passesVerification(MAX_VERIFY_DISTANCE_M + 0.1, fixed), false);
    assert.equal(passesVerification(400, fixed), false);
  });
  test("fails on low confidence, a different place or an unresolved issue", () => {
    assert.equal(passesVerification(5, { ...fixed, confidence: "low" }), false);
    assert.equal(passesVerification(5, { ...fixed, same_location: false }), false);
    assert.equal(passesVerification(5, { ...fixed, issue_resolved: false }), false);
  });
});

describe("Zod schemas against bad model output", () => {
  const reading = { is_civic_issue: true, category: "pothole", severity: 4, summary: "Deep pothole across the left lane." };

  test("a valid photo reading passes", () => assert.equal(photoReadingSchema.safeParse(reading).success, true));
  test("photo reading: unknown category, out of range severity, long or empty summary, missing field", () => {
    for (const bad of [
      { ...reading, category: "tree" },
      { ...reading, severity: 0 },
      { ...reading, severity: 6 },
      { ...reading, severity: 3.5 },
      { ...reading, summary: "x".repeat(121) },
      { ...reading, summary: "" },
      { ...reading, is_civic_issue: "yes" },
      { category: "pothole", severity: 4, summary: "No flag" },
      "pothole",
      null,
    ]) {
      assert.equal(photoReadingSchema.safeParse(bad).success, false, JSON.stringify(bad));
    }
  });
  test("fix verdict: bad confidence or long reason fail", () => {
    const verdict = { same_location: true, issue_resolved: false, confidence: "medium", reason: "Still there" };
    assert.equal(fixVerdictSchema.safeParse(verdict).success, true);
    assert.equal(fixVerdictSchema.safeParse({ ...verdict, confidence: "certain" }).success, false);
    assert.equal(fixVerdictSchema.safeParse({ ...verdict, reason: "x".repeat(161) }).success, false);
    assert.equal(fixVerdictSchema.safeParse({ ...verdict, issue_resolved: undefined }).success, false);
  });
  test("complaint letter: empty or overlong parts fail", () => {
    assert.equal(complaintLetterSchema.safeParse({ subject: "Repair request", body: "Dear Sir," }).success, true);
    assert.equal(complaintLetterSchema.safeParse({ subject: "", body: "Dear Sir," }).success, false);
    assert.equal(complaintLetterSchema.safeParse({ subject: "x".repeat(141), body: "Dear Sir," }).success, false);
    assert.equal(complaintLetterSchema.safeParse({ subject: "Repair", body: "x".repeat(1601) }).success, false);
  });
  test("submit body: only photo paths written by analyze are accepted", () => {
    const body = {
      lat: 12.93, lng: 77.62, photoPath: "reports/0b9f2a64-3a52-4f43-9a0e-1c3c6f1f8f11.jpg", category: "pothole",
      severity: 4, summary: "Pothole", ai: null, userEdited: false, deviceId: "6f1c2a1e-9d7b-4b1e-8a52-2d6c0f3e9a10",
    };
    assert.equal(submitBodySchema.safeParse(body).success, true);
    assert.equal(submitBodySchema.safeParse({ ...body, photoPath: "verifications/x.jpg" }).success, false);
    assert.equal(submitBodySchema.safeParse({ ...body, photoPath: "../../secret.jpg" }).success, false);
    assert.equal(submitBodySchema.safeParse({ ...body, lat: 120 }).success, false);
  });
});
