// Unit tests for the civic intelligence layer. Run: npm test
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { assign } from "@/lib/intel/assignment";
import { inferRootCause, relatedness, systemicCause } from "@/lib/intel/causal";
import { assessEvidence, parseDurationClaim } from "@/lib/intel/evidence";
import { geohash, geohashBounds, haversineM, segmentKey } from "@/lib/intel/geo";
import { detectAlerts, detectIncidents, poissonTail, type ClusterInput, type ReportEvent } from "@/lib/intel/incidents";
import { journey } from "@/lib/intel/journey";
import { computePriority, type PriorityInput } from "@/lib/intel/priority";
import { rainImpact } from "@/lib/intel/rain";
import { buildTimeline } from "@/lib/intel/timeline";
import { scoreVerification } from "@/lib/intel/verification";

const KORAMANGALA = { lat: 12.9352, lng: 77.6245 };
const north = (m: number, base = KORAMANGALA) => ({ lat: base.lat + m / 111_320, lng: base.lng });

describe("geo", () => {
  test("haversine is about right", () => {
    assert.ok(Math.abs(haversineM(KORAMANGALA, north(100)) - 100) < 1);
  });
  test("geohash round trips to its cell", () => {
    const h = geohash(KORAMANGALA, 7);
    const b = geohashBounds(h);
    assert.ok(haversineM(b.center, KORAMANGALA) < 120);
  });
  test("segment keys combine road and cell", () => {
    assert.match(segmentKey("80 Feet Road", KORAMANGALA), /^80-feet-road:[0-9a-z]{7}$/);
  });
});

describe("causal graph", () => {
  test("waterlogging, potholes and garbage point to a drainage failure", () => {
    const r = inferRootCause({ waterlogging: 25, pothole: 9, garbage: 6 });
    assert.equal(r.cause, "blocked_drain");
    assert.ok(r.confidence > 0.5, `confidence ${r.confidence}`);
    assert.ok(r.graph.edges.some((e) => e.from === "garbage" && e.to === "blocked_drain"));
  });
  test("streetlights and power hazards point to an electrical fault", () => {
    assert.equal(inferRootCause({ streetlight: 4, power_hazard: 2 }).cause, "electrical_fault");
  });
  test("heavy rain lifts rainfall as the cause of pure waterlogging", () => {
    const dry = inferRootCause({ waterlogging: 10 }).ranked.find((x) => x.cause === "heavy_rainfall")!.score;
    const wet = inferRootCause({ waterlogging: 10 }, { recentRainMm: 60 }).ranked.find((x) => x.cause === "heavy_rainfall")!.score;
    assert.ok(wet > dry);
  });
  test("related and unrelated problems", () => {
    assert.ok(relatedness("waterlogging", "pothole") >= 0.3);
    assert.ok(relatedness("garbage", "streetlight") < 0.3);
  });
  test("recurring potholes have a systemic cause", () => {
    assert.ok(["road_base_failure", "blocked_drain", "water_main_leak"].includes(systemicCause("pothole").cause));
  });
});

describe("incident detection", () => {
  const now = Date.now();
  const at = (h: number) => new Date(now - h * 3_600_000).toISOString();
  const issue = (id: number, m: number, category: ClusterInput["category"], backers: number, h: number): ClusterInput => ({
    id, ...north(m), category, status: "open", severity: 3, backerCount: backers, createdAt: at(h),
  });

  test("a flooded street with potholes becomes one drainage incident", () => {
    const found = detectIncidents([
      issue(1, 0, "waterlogging", 12, 10), issue(2, 150, "waterlogging", 8, 8), issue(3, 300, "pothole", 3, 6),
      issue(4, 220, "drainage", 2, 5), issue(5, 5000, "garbage", 4, 3),
    ]);
    assert.equal(found.length, 1);
    const inc = found[0]!;
    assert.deepEqual([...inc.issueIds].sort(), [1, 2, 3, 4]);
    assert.equal(inc.reportCount, 25);
    assert.equal(inc.rootCause.cause, "blocked_drain");
    assert.equal(inc.signature, "cluster:1");
  });
  test("unrelated problems side by side stay separate", () => {
    assert.equal(detectIncidents([issue(1, 0, "garbage", 3, 2), issue(2, 20, "streetlight", 3, 2)]).length, 0);
  });
  test("verified issues are left out", () => {
    const a = issue(1, 0, "waterlogging", 5, 2);
    const b = { ...issue(2, 50, "waterlogging", 5, 2), status: "verified" as const };
    assert.equal(detectIncidents([a, b]).length, 0);
  });

  test("poisson tail", () => {
    assert.ok(Math.abs(poissonTail(1, 1) - (1 - Math.exp(-1))) < 1e-9);
    assert.ok(poissonTail(12, 0.2) < 1e-9);
  });
  test("a sudden burst raises an alert; the same reports spread over weeks do not", () => {
    const burst: ReportEvent[] = Array.from({ length: 12 }, (_, i) => ({ issueId: 100 + (i % 8), category: "waterlogging", ...north(i * 40), at: new Date(now - i * 4 * 60_000).toISOString() }));
    const alerts = detectAlerts(burst, now);
    assert.equal(alerts.length, 1);
    assert.equal(alerts[0]!.reports, 12);
    assert.equal(alerts[0]!.locations, 8);
    assert.equal(alerts[0]!.title, "Possible localised flooding");
    const slow = burst.map((e, i) => ({ ...e, at: new Date(now - i * 3 * 86_400_000).toISOString() }));
    assert.equal(detectAlerts(slow, now).length, 0);
  });
});

