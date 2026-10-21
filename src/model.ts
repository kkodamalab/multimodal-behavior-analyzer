export type Tier = {
  id: string;
  name: string;
  color: string;
  visible: boolean;
};
export type Revision = {
  at: string;
  before: { start: number; end: number; text: string; tierId: string };
  action: string;
};
export type Annotation = {
  id: string;
  tierId: string;
  start: number;
  end: number;
  text: string;
  source: "manual";
  createdAt: string;
  history: Revision[];
};
export type MediaInfo = {
  id: string;
  name: string;
  type: string;
  size: number;
  duration: number;
  hasAudio: boolean | null;
  hasVideo: boolean | null;
  audioState: "present" | "silent" | "absent" | "unknown";
  waveform: number[];
  offset: number;
  warning: string;
};
export type Project = {
  schema: 1;
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  media: MediaInfo[];
  tiers: Tier[];
  annotations: Annotation[];
  deletedAnnotations: Annotation[];
  raw: unknown[];
  analyses: unknown[];
};
export const uid = () => crypto.randomUUID();
export const colors = [
  "#2d8b78",
  "#4b78b8",
  "#ab6b43",
  "#8c71b8",
  "#aa8150",
  "#4c909e",
  "#b36b83",
];
export function newProject(): Project {
  const now = new Date().toISOString();
  return {
    schema: 1,
    id: uid(),
    name: "Untitled session",
    createdAt: now,
    updatedAt: now,
    media: [],
    tiers: [
      "Speech_A",
      "Speech_B",
      "Overlap",
      "Silence",
      "Backchannel",
      "Head_Nod",
      "Gesture",
    ].map((name, i) => ({ id: uid(), name, color: colors[i], visible: true })),
    annotations: [],
    deletedAnnotations: [],
    raw: [],
    analyses: [],
  };
}
export function durationOf(p: Project) {
  return Math.max(
    0,
    ...p.media.map((m) => m.duration + m.offset),
    ...p.annotations.map((a) => a.end),
  );
}
export function validateAnnotation(
  a: Pick<Annotation, "start" | "end" | "text" | "tierId">,
  p: Project,
  id?: string,
) {
  if (
    !Number.isFinite(a.start) ||
    !Number.isFinite(a.end) ||
    a.start < 0 ||
    a.end <= a.start
  )
    throw new Error(
      "開始・終了は有効な秒数で、0 ≤ 開始 < 終了にしてください。",
    );
  if (!p.tiers.some((t) => t.id === a.tierId))
    throw new Error("Tierが存在しません。");
  if (
    p.annotations.some(
      (b) =>
        b.id !== id &&
        b.tierId === a.tierId &&
        a.start < b.end &&
        a.end > b.start,
    )
  )
    throw new Error(
      "同じTier内では区間を重ねられません。別のTierを使用してください。",
    );
}
export function editAnnotation(
  p: Project,
  id: string,
  next: Pick<Annotation, "start" | "end" | "text" | "tierId">,
): Project {
  validateAnnotation(next, p, id);
  return {
    ...p,
    annotations: p.annotations.map((a) =>
      a.id === id
        ? {
            ...a,
            ...next,
            history: [
              ...a.history,
              {
                at: new Date().toISOString(),
                before: {
                  start: a.start,
                  end: a.end,
                  text: a.text,
                  tierId: a.tierId,
                },
                action: "edit",
              },
            ],
          }
        : a,
    ),
  };
}
export function parseProject(text: string): Project {
  const p = JSON.parse(text) as Project;
  if (
    p.schema !== 1 ||
    typeof p.id !== "string" ||
    typeof p.name !== "string" ||
    !Array.isArray(p.media) ||
    !Array.isArray(p.tiers) ||
    !Array.isArray(p.annotations) ||
    !Array.isArray(p.deletedAnnotations) ||
    !Array.isArray(p.raw) ||
    !Array.isArray(p.analyses)
  )
    throw new Error("MBA project schema 1 のJSONを選んでください。");
  if (
    p.tiers.some(
      (t) =>
        typeof t.id !== "string" ||
        typeof t.name !== "string" ||
        !/^#[0-9a-f]{6}$/i.test(t.color) ||
        typeof t.visible !== "boolean",
    ) ||
    new Set(p.tiers.map((t) => t.id)).size !== p.tiers.length ||
    new Set(p.tiers.map((t) => t.name)).size !== p.tiers.length
  )
    throw new Error("Tierデータが不正です。");
  if (new Set(p.annotations.map((a) => a.id)).size !== p.annotations.length)
    throw new Error("注釈IDが重複しています。");
  for (const a of p.annotations) {
    if (
      typeof a.id !== "string" ||
      typeof a.text !== "string" ||
      !Array.isArray(a.history) ||
      a.source !== "manual"
    )
      throw new Error("注釈データが不正です。");
    validateAnnotation(a, p, a.id);
  }
  for (const m of p.media) {
    if (
      typeof m.id !== "string" ||
      typeof m.name !== "string" ||
      typeof m.type !== "string" ||
      !Number.isFinite(m.size) ||
      m.size < 0 ||
      !Number.isFinite(m.duration) ||
      m.duration <= 0 ||
      !Number.isFinite(m.offset) ||
      m.offset < 0 ||
      !Array.isArray(m.waveform) ||
      m.waveform.some((v) => !Number.isFinite(v) || v < 0 || v > 1)
    )
      throw new Error("メディア情報が不正です。");
  }
  return p;
}
export function clock(t: number) {
  const s = Math.max(0, t);
  return `${Math.floor(s / 60)
    .toString()
    .padStart(2, "0")}:${(s % 60).toFixed(2).padStart(5, "0")}`;
}
export function csv(p: Project) {
  const cell = (v: unknown) =>
    `"${String(v)
      .replace(/^[=+@\-\t\r]/, "'$&")
      .replaceAll('"', '""')}"`;
  return (
    "\uFEFF" +
    [
      ["id", "tier", "start_seconds", "end_seconds", "text", "source"],
      ...p.annotations.map((a) => [
        a.id,
        p.tiers.find((t) => t.id === a.tierId)?.name,
        a.start,
        a.end,
        a.text,
        a.source,
      ]),
    ]
      .map((r) => r.map(cell).join(","))
      .join("\r\n")
  );
}
export function transcript(p: Project, markdown = false) {
  return (
    (markdown ? `# ${p.name}\n\n` : "") +
    p.annotations
      .slice()
      .sort((a, b) => a.start - b.start)
      .map(
        (a) =>
          `[${clock(a.start)}–${clock(a.end)}] ${p.tiers.find((t) => t.id === a.tierId)?.name}: ${a.text}`,
      )
      .join("\n\n")
  );
}
