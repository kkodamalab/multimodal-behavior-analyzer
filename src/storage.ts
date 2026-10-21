import { openDB } from "idb";
import type { Project } from "./model";
const db = () =>
  openDB("mba-local-v1", 1, {
    upgrade(d) {
      d.createObjectStore("projects", { keyPath: "id" });
      d.createObjectStore("media");
    },
  });
export async function saveProject(p: Project, files: Map<string, Blob>) {
  const d = await db();
  const tx = d.transaction(["projects", "media"], "readwrite");
  await tx.objectStore("projects").put(p);
  for (const m of p.media) {
    const blob = files.get(m.id);
    if (blob) await tx.objectStore("media").put(blob, m.id);
  }
  await tx.done;
  localStorage.setItem("mba-last-project", p.id);
}
export async function listProjects(): Promise<Project[]> {
  return (await (await db()).getAll("projects")).sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt),
  );
}
export async function loadProject(
  id: string,
): Promise<{ project: Project; files: Map<string, Blob> }> {
  const d = await db();
  const project = (await d.get("projects", id)) as Project;
  if (!project) throw new Error("保存済みプロジェクトがありません。");
  const files = new Map<string, Blob>();
  for (const m of project.media) {
    const b = await d.get("media", m.id);
    if (b) files.set(m.id, b);
  }
  return { project, files };
}
