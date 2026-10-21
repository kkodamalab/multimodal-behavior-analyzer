import { describe, it, expect } from "vitest";
import {
  newProject,
  validateAnnotation,
  editAnnotation,
  parseProject,
  csv,
  durationOf,
  transcript,
} from "./model";
import { exportEaf, importEaf } from "./eaf";
const fixture = () => {
  const p = newProject();
  p.annotations = [
    {
      id: "a1",
      tierId: p.tiers[0].id,
      start: 1,
      end: 2,
      text: 'えー、hello < & "研究"',
      source: "manual",
      createdAt: new Date().toISOString(),
      history: [],
    },
  ];
  return p;
};
describe("Project invariants", () => {
  it("creates independent projects and seven default tiers", () => {
    const p = newProject();
    expect(p.tiers).toHaveLength(7);
    expect(newProject().id).not.toBe(p.id);
  });
  it.each([
    [-1, 2],
    [2, 2],
    [3, 2],
    [NaN, 3],
    [0, Infinity],
  ])("rejects invalid interval %s %s", (start, end) => {
    const p = fixture();
    expect(() =>
      validateAnnotation({ start, end, tierId: p.tiers[0].id, text: "" }, p),
    ).toThrow();
  });
  it("rejects same-tier overlap but allows boundaries and different tiers", () => {
    const p = fixture();
    expect(() =>
      validateAnnotation(
        { start: 1.5, end: 3, tierId: p.tiers[0].id, text: "" },
        p,
      ),
    ).toThrow();
    expect(() =>
      validateAnnotation(
        { start: 2, end: 3, tierId: p.tiers[0].id, text: "" },
        p,
      ),
    ).not.toThrow();
    expect(() =>
      validateAnnotation(
        { start: 1, end: 2, tierId: p.tiers[1].id, text: "" },
        p,
      ),
    ).not.toThrow();
  });
  it("keeps revisions and original project unchanged", () => {
    const p = fixture();
    p.raw = [{ original: "immutable" }];
    const next = editAnnotation(p, "a1", {
      ...p.annotations[0],
      text: "修正版",
      start: 2,
      end: 3,
    });
    expect(next.annotations[0].history[0].before.text).toBe(
      p.annotations[0].text,
    );
    expect(next.raw).toEqual(p.raw);
    expect(p.annotations[0].history).toEqual([]);
  });
  it("roundtrips JSON including original data and history", () => {
    const p = fixture();
    expect(parseProject(JSON.stringify(p))).toEqual(p);
  });
  it("rejects malformed and overlapping imported projects", () => {
    expect(() => parseProject("{}")).toThrow();
    const p = fixture();
    p.annotations.push({ ...p.annotations[0], id: "a2" });
    expect(() => parseProject(JSON.stringify(p))).toThrow();
  });
  it("rejects malicious tier styling and non-finite media metadata", () => {
    const p = fixture();
    p.tiers[0].color = "url(https://bad)";
    expect(() => parseProject(JSON.stringify(p))).toThrow();
  });
  it("escapes CSV quotes, formulas and multiline content", () => {
    const p = fixture();
    p.annotations[0].text = '=SUM(1,2)\n"hi"';
    expect(csv(p)).toContain('"\'=SUM(1,2)\n""hi"""');
  });
  it("exports timestamped transcript without generating speech", () => {
    const p = fixture();
    expect(transcript(p)).toContain("[00:01.00–00:02.00] Speech_A: えー");
    expect(durationOf(p)).toBe(2);
  });
});
describe("EAF subset", () => {
  it("roundtrips aligned tier names, Unicode and XML escaping", () => {
    const p = fixture();
    p.tiers[0].name = "Speech & A";
    const result = importEaf(exportEaf(p));
    expect(result.annotations.map((a) => [a.start, a.end, a.text])).toEqual(
      p.annotations.map((a) => [a.start, a.end, a.text]),
    );
    expect(result.tiers[0].name).toBe("Speech & A");
  });
  it("uses millisecond slots and shared references", () => {
    const xml = exportEaf(fixture());
    expect(xml).toContain('TIME_VALUE="1000"');
    expect(xml).toContain('TIME_SLOT_REF2="ts2"');
    expect(xml).toContain('LINGUISTIC_TYPE_REF="default-lt"');
  });
  it("rejects unsupported references instead of dropping annotations", () => {
    expect(() =>
      importEaf(
        '<ANNOTATION_DOCUMENT><TIER TIER_ID="t"><REF_ANNOTATION/></TIER></ANNOTATION_DOCUMENT>',
      ),
    ).toThrow(/参照/);
  });
  it("rejects malformed XML, entities and unknown time slots", () => {
    expect(() => importEaf("<bad>")).toThrow();
    expect(() => importEaf("<!DOCTYPE x><ANNOTATION_DOCUMENT/>")).toThrow();
    expect(() =>
      importEaf(
        '<ANNOTATION_DOCUMENT><TIER TIER_ID="t"><ALIGNABLE_ANNOTATION TIME_SLOT_REF1="missing" TIME_SLOT_REF2="missing"/></TIER></ANNOTATION_DOCUMENT>',
      ),
    ).toThrow();
  });
  it("rejects submillisecond intervals lost by EAF rounding", () => {
    const p = fixture();
    p.annotations[0].start = 1;
    p.annotations[0].end = 1.0001;
    expect(() => exportEaf(p)).toThrow();
  });
});
