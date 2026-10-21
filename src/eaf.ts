import {
  newProject,
  uid,
  colors,
  validateAnnotation,
  type Project,
} from "./model";
const esc = (s: string) =>
  s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
export function exportEaf(p: Project) {
  const times = [
    ...new Set(
      p.annotations.flatMap((a) => [
        Math.round(a.start * 1000),
        Math.round(a.end * 1000),
      ]),
    ),
  ].sort((a, b) => a - b);
  for (const a of p.annotations) {
    validateAnnotation(a, p, a.id);
    if (Math.round(a.end * 1000) <= Math.round(a.start * 1000))
      throw new Error("EAF出力には1ms以上の区間が必要です。");
  }
  const slot = (t: number) => `ts${times.indexOf(Math.round(t * 1000)) + 1}`;
  return `<?xml version="1.0" encoding="UTF-8"?>\n<ANNOTATION_DOCUMENT AUTHOR="MBA" DATE="${new Date().toISOString()}" FORMAT="3.0" VERSION="3.0" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="http://www.mpi.nl/tools/elan/EAFv3.0.xsd">\n<HEADER MEDIA_FILE="" TIME_UNITS="milliseconds">${p.media.map((m) => `<MEDIA_DESCRIPTOR MEDIA_URL="file:///${esc(encodeURIComponent(m.name))}" RELATIVE_MEDIA_URL="./${esc(encodeURIComponent(m.name))}" MIME_TYPE="${esc(m.type || "application/octet-stream")}" TIME_ORIGIN="${-Math.round(m.offset * 1000)}"/>`).join("")}</HEADER>\n<TIME_ORDER>${times.map((t, i) => `<TIME_SLOT TIME_SLOT_ID="ts${i + 1}" TIME_VALUE="${t}"/>`).join("")}</TIME_ORDER>\n${p.tiers
    .map(
      (t) =>
        `<TIER TIER_ID="${esc(t.name)}" LINGUISTIC_TYPE_REF="default-lt">${p.annotations
          .filter((a) => a.tierId === t.id)
          .sort((a, b) => a.start - b.start)
          .map(
            (a) =>
              `<ANNOTATION><ALIGNABLE_ANNOTATION ANNOTATION_ID="a${p.annotations.indexOf(a) + 1}" TIME_SLOT_REF1="${slot(a.start)}" TIME_SLOT_REF2="${slot(a.end)}"><ANNOTATION_VALUE>${esc(a.text)}</ANNOTATION_VALUE></ALIGNABLE_ANNOTATION></ANNOTATION>`,
          )
          .join("")}</TIER>`,
    )
    .join(
      "\n",
    )}\n<LINGUISTIC_TYPE LINGUISTIC_TYPE_ID="default-lt" TIME_ALIGNABLE="true" GRAPHIC_REFERENCES="false"/>\n</ANNOTATION_DOCUMENT>`;
}
export function importEaf(xml: string): Project {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml))
    throw new Error("DTD/ENTITYを含むEAFには対応していません。");
  const d = new DOMParser().parseFromString(xml, "application/xml");
  if (
    d.querySelector("parsererror") ||
    d.documentElement.tagName !== "ANNOTATION_DOCUMENT"
  )
    throw new Error("有効なEAF XMLではありません。");
  if (d.querySelector("REF_ANNOTATION") || d.querySelector("TIER[PARENT_REF]"))
    throw new Error(
      "参照注釈・階層Tierは未対応です。時間整列した独立TierのEAFを使用してください。",
    );
  const slots = new Map<string, number>();
  for (const s of d.querySelectorAll("TIME_SLOT")) {
    const v = s.getAttribute("TIME_VALUE");
    if (v === null || !/^\d+$/.test(v))
      throw new Error("未確定のTIME_SLOTは未対応です。");
    const id = s.getAttribute("TIME_SLOT_ID")!;
    if (slots.has(id)) throw new Error("TIME_SLOT_IDが重複しています。");
    slots.set(id, Number(v) / 1000);
  }
  const p = newProject();
  p.name = "Imported EAF";
  p.tiers = [];
  for (const t of d.querySelectorAll("TIER")) {
    const name = t.getAttribute("TIER_ID");
    if (!name || p.tiers.some((t) => t.name === name))
      throw new Error("Tier名が無効または重複しています。");
    const tier = {
      id: uid(),
      name,
      color: colors[p.tiers.length % colors.length],
      visible: true,
    };
    p.tiers.push(tier);
    for (const a of t.querySelectorAll("ALIGNABLE_ANNOTATION")) {
      const annotation = {
        id: uid(),
        tierId: tier.id,
        start: slots.get(a.getAttribute("TIME_SLOT_REF1")!)!,
        end: slots.get(a.getAttribute("TIME_SLOT_REF2")!)!,
        text: a.querySelector("ANNOTATION_VALUE")?.textContent || "",
        source: "manual" as const,
        createdAt: new Date().toISOString(),
        history: [],
      };
      validateAnnotation(annotation, p);
      p.annotations.push(annotation);
    }
  }
  return p;
}
