import { useEffect, useRef, useState } from "react";
import {
  Activity,
  AudioLines,
  Video,
  Layers,
  SlidersHorizontal,
  Download,
  FolderOpen,
  Plus,
  Save,
  Play,
  Pause,
  SkipBack,
  Search,
  ChevronRight,
  FileAudio,
  FileVideo,
  Mic,
  Camera,
  X,
  Upload,
  ShieldCheck,
  CircleHelp,
  Trash2,
  Check,
  Globe,
} from "lucide-react";
import {
  clock,
  colors,
  csv,
  durationOf,
  editAnnotation,
  newProject,
  parseProject,
  transcript,
  uid,
  validateAnnotation,
  type Project,
  type Annotation,
} from "./model";
import { inspectMedia } from "./media";
import { listProjects, loadProject, saveProject } from "./storage";
import { exportEaf, importEaf } from "./eaf";
import Recorder from "./Recorder";

type Tab =
  "MEDIA" | "TRANSCRIPT" | "ANNOTATION" | "MOTION" | "ANALYSIS" | "EXPORT";
const tabs: Tab[] = [
  "MEDIA",
  "TRANSCRIPT",
  "ANNOTATION",
  "MOTION",
  "ANALYSIS",
  "EXPORT",
];
const tabJa = [
  "メディア",
  "逐語録",
  "アノテーション",
  "身体運動",
  "協調解析",
  "出力",
];
function download(name: string, text: string, type = "text/plain") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export default function App() {
  const [p, setP] = useState<Project>(newProject);
  const [en, setEn] = useState(false);
  const [tab, setTab] = useState<Tab>("MEDIA");
  const [files, setFiles] = useState(new Map<string, Blob>());
  const [urls, setUrls] = useState(new Map<string, string>());
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState<Project[] | null>(null);
  const [showRecorder, setShowRecorder] = useState(false);
  const [recordingActive, setRecordingActive] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [editor, setEditor] = useState({
    tierId: "",
    start: 0,
    end: 1,
    text: "",
  });
  const [mode, setMode] = useState("AUDIO FILE");
  const [ready, setReady] = useState(false);
  const mediaEls = useRef(new Map<string, HTMLMediaElement>());
  const input = useRef<HTMLInputElement>(null),
    projectInput = useRef<HTMLInputElement>(null),
    eafInput = useRef<HTMLInputElement>(null);
  const current = useRef(p);
  current.current = p;
  const filesRef = useRef(files);
  filesRef.current = files;
  const timeRef = useRef(0);
  timeRef.current = time;
  const total = durationOf(p);
  const t = (ja: string, english: string) => (en ? english : ja);
  useEffect(() => {
    document.documentElement.lang = en ? "en" : "ja";
  }, [en]);
  useEffect(() => {
    const next = new Map<string, string>();
    for (const [id, b] of files) next.set(id, URL.createObjectURL(b));
    setUrls(next);
    return () => next.forEach((u) => URL.revokeObjectURL(u));
  }, [files]);
  useEffect(() => {
    let cancelled = false;
    const id = localStorage.getItem("mba-last-project");
    if (id)
      loadProject(id)
        .then((r) => {
          if (!cancelled) {
            setP(r.project);
            setFiles(r.files);
            setNotice("前回保存したプロジェクトを復元しました。");
          }
        })
        .catch((e) => {
          if (!cancelled) setNotice(String(e));
        })
        .finally(() => {
          if (!cancelled) setReady(true);
        });
    else setReady(true);
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => {
    const f = (e: BeforeUnloadEvent) => {
      if (dirty || recordingActive) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", f);
    return () => window.removeEventListener("beforeunload", f);
  }, [dirty, recordingActive]);
  useEffect(() => {
    if (!ready || !dirty) return;
    const timer = setTimeout(() => {
      void saveProject(p, files)
        .then(() => {
          if (current.current === p) setDirty(false);
        })
        .catch(() =>
          setNotice(
            "自動保存に失敗しました（容量制限等）。JSONと元メディアを別途保存してください。",
          ),
        );
    }, 800);
    return () => clearTimeout(timer);
  }, [p, files, dirty, ready]);
  function change(next: Project) {
    setP({ ...next, updatedAt: new Date().toISOString() });
    setDirty(true);
  }
  function stop() {
    setPlaying(false);
    mediaEls.current.forEach((el) => el.pause());
  }
  function seek(value: number) {
    const next = Math.max(0, Math.min(total, value));
    setTime(next);
    timeRef.current = next;
    for (const m of p.media) {
      const el = mediaEls.current.get(m.id);
      if (el)
        el.currentTime = Math.max(0, Math.min(m.duration, next - m.offset));
    }
  }
  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const next = Math.min(
        durationOf(current.current),
        timeRef.current + (now - last) / 1000,
      );
      last = now;
      timeRef.current = next;
      setTime(next);
      for (const m of current.current.media) {
        const el = mediaEls.current.get(m.id);
        if (!el) continue;
        const local = next - m.offset;
        const active = local >= 0 && local < m.duration;
        if (active) {
          if (Math.abs(el.currentTime - local) > 0.15) el.currentTime = local;
          if (el.paused)
            void el.play().catch(() => {
              setNotice(
                "再生できません。メディアのコーデックとブラウザの再生権限を確認してください。",
              );
              setPlaying(false);
            });
        } else el.pause();
      }
      if (next >= durationOf(current.current)) {
        setPlaying(false);
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      mediaEls.current.forEach((el) => el.pause());
    };
  }, [playing]);
  async function addFiles(list: File[]) {
    stop();
    setBusy(true);
    setNotice("");
    const additions = [];
    const nextFiles = new Map(filesRef.current);
    try {
      for (const f of list) {
        const m = await inspectMedia(f);
        const missing = current.current.media.find(
          (x) => !nextFiles.has(x.id) && x.name === m.name && x.size === m.size,
        );
        if (missing) {
          nextFiles.set(missing.id, f);
        } else {
          additions.push(m);
          nextFiles.set(m.id, f);
        }
      }
      change({
        ...current.current,
        media: [...current.current.media, ...additions],
      });
      setFiles(nextFiles);
      setNotice(
        t(
          "読込完了。元メディアは外部送信されません。",
          "Loaded. Original media stays on this device.",
        ),
      );
    } catch (e) {
      setNotice(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    try {
      await saveProject(current.current, filesRef.current);
      setDirty(false);
      setNotice(t("このブラウザに保存しました。", "Saved in this browser."));
    } catch {
      setNotice(
        t(
          "保存できません。容量上限またはプライベートモードの可能性があります。JSONを出力してください。",
          "Storage failed. Export a JSON backup.",
        ),
      );
    }
  }
  function reset() {
    if (recordingActive) {
      setNotice(
        t(
          "先に録音を停止・保存してください。",
          "Stop and save the recording first.",
        ),
      );
      return;
    }
    if (
      dirty &&
      !confirm(t("未保存の変更を破棄しますか？", "Discard unsaved changes?"))
    )
      return;
    stop();
    change(newProject());
    setFiles(new Map());
    setTime(0);
    setSelected(null);
    setShowRecorder(false);
    setTab("MEDIA");
  }
  function selectAnnotation(a: Annotation) {
    setSelected(a.id);
    setEditor({ tierId: a.tierId, start: a.start, end: a.end, text: a.text });
    setTab("ANNOTATION");
    seek(a.start);
  }
  function openEditor() {
    setSelected(null);
    setEditor({
      tierId: p.tiers[0]?.id || "",
      start: Number(time.toFixed(3)),
      end: Number(Math.min(total || time + 1, time + 1).toFixed(3)),
      text: "",
    });
    setTab("ANNOTATION");
  }
  function submit() {
    try {
      if (selected) change(editAnnotation(p, selected, editor));
      else {
        validateAnnotation(editor, p);
        const a: Annotation = {
          ...editor,
          id: uid(),
          source: "manual",
          createdAt: new Date().toISOString(),
          history: [],
        };
        change({ ...p, annotations: [...p.annotations, a] });
        setSelected(a.id);
      }
      setNotice(t("注釈を保存しました。", "Annotation saved."));
    } catch (e) {
      setNotice((e as Error).message);
    }
  }
  function addTier() {
    const name = prompt(t("新しいTier名", "New tier name"));
    if (!name?.trim()) return;
    if (p.tiers.some((t) => t.name === name.trim())) {
      setNotice("同じ名前のTierが存在します。");
      return;
    }
    change({
      ...p,
      tiers: [
        ...p.tiers,
        {
          id: uid(),
          name: name.trim(),
          color: colors[p.tiers.length % colors.length],
          visible: true,
        },
      ],
    });
  }
  async function importFile(f: File, eaf = false) {
    if (recordingActive) {
      setNotice(
        t(
          "先に録音を停止・保存してください。",
          "Stop and save the recording first.",
        ),
      );
      return;
    }
    try {
      if (f.size > 20 * 1024 * 1024)
        throw new Error("インポート上限は20 MBです。");
      const next = eaf
        ? importEaf(await f.text())
        : parseProject(await f.text());
      if (
        !confirm(
          t(
            "現在の表示を置き換えます。続行しますか？",
            "Replace current workspace?",
          ),
        )
      )
        return;
      stop();
      change(next);
      setFiles(new Map());
      setSelected(null);
      setTime(0);
      setNotice(
        t(
          "注釈を読み込みました。元メディアは「ファイル追加」から再指定してください。EAFのメディアパスは自動では開きません。",
          "Imported. Reattach original media using Add files; EAF media paths are not opened automatically.",
        ),
      );
    } catch (e) {
      setNotice((e as Error).message);
    }
  }
  function exportFile(kind: string) {
    try {
      const stem = p.name.replace(/[^\p{L}\p{N}_-]/gu, "_") || "mba-project";
      if (kind === "JSON")
        download(
          `${stem}.json`,
          JSON.stringify(p, null, 2),
          "application/json",
        );
      if (kind === "CSV")
        download(`${stem}.csv`, csv(p), "text/csv;charset=utf-8");
      if (kind === "TXT") download(`${stem}.txt`, transcript(p));
      if (kind === "Markdown") download(`${stem}.md`, transcript(p, true));
      if (kind === "EAF")
        download(`${stem}.eaf`, exportEaf(p), "application/xml");
    } catch (e) {
      setNotice((e as Error).message);
    }
  }
  const selectedA = p.annotations.find((a) => a.id === selected);
  const shown = p.annotations
    .filter((a) => a.text.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => a.start - b.start);
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <Activity size={24} />
          </div>
          <div>
            MBA<span>RESEARCH WORKSPACE</span>
          </div>
        </div>
        <div className="sidebar-label">WORKSPACE</div>
        <button className="nav-item active" onClick={() => setTab("MEDIA")}>
          <Layers size={18} />
          {t("セッション", "Session")}
          <span className="nav-dot" />
        </button>
        <button
          className="nav-item"
          disabled={recordingActive}
          onClick={() =>
            void listProjects()
              .then(setSaved)
              .catch((e) => setNotice(String(e)))
          }
        >
          <FolderOpen size={18} />
          {t("保存したプロジェクト", "Saved projects")}
        </button>
        <div className="sidebar-label">CAPTURE</div>
        <button
          className="nav-item"
          onClick={() => {
            setShowRecorder(true);
            setTab("MEDIA");
          }}
        >
          <Mic size={18} />
          {t("リアルタイム音声", "Realtime audio")}
        </button>
        <button className="nav-item" disabled title="Coming Soon">
          <Camera size={18} />
          {t("リアルタイム映像", "Realtime video")}
          <small>SOON</small>
        </button>
        <div className="sidebar-bottom">
          <div className="privacy">
            <ShieldCheck size={20} />
            <strong>{t("ローカル・ファースト", "Local first")}</strong>
            <p>
              {t(
                "研究データは、あなたの端末に。",
                "Your research stays on your device.",
              )}
            </p>
          </div>
          <span className="version">MBA / v0.1.0 · Phase 1</span>
        </div>
      </aside>
      <div className="main-shell">
        <header>
          <div className="breadcrumb">
            Workspace <ChevronRight size={14} />
            <span>{p.name}</span>
          </div>
          <div className="header-actions">
            <span className="save-state">
              <span className={dirty ? "status-dot pending" : "status-dot"} />
              {dirty ? t("保存待ち", "Unsaved") : t("ローカル", "Local")}
            </span>
            <button
              className="icon-button"
              title={t("Switch to English", "日本語に切替")}
              onClick={() => setEn(!en)}
            >
              <Globe size={16} />
              {en ? "JP" : "EN"}
            </button>
          </div>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <div className="eyebrow">MULTIMODAL BEHAVIOR ANALYZER</div>
              <input
                className="project-title"
                aria-label={t("プロジェクト名", "Project name")}
                value={p.name}
                onChange={(e) => change({ ...p, name: e.target.value })}
              />
              <p>
                {t(
                  "会話と身体のふるまいを、ひとつの時間軸へ。",
                  "Bring conversation and movement onto one timeline.",
                )}
              </p>
            </div>
            <div className="button-row">
              <button onClick={reset}>
                <Plus size={16} />
                {t("新規プロジェクト", "New project")}
              </button>
              <button className="primary" onClick={() => void save()}>
                <Save size={16} />
                {t("保存", "Save")}
              </button>
            </div>
          </div>
          <div className="session-meta">
            <span>
              <i className="live-dot" />
              {t("ローカルセッション", "Local session")}
            </span>
            <span>
              {p.media.length} {t("メディア", "media")}
            </span>
            <span>
              {p.annotations.length} {t("注釈", "annotations")}
            </span>
            <span>{clock(total)}</span>
            <span className="meta-right">
              {t("AIエンジン：利用不可", "AI engine: unavailable")}
            </span>
          </div>
          <nav className="tabs">
            {tabs.map((v, i) => (
              <button
                key={v}
                className={tab === v ? "selected" : ""}
                onClick={() => setTab(v)}
              >
                {
                  [
                    <Video size={16} />,
                    <AudioLines size={16} />,
                    <Layers size={16} />,
                    <Activity size={16} />,
                    <SlidersHorizontal size={16} />,
                    <Download size={16} />,
                  ][i]
                }
                <span>{en ? v : tabJa[i]}</span>
              </button>
            ))}
          </nav>
          {notice && (
            <div role="status" className="notice global-notice">
              <span>{notice}</span>
              <button
                className="icon-button"
                aria-label="Dismiss"
                onClick={() => setNotice("")}
              >
                <X size={16} />
              </button>
            </div>
          )}
          <input
            ref={input}
            type="file"
            multiple
            hidden
            accept={
              mode === "AUDIO FILE"
                ? "audio/*,.m4a,.wav,.mp3"
                : mode === "VIDEO FILE"
                  ? "video/*,.mp4,.webm"
                  : "audio/*,video/*,.m4a,.wav,.mp3,.mp4,.webm"
            }
            onChange={(e) => {
              void addFiles(Array.from(e.target.files || []));
              e.target.value = "";
            }}
          />
          <input
            ref={projectInput}
            type="file"
            hidden
            accept=".json"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void importFile(f);
              e.target.value = "";
            }}
          />
          <input
            ref={eafInput}
            type="file"
            hidden
            accept=".eaf,.xml"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void importFile(f, true);
              e.target.value = "";
            }}
          />
          <div
            className={
              tab === "MEDIA" ? "workspace-grid" : "workspace-grid media-hidden"
            }
          >
            <section className="panel media-panel">
              <div className="panel-title">
                <h2>{t("メディア", "Media monitor")}</h2>
                <span className="badge">
                  {p.media.length ? "LOCAL MEDIA" : "NO MEDIA"}
                </span>
              </div>
              <div
                className={"media-stage " + (p.media.length ? "has-media" : "")}
              >
                {!p.media.length ? (
                  <div className="empty-media">
                    <div className="empty-icon">
                      <AudioLines size={36} />
                      <Video size={24} />
                    </div>
                    <h3>
                      {t(
                        "ここから、観察をはじめる。",
                        "Start with an observation.",
                      )}
                    </h3>
                    <p>
                      {t(
                        "音声・映像を読み込んで、セッションを作成",
                        "Load audio or video to begin your session",
                      )}
                    </p>
                    <button
                      className="primary"
                      disabled={busy}
                      onClick={() => input.current?.click()}
                    >
                      <Plus size={16} />
                      {busy
                        ? t("読み込み中…", "Loading…")
                        : t("ファイルを選択", "Choose files")}
                    </button>
                    <small>WAV · MP3 · M4A · MP4 · WebM</small>
                  </div>
                ) : (
                  <div className="media-grid">
                    {p.media.map((m) => (
                      <div className="media-item" key={m.id}>
                        {urls.has(m.id) ? (
                          m.hasVideo ? (
                            <video
                              aria-label={m.name}
                              ref={(el) => {
                                if (el) mediaEls.current.set(m.id, el);
                                else mediaEls.current.delete(m.id);
                              }}
                              src={urls.get(m.id)}
                              playsInline
                              preload="metadata"
                              onError={() =>
                                setNotice(
                                  `${m.name}: 再生エラー。コーデックまたはファイルを確認してください。`,
                                )
                              }
                            />
                          ) : (
                            <div className="audio-display">
                              <AudioLines size={38} />
                              <span>{m.name}</span>
                              <audio
                                aria-label={m.name}
                                ref={(el) => {
                                  if (el) mediaEls.current.set(m.id, el);
                                  else mediaEls.current.delete(m.id);
                                }}
                                src={urls.get(m.id)}
                                preload="auto"
                                onError={() =>
                                  setNotice(`${m.name}: 音声を再生できません。`)
                                }
                              />
                            </div>
                          )
                        ) : (
                          <div className="missing">
                            {t(
                              "元メディアを再指定してください",
                              "Reattach original media",
                            )}
                            <br />
                            {m.name}
                          </div>
                        )}
                        <span className="media-caption">
                          {m.hasVideo ? "VIDEO" : "AUDIO"} · {m.name}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="transport">
                <button
                  className="icon-button"
                  aria-label={t("先頭へ", "Rewind")}
                  disabled={!total}
                  onClick={() => seek(0)}
                >
                  <SkipBack size={18} />
                </button>
                <button
                  className="play-button"
                  aria-label={
                    playing ? t("一時停止", "Pause") : t("再生", "Play")
                  }
                  disabled={!p.media.length || !files.size}
                  onClick={() => {
                    if (playing) stop();
                    else {
                      if (time >= total) seek(0);
                      setPlaying(true);
                    }
                  }}
                >
                  {playing ? <Pause size={18} /> : <Play size={18} />}
                </button>
                <span className="timecode">
                  {clock(time)} <i>/ {clock(total)}</i>
                </span>
                <input
                  aria-label={t("再生位置", "Playhead")}
                  type="range"
                  min={0}
                  max={total || 1}
                  step={0.01}
                  value={Math.min(time, total)}
                  onChange={(e) => seek(Number(e.target.value))}
                />
                <span className="speed">1.0×</span>
              </div>
            </section>
            <section className="panel source-panel">
              <div className="panel-title">
                <h2>{t("セッション設定", "Session setup")}</h2>
                <SlidersHorizontal size={16} />
              </div>
              <div className="source-content">
                <div className="field-label">INPUT SOURCE</div>
                <div className="input-modes">
                  {["AUDIO FILE", "VIDEO FILE", "MULTI-FILE"].map((v, i) => (
                    <button
                      key={v}
                      className={mode === v ? "active" : ""}
                      onClick={() => setMode(v)}
                    >
                      {
                        [
                          <FileAudio size={19} />,
                          <FileVideo size={19} />,
                          <Layers size={19} />,
                        ][i]
                      }
                      <span>{v}</span>
                    </button>
                  ))}
                </div>
                <button
                  className="upload-zone"
                  disabled={busy}
                  onClick={() => input.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (!busy) void addFiles(Array.from(e.dataTransfer.files));
                  }}
                >
                  <Upload size={24} />
                  <strong>
                    {busy
                      ? t("メディアを検査中…", "Inspecting media…")
                      : t("ファイル追加 / ドロップ", "Add files / drop here")}
                  </strong>
                  <span>
                    {t(
                      "対応コーデックはブラウザに依存します",
                      "Codec support depends on your browser",
                    )}
                  </span>
                </button>
                <div className="file-list">
                  {p.media.map((m) => (
                    <div className="file-info" key={m.id}>
                      <strong>{m.name}</strong>
                      <span>
                        {(m.size / 1024 / 1024).toFixed(2)} MB ·{" "}
                        {clock(m.duration)}
                      </span>
                      <div className="track-badges">
                        <span>
                          {m.hasVideo
                            ? t("映像あり", "Video")
                            : t("映像なし", "No video")}
                        </span>
                        <span>
                          {m.audioState === "absent"
                            ? t("音声トラックなし", "No audio track")
                            : m.audioState === "silent"
                              ? t("無音", "Silent")
                              : m.audioState === "present"
                                ? t("音声トラックあり", "Audio track")
                                : t("音声判定不能", "Audio unknown")}
                        </span>
                      </div>
                      <label>
                        {t("開始オフセット（秒）", "Start offset (sec)")}
                        <input
                          aria-label={`Offset ${m.name}`}
                          type="number"
                          min={0}
                          step={0.01}
                          value={m.offset}
                          onChange={(e) => {
                            const value = Number(e.target.value);
                            if (Number.isFinite(value) && value >= 0) {
                              stop();
                              change({
                                ...p,
                                media: p.media.map((x) =>
                                  x.id === m.id ? { ...x, offset: value } : x,
                                ),
                              });
                            }
                          }}
                        />
                      </label>
                      {m.warning && <small>{m.warning}</small>}
                      <button
                        className="text-button"
                        onClick={() => {
                          stop();
                          change({
                            ...p,
                            media: p.media.filter((x) => x.id !== m.id),
                          });
                          setFiles((prev) => {
                            const next = new Map(prev);
                            next.delete(m.id);
                            return next;
                          });
                        }}
                      >
                        {t("セッションから外す", "Remove from session")}
                      </button>
                    </div>
                  ))}
                </div>
                <div className="hint">
                  <CircleHelp size={16} />
                  <span>
                    {t(
                      "音声のみ・映像のみでも利用できます。別ファイルは開始オフセットで同期します。",
                      "Use audio or video independently. Align separate files with start offsets.",
                    )}
                  </span>
                </div>
              </div>
            </section>
          </div>
          {recordingActive && tab !== "MEDIA" && (
            <div className="notice warning">
              {t(
                "マイク使用中・録音セッション継続中",
                "Microphone active · recording session in progress",
              )}{" "}
              <button onClick={() => setTab("MEDIA")}>
                {t("録音操作へ戻る", "Return to recording controls")}
              </button>
            </div>
          )}
          {showRecorder && (
            <div hidden={tab !== "MEDIA"}>
              <Recorder
                en={en}
                onActive={setRecordingActive}
                onFile={async (f) => {
                  await addFiles([f]);
                }}
              />
            </div>
          )}
          {tab === "TRANSCRIPT" && (
            <section className="panel padded">
              <div className="section-heading">
                <h2>{t("手動逐語録", "Manual transcript")}</h2>
                <span className="badge">VERBATIM / MANUAL</span>
              </div>
              <p className="notice">
                {t(
                  "AI文字起こしは利用不可です。RAW・CLEAN・SUMMARYは生成しません。手動注釈を時刻順に表示します。",
                  "AI transcription is unavailable. RAW, CLEAN and SUMMARY are not generated. Manual annotations are shown chronologically.",
                )}
              </p>
              <div className="search-box">
                <Search size={16} />
                <input
                  aria-label={t("逐語録検索", "Search transcript")}
                  placeholder={t(
                    "注釈テキストを検索…",
                    "Search annotation text…",
                  )}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              {shown.length ? (
                shown.map((a) => (
                  <button
                    className="transcript-row"
                    key={a.id}
                    onClick={() => selectAnnotation(a)}
                  >
                    <span>{clock(a.start)}</span>
                    <strong>
                      {p.tiers.find((t) => t.id === a.tierId)?.name}
                    </strong>
                    <p>{a.text || "—"}</p>
                    <ChevronRight size={16} />
                  </button>
                ))
              ) : (
                <div className="empty-small">
                  {t(
                    "注釈がありません。タイムラインから追加してください。",
                    "No annotations. Add an interval from the timeline.",
                  )}
                </div>
              )}
            </section>
          )}
          {tab === "ANNOTATION" && (
            <section className="panel padded">
              <div className="section-heading">
                <h2>
                  {selected
                    ? t("注釈を編集", "Edit annotation")
                    : t("注釈を追加", "Add annotation")}
                </h2>
                <span className="badge">MANUAL</span>
              </div>
              <div className="editor-grid">
                <label>
                  Tier
                  <select
                    aria-label="Tier"
                    value={editor.tierId}
                    onChange={(e) =>
                      setEditor({ ...editor, tierId: e.target.value })
                    }
                  >
                    <option value="">
                      {t("選択してください", "Select a tier")}
                    </option>
                    {p.tiers.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {t("開始（秒）", "Start (sec)")}
                  <input
                    aria-label="Start seconds"
                    type="number"
                    min={0}
                    step={0.001}
                    value={editor.start}
                    onChange={(e) =>
                      setEditor({ ...editor, start: Number(e.target.value) })
                    }
                  />
                </label>
                <label>
                  {t("終了（秒）", "End (sec)")}
                  <input
                    aria-label="End seconds"
                    type="number"
                    min={0}
                    step={0.001}
                    value={editor.end}
                    onChange={(e) =>
                      setEditor({ ...editor, end: Number(e.target.value) })
                    }
                  />
                </label>
              </div>
              <label>
                {t("注釈テキスト", "Annotation text")}
                <textarea
                  aria-label="Annotation text"
                  value={editor.text}
                  onChange={(e) =>
                    setEditor({ ...editor, text: e.target.value })
                  }
                  placeholder={t(
                    "発話・観察した行動を記録…",
                    "Record speech or observed behavior…",
                  )}
                />
              </label>
              <div className="button-row">
                <button className="primary" onClick={submit}>
                  <Check size={16} />
                  {t("注釈を保存", "Save annotation")}
                </button>
                <button onClick={openEditor}>
                  <Plus size={16} />
                  {t("新しい区間", "New interval")}
                </button>
                {selectedA && (
                  <button
                    onClick={() => {
                      change({
                        ...p,
                        annotations: p.annotations.filter(
                          (a) => a.id !== selectedA.id,
                        ),
                        deletedAnnotations: [
                          ...p.deletedAnnotations,
                          selectedA,
                        ],
                      });
                      setSelected(null);
                    }}
                  >
                    <Trash2 size={16} />
                    {t("削除", "Delete")}
                  </button>
                )}
              </div>
              {selectedA && (
                <details>
                  <summary>
                    {t("修正履歴", "Revision history")} (
                    {selectedA.history.length})
                  </summary>
                  <pre>{JSON.stringify(selectedA.history, null, 2)}</pre>
                </details>
              )}
            </section>
          )}
          {(tab === "MOTION" || tab === "ANALYSIS") && (
            <section className="panel unavailable">
              <div className="empty-icon">
                <Activity size={38} />
              </div>
              <span className="badge">COMING SOON</span>
              <h2>
                {tab === "MOTION"
                  ? t(
                      "身体行動解析は未実装です",
                      "Motion analysis is not implemented",
                    )
                  : t(
                      "対人協調解析は未実装です",
                      "Coordination analysis is not implemented",
                    )}
              </h2>
              <p>
                {tab === "MOTION"
                  ? t(
                      "MediaPipe・複数人物追跡・カメラ解析は利用できません。",
                      "MediaPipe, multi-person tracking and camera analysis are unavailable.",
                    )
                  : t(
                      "相互相関・RQA・CRQAは利用できません。解析値は生成しません。",
                      "Cross-correlation, RQA and CRQA are unavailable. No estimates are generated.",
                    )}
              </p>
            </section>
          )}
          {tab === "EXPORT" && (
            <section className="panel padded">
              <div className="section-heading">
                <h2>{t("研究データを書き出す", "Export your research")}</h2>
                <span className="badge">LOCAL DOWNLOAD</span>
              </div>
              <p className="muted">
                {t(
                  "JSONには注釈・修正履歴・設定が含まれます。元メディアは含まれないため、別途保管してください。",
                  "JSON includes annotations, revisions and settings. Keep original media separately.",
                )}
              </p>
              <div className="export-grid">
                {["JSON", "CSV", "TXT", "Markdown", "EAF"].map((k) => (
                  <button key={k} onClick={() => exportFile(k)}>
                    <Download size={22} />
                    <strong>{k}</strong>
                    <span>
                      {k === "JSON"
                        ? t("プロジェクト全体", "Full project")
                        : k === "EAF"
                          ? t("時間整列Tier", "Time-aligned tiers")
                          : t("注釈一覧", "Annotations")}
                    </span>
                  </button>
                ))}
              </div>
              <p className="notice">
                {t(
                  "EAF：独立した時間整列Tierのみ対応。階層・参照注釈は未対応。ELAN実機での互換性確認は未実施です。",
                  "EAF supports independent time-aligned tiers only. Hierarchical/reference annotations are unsupported; ELAN application compatibility has not been verified.",
                )}
              </p>
              <div className="button-row">
                <button onClick={() => projectInput.current?.click()}>
                  <FolderOpen size={16} />
                  {t("JSONを開く", "Open JSON")}
                </button>
                <button onClick={() => eafInput.current?.click()}>
                  <Upload size={16} />
                  {t("EAFを読み込む", "Import EAF")}
                </button>
              </div>
            </section>
          )}
          <section className="panel timeline-panel">
            <div className="panel-title">
              <div className="section-heading">
                <Layers size={17} />
                <h2>{t("タイムライン", "Timeline")}</h2>
                <span className="badge">{p.tiers.length} TIERS</span>
              </div>
              <div className="timeline-actions">
                <label>
                  {t("ズーム", "Zoom")}
                  <input
                    aria-label="Timeline zoom"
                    type="range"
                    min={1}
                    max={10}
                    value={zoom}
                    onChange={(e) => setZoom(Number(e.target.value))}
                  />
                </label>
                <button className="text-button" onClick={addTier}>
                  <Plus size={14} />
                  {t("Tier追加", "Add tier")}
                </button>
                <button onClick={openEditor}>
                  <Plus size={14} />
                  {t("注釈追加", "Add annotation")}
                </button>
              </div>
            </div>
            <div className="timeline-scroll">
              <div
                className="timeline-content"
                style={{ minWidth: `${Math.max(680, 680 * zoom)}px` }}
              >
                <div className="ruler-row">
                  <div className="tier-label">TIME / SEC</div>
                  <div
                    className="ruler"
                    onClick={(e) => {
                      const r = e.currentTarget.getBoundingClientRect();
                      seek(((e.clientX - r.left) / r.width) * (total || 10));
                    }}
                  >
                    {Array.from({ length: 11 }, (_, i) => (
                      <span key={i} style={{ left: `${i * 10}%` }}>
                        {(((total || 10) * i) / 10).toFixed(1)}
                      </span>
                    ))}
                  </div>
                </div>
                {p.media
                  .filter((m) => m.waveform.length)
                  .map((m) => (
                    <div className="wave-row" key={m.id}>
                      <div className="tier-label">
                        <AudioLines size={14} />
                        <span title={m.name}>{m.name}</span>
                      </div>
                      <div
                        className="wave-track"
                        onClick={(e) => {
                          const r = e.currentTarget.getBoundingClientRect();
                          seek(
                            ((e.clientX - r.left) / r.width) * (total || 10),
                          );
                        }}
                      >
                        <svg
                          viewBox="0 0 600 40"
                          preserveAspectRatio="none"
                          style={{
                            left: `${(m.offset / (total || 10)) * 100}%`,
                            width: `${(m.duration / (total || 10)) * 100}%`,
                          }}
                        >
                          {m.waveform.map((v, i) => (
                            <line
                              key={i}
                              x1={i}
                              x2={i}
                              y1={20 - Math.max(0.4, v * 18)}
                              y2={20 + Math.max(0.4, v * 18)}
                              stroke="#629d8d"
                            />
                          ))}
                        </svg>
                        <div
                          className="playhead"
                          style={{ left: `${(time / (total || 10)) * 100}%` }}
                        />
                      </div>
                    </div>
                  ))}
                {p.tiers.map((tier) => (
                  <div className="tier-row" key={tier.id}>
                    <div className="tier-label">
                      <input
                        aria-label={`Visible ${tier.name}`}
                        type="checkbox"
                        checked={tier.visible}
                        onChange={(e) =>
                          change({
                            ...p,
                            tiers: p.tiers.map((x) =>
                              x.id === tier.id
                                ? { ...x, visible: e.target.checked }
                                : x,
                            ),
                          })
                        }
                      />
                      <button
                        className="tier-name"
                        style={{ color: tier.color }}
                        onClick={() => {
                          const name = prompt(
                            t("Tier名", "Tier name"),
                            tier.name,
                          );
                          if (
                            name?.trim() &&
                            !p.tiers.some(
                              (x) => x.id !== tier.id && x.name === name.trim(),
                            )
                          )
                            change({
                              ...p,
                              tiers: p.tiers.map((x) =>
                                x.id === tier.id
                                  ? { ...x, name: name.trim() }
                                  : x,
                              ),
                            });
                        }}
                        title={t("クリックして名称変更", "Click to rename")}
                      >
                        {tier.name}
                      </button>
                      <button
                        className="tier-delete"
                        title={t("Tier削除", "Delete tier")}
                        onClick={() => {
                          if (
                            !confirm(
                              t(
                                "Tierと所属注釈を削除しますか？",
                                "Delete tier and its annotations?",
                              ),
                            )
                          )
                            return;
                          change({
                            ...p,
                            tiers: p.tiers.filter((x) => x.id !== tier.id),
                            annotations: p.annotations.filter(
                              (a) => a.tierId !== tier.id,
                            ),
                            deletedAnnotations: [
                              ...p.deletedAnnotations,
                              ...p.annotations.filter(
                                (a) => a.tierId === tier.id,
                              ),
                            ],
                          });
                          setSelected(null);
                        }}
                      >
                        <X size={12} />
                      </button>
                    </div>
                    <div
                      className="tier-track"
                      onDoubleClick={(e) => {
                        const r = e.currentTarget.getBoundingClientRect();
                        const start = Math.max(
                          0,
                          ((e.clientX - r.left) / r.width) * (total || 10),
                        );
                        setSelected(null);
                        setEditor({
                          tierId: tier.id,
                          start: Number(start.toFixed(3)),
                          end: Number((start + 1).toFixed(3)),
                          text: "",
                        });
                        setTab("ANNOTATION");
                      }}
                    >
                      {tier.visible &&
                        p.annotations
                          .filter((a) => a.tierId === tier.id)
                          .map((a) => (
                            <button
                              key={a.id}
                              className={
                                "annotation-block " +
                                (selected === a.id ? "chosen" : "")
                              }
                              style={{
                                left: `${(a.start / (total || 10)) * 100}%`,
                                width: `${((a.end - a.start) / (total || 10)) * 100}%`,
                                background: tier.color,
                              }}
                              onClick={() => selectAnnotation(a)}
                              title={`${clock(a.start)}–${clock(a.end)} ${a.text}`}
                            >
                              {a.text || tier.name}
                            </button>
                          ))}
                      <div
                        className="playhead"
                        style={{ left: `${(time / (total || 10)) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="timeline-footer">
              <span>
                <i className="legend-square" />
                {t("手動注釈", "Manual annotation")}
              </span>
              <span>
                {t(
                  "区間をクリックして編集 · 空の行をダブルクリックして追加",
                  "Click an interval to edit · Double-click an empty track to add",
                )}
              </span>
            </div>
          </section>
          <footer>
            <span>
              <ShieldCheck size={14} />
              {t("元メディアの外部送信なし", "No original media uploads")}
            </span>
            <span>
              MBA ·{" "}
              {t(
                "研究のための観察ワークスペース",
                "An observation workspace for research",
              )}
            </span>
          </footer>
        </main>
      </div>
      {saved && (
        <div className="modal-backdrop">
          <section className="modal">
            <div className="panel-title">
              <h2>{t("プロジェクトを開く", "Open project")}</h2>
              <button
                className="icon-button"
                onClick={() => setSaved(null)}
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>
            <div className="padded">
              <button onClick={() => projectInput.current?.click()}>
                <Upload size={16} />
                {t("JSONから読み込む", "Import JSON")}
              </button>
              {saved.length ? (
                saved.map((item) => (
                  <button
                    className="saved-project"
                    key={item.id}
                    onClick={() =>
                      void loadProject(item.id)
                        .then((r) => {
                          stop();
                          setP(r.project);
                          setFiles(r.files);
                          setDirty(false);
                          setTime(0);
                          setSelected(null);
                          setSaved(null);
                          localStorage.setItem("mba-last-project", item.id);
                        })
                        .catch((e) => setNotice(String(e)))
                    }
                  >
                    <FolderOpen size={20} />
                    <strong>{item.name}</strong>
                    <small>
                      {new Date(item.updatedAt).toLocaleString()} ·{" "}
                      {item.annotations.length} annotations
                    </small>
                  </button>
                ))
              ) : (
                <p className="muted">
                  {t(
                    "保存済みプロジェクトはありません。",
                    "No saved projects yet.",
                  )}
                </p>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