describe("priority", () => {
  const base: PriorityInput = {
    category: "pothole", severity: 3, backerCount: 1, accessibility: "none", roadClass: "residential", isRecurring: false,
    previousRepairs: 0, evidenceConfidence: 0.4, recentMerges: 0, rainLast3DaysMm: 0, daysOpen: 2, inIncident: false,
  };
  test("upvotes alone do not make a case critical", () => {
    const popular = computePriority({ ...base, category: "garbage", severity: 2, backerCount: 40 });
    assert.notEqual(popular.band, "critical");
  });
  test("a recurring pedestrian hazard ranks above a minor one-off, and says why", () => {
    const hazard = computePriority({ ...base, category: "footpath", severity: 5, accessibility: "major", isRecurring: true, previousRepairs: 2, roadClass: "primary" });
    const minor = computePriority({ ...base, severity: 1 });
    assert.ok(hazard.score > minor.score + 30);
    assert.match(hazard.reason, /accessibility|repeated|Safety/i);
    assert.equal(hazard.factors.length, 8);
  });
});

describe("crowd evidence", () => {
  const report = (o: Partial<Parameters<typeof assessEvidence>[0][number]>) => ({
    ...KORAMANGALA, deviceId: crypto.randomUUID(), aiSeverity: 4, userSeverity: null, media: "photo" as const,
    gpsAccuracyM: 10, durationClaimDays: null, createdAt: new Date().toISOString(), ...o,
  });
  test("agreeing reports with video give high severity and location confidence", () => {
    const e = assessEvidence([report({ media: "video" }), report({ userSeverity: 4 }), report({ aiSeverity: 5 })], { recurring: false, previousRepairs: 0, causeConfidence: null, causeLabel: null });
    assert.equal(e.severity.estimate, 4);
    assert.ok(e.location.confidence > 0.65);
    assert.equal(e.independentReports, 3);
  });
  test("disagreement lowers severity confidence", () => {
    const agree = assessEvidence([report({}), report({}), report({})], { recurring: false, previousRepairs: 0, causeConfidence: null, causeLabel: null });
    const split = assessEvidence([report({ aiSeverity: 1 }), report({ aiSeverity: 5 }), report({ aiSeverity: 2, userSeverity: 5 })], { recurring: false, previousRepairs: 0, causeConfidence: null, causeLabel: null });
    assert.ok(split.severity.confidence < agree.severity.confidence);
  });
  test("duration claims", () => {
    assert.equal(parseDurationClaim("It has been here for 3 months"), 90);
    assert.equal(parseDurationClaim("two weeks now"), 14);
    assert.equal(parseDurationClaim("terrible"), null);
  });
});

describe("assignment", () => {
  test("a blocked drain goes to storm water drains with a suction machine", () => {
    const a = assign({ category: "drainage", severity: 3, backerCount: 2, isRecurring: false, priorityBand: "medium" });
    assert.equal(a.department, "Storm Water Drains");
    assert.ok(a.equipment.includes("Suction machine"));
    assert.equal(a.urgency, "within a week");
  });
  test("recurring potholes get base repair, power hazards are immediate", () => {
    assert.match(assign({ category: "pothole", severity: 4, backerCount: 3, isRecurring: true, priorityBand: "high" }).workType, /Base repair/);
    assert.equal(assign({ category: "power_hazard", severity: 3, backerCount: 1, isRecurring: false, priorityBand: "low" }).urgency, "immediate");
  });
});

