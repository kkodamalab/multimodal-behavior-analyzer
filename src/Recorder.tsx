import { useEffect, useRef, useState } from "react";
import { Mic, Pause, Play, Square, Download } from "lucide-react";
import { clock } from "./model";
export default function Recorder({
  onFile,
  en,
  onActive,
}: {
  onFile: (f: File) => Promise<void>;
  en: boolean;
  onActive: (active: boolean) => void;
}) {
  const [state, setState] = useState<"idle" | "recording" | "paused">("idle");
  const [seconds, setSeconds] = useState(0);
  const [level, setLevel] = useState(0);
  const [error, setError] = useState("");
  const [result, setResult] = useState<File | null>(null);
  const [url, setUrl] = useState("");
  const [consent, setConsent] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [samples, setSamples] = useState<number[]>([]);
  const recorder = useRef<MediaRecorder | null>(null),
    stream = useRef<MediaStream | null>(null),
    ctx = useRef<AudioContext | null>(null),
    chunks = useRef<Blob[]>([]),
    timer = useRef(0),
    raf = useRef(0),
    active = useRef(false);
  function cleanup() {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    void ctx.current?.close();
    ctx.current = null;
    clearInterval(timer.current);
    cancelAnimationFrame(raf.current);
    setLevel(0);
  }
  useEffect(
    () => () => {
      active.current = false;
      if (recorder.current?.state !== "inactive") {
        if (recorder.current) {
          recorder.current.onstop = null;
          recorder.current.stop();
        }
      }
      stream.current?.getTracks().forEach((t) => t.stop());
      void ctx.current?.close();
      clearInterval(timer.current);
      cancelAnimationFrame(raf.current);
    },
    [],
  );
  useEffect(() => {
    if (!result) return;
    const u = URL.createObjectURL(result);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [result]);
  useEffect(() => {
    const f = () => {
      if (document.hidden && active.current)
        setError(
          en
            ? "Tab is inactive. Verify the recording before use."
            : "タブが非アクティブです。録音に欠落がないか終了後に確認してください。",
        );
    };
    document.addEventListener("visibilitychange", f);
    return () => document.removeEventListener("visibilitychange", f);
  }, [en]);
  async function start() {
    if (active.current) return;
    active.current = true;
    setRequesting(true);
    onActive(true);
    setError("");
    try {
      if (!navigator.mediaDevices || !window.MediaRecorder)
        throw new Error(
          "このブラウザでは録音を利用できません。HTTPSと対応ブラウザが必要です。",
        );
      stream.current = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      const mime = [
        "audio/webm;codecs=opus",
        "audio/mp4",
        "audio/ogg;codecs=opus",
      ].find((m) => MediaRecorder.isTypeSupported(m));
      const r = new MediaRecorder(
        stream.current,
        mime ? { mimeType: mime } : undefined,
      );
      recorder.current = r;
      chunks.current = [];
      let bytes = 0;
      let elapsed = 0;
      let last = performance.now();
      setSeconds(0);
      setResult(null);
      r.ondataavailable = (e) => {
        if (e.data.size) {
          chunks.current.push(e.data);
          bytes += e.data.size;
          if (bytes > 100 * 1024 * 1024 && r.state !== "inactive") {
            setError("100 MBの録音上限に達しました。録音を保存してください。");
            r.stop();
          }
        }
      };
      r.onstop = () => {
        active.current = false;
        onActive(false);
        const ext = r.mimeType.includes("mp4")
          ? "m4a"
          : r.mimeType.includes("ogg")
            ? "ogg"
            : "webm";
        setResult(
          new File(
            chunks.current,
            `recording-${new Date().toISOString().replaceAll(":", "-")}.${ext}`,
            { type: r.mimeType },
          ),
        );
        setState("idle");
        cleanup();
      };
      r.onerror = () => {
        setError("録音が中断しました。保存された音声を確認してください。");
        if (r.state !== "inactive") r.stop();
      };
      stream.current.getTracks().forEach((t) => {
        t.onended = () => {
          setError("マイク接続が失われました。");
          if (r.state !== "inactive") r.stop();
        };
      });
      ctx.current = new AudioContext();
      await ctx.current.resume();
      const analyser = ctx.current.createAnalyser();
      analyser.fftSize = 256;
      ctx.current.createMediaStreamSource(stream.current).connect(analyser);
      const data = new Float32Array(analyser.fftSize);
      const draw = () => {
        analyser.getFloatTimeDomainData(data);
        setLevel(
          r.state === "recording"
            ? Math.sqrt(data.reduce((s, v) => s + v * v, 0) / data.length)
            : 0,
        );
        setSamples(Array.from(data).filter((_, i) => i % 4 === 0));
        raf.current = requestAnimationFrame(draw);
      };
      r.start(1000);
      active.current = true;
      setState("recording");
      draw();
      timer.current = window.setInterval(() => {
        const now = performance.now();
        if (r.state === "recording") elapsed += (now - last) / 1000;
        last = now;
        setSeconds(elapsed);
        if (elapsed >= 3600 && r.state !== "inactive") {
          setError("1時間の上限に達しました。録音を保存してください。");
          r.stop();
        }
      }, 100);
    } catch (e) {
      active.current = false;
      onActive(false);
      cleanup();
      setState("idle");
      setError(
        e instanceof DOMException && e.name === "NotAllowedError"
          ? "マイク権限が拒否されました。ブラウザのサイト設定でマイクを許可してください。"
          : e instanceof Error
            ? e.message
            : String(e),
      );
    } finally {
      setRequesting(false);
    }
  }
  return (
    <section className="recorder">
      <div className="section-heading">
        <Mic size={18} />
        <h2>{en ? "Realtime audio" : "リアルタイム録音"}</h2>
        <span className={"badge " + (state !== "idle" ? "recording" : "")}>
          {state.toUpperCase()}
        </span>
      </div>
      <p className="muted">
        {en
          ? "Audio stays on this device. Obtain participant consent before recording."
          : "録音はこの端末に保持します。開始前に参加者の同意を得てください。"}
      </p>
      <label className="check">
        <input
          type="checkbox"
          checked={consent}
          disabled={state !== "idle" || requesting}
          onChange={(e) => setConsent(e.target.checked)}
        />
        {en ? "Participant consent confirmed" : "参加者の同意を確認しました"}
      </label>
      <div className="record-meter">
        <strong>{clock(seconds)}</strong>
        <meter
          min={0}
          max={1}
          value={Math.min(1, level * 4)}
          aria-label="Input level"
        />
        <span>
          {(20 * Math.log10(Math.max(level, 0.00001))).toFixed(0)} dBFS
        </span>
      </div>
      <svg
        className="live-wave"
        viewBox="0 0 256 40"
        preserveAspectRatio="none"
        aria-label="Microphone waveform"
      >
        <polyline
          fill="none"
          stroke="#438d76"
          strokeWidth="1"
          points={samples.map((v, i) => `${i * 4},${20 - v * 18}`).join(" ")}
        />
      </svg>
      <div className="button-row">
        <button
          className="primary"
          disabled={!consent || state !== "idle" || requesting}
          onClick={() => void start()}
        >
          <Mic size={15} />
          {en ? "Start recording" : "録音開始"}
        </button>
        <button
          disabled={state === "idle"}
          onClick={() => {
            const r = recorder.current!;
            if (r.state === "recording") {
              r.pause();
              setState("paused");
            } else {
              r.resume();
              setState("recording");
            }
          }}
        >
          {state === "paused" ? <Play size={15} /> : <Pause size={15} />}
          {state === "paused"
            ? en
              ? "Resume"
              : "再開"
            : en
              ? "Pause"
              : "一時停止"}
        </button>
        <button
          disabled={state === "idle"}
          onClick={() => recorder.current?.stop()}
        >
          <Square size={15} />
          {en ? "Stop" : "停止"}
        </button>
      </div>
      {error && (
        <p role="alert" className="notice warning">
          {error}
        </p>
      )}
      {result && (
        <div className="record-result">
          <audio controls src={url || undefined} />
          <a className="button" href={url} download={result.name}>
            <Download size={15} />
            {en ? "Save recording" : "録音ファイルを保存"}
          </a>
          <button onClick={() => void onFile(result)}>
            {en ? "Add to project" : "プロジェクトへ追加"}
          </button>
        </div>
      )}
      <p className="notice">
        {en
          ? "Live transcription, diarization and summary: unavailable (no inference engine)."
          : "逐次文字起こし・話者分離・要約：利用不可（解析エンジン未実装）。"}
      </p>
    </section>
  );
}