describe("time machine and rain", () => {
  test("finds the repair, the return and how long the repair lasted", () => {
    const t = buildTimeline(
      [
        { id: 1, category: "pothole", severity: 4, status: "verified", createdAt: "2026-03-02T10:00:00Z", verifiedAt: "2026-05-12T10:00:00Z", recurrenceOf: null },
        { id: 2, category: "pothole", severity: 4, status: "open", createdAt: "2026-06-23T10:00:00Z", verifiedAt: null, recurrenceOf: 1 },
      ],
      { now: new Date("2026-07-15T00:00:00Z") },
    );
    assert.equal(t.recurrences.length, 1);
    assert.equal(t.recurrences[0]!.lastedDays, 42);
    assert.equal(t.months.find((m) => m.month === "2026-05")!.events.some((e) => e.kind === "repaired"), true);
    assert.equal(t.months.find((m) => m.month === "2026-06")!.state, "problem");
  });
  test("reports that jump after heavy rain show a rainfall pattern", () => {
    const rain = new Map<string, number>();
    for (let d = 1; d <= 30; d++) rain.set(`2026-07-${String(d).padStart(2, "0")}`, d === 10 || d === 20 ? 40 : 0);
    const reports = ["10", "10", "11", "11", "12", "20", "20", "21", "22", "05"].map((d) => `2026-07-${d}T09:00:00Z`);
    const r = rainImpact(reports, rain);
    assert.equal(r.pattern, "strong");
    assert.ok((r.ratio ?? 0) > 2.5);
  });
});

describe("journey and verification", () => {
  test("the journey marks done, current and next", () => {
    const j = journey("assigned", "open", [{ kind: "reported", createdAt: "2026-10-01" }, { kind: "routed", createdAt: "2026-10-01" }, { kind: "assigned", createdAt: "2026-10-02" }]);
    assert.equal(j.find((s) => s.key === "assigned")!.state, "done");
    assert.equal(j.find((s) => s.key === "field_team")!.state, "current");
    assert.equal(j.find((s) => s.key === "citizen_verified")!.state, "next");
  });
  const base = {
    distanceM: 8, maxDistanceM: 50, sameSegment: true, modelSameLocation: true, modelSameRoad: true, sceneSimilarity: 0.7,
    modelResolved: true, modelConfidence: "high" as const, residualIssues: [], photoTakenAt: new Date(), issueCreatedAt: new Date(Date.now() - 86_400_000),
  };
  test("all checks pass: verified", () => {
    const r = scoreVerification(base);
    assert.equal(r.outcome, "verified");
    assert.ok(r.score >= 85);
  });
  test("a remaining blocked drain makes it partial", () => {
    const r = scoreVerification({ ...base, residualIssues: ["Drain still blocked"] });
    assert.equal(r.outcome, "partial");
    assert.equal(r.headline, "Partially resolved");
  });
  test("far away, or a photo older than the report, fails", () => {
    assert.equal(scoreVerification({ ...base, distanceM: 400 }).outcome, "failed");
    assert.equal(scoreVerification({ ...base, photoTakenAt: new Date(Date.now() - 3 * 86_400_000) }).outcome, "failed");
  });
});

describe("accessible routes", () => {
  test("the route that avoids a blocked footpath is recommended", async () => {
    const { rankRoutes, pointToSegmentM } = await import("@/lib/intel/route");
    assert.ok(Math.abs(pointToSegmentM({ lat: 12.9, lng: 77.6001 }, { lat: 12.9, lng: 77.6 }, { lat: 12.901, lng: 77.6 }) - 10.8) < 1);
    const direct: [number, number][] = [[77.6, 12.9], [77.6, 12.91]];
    const detour: [number, number][] = [[77.6, 12.9], [77.603, 12.905], [77.6, 12.91]];
    const ranked = rankRoutes(
      [{ coordinates: direct, distanceM: 1100, durationS: 800 }, { coordinates: detour, distanceM: 1300, durationS: 950 }],
      [{ id: 1, lat: 12.905, lng: 77.6, weight: 3, label: "Footpath damage", accessibility: "major" }],
    );
    assert.equal(ranked[0]!.distanceM, 1300);
    assert.equal(ranked[0]!.recommended, true);
    assert.equal(ranked[1]!.obstacles.length, 1);
  });
});
