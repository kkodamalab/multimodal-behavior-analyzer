import { Input, ALL_FORMATS, BlobSource } from "mediabunny";
import { uid, type MediaInfo } from "./model";
export async function inspectMedia(file: File): Promise<MediaInfo> {
  if (!file.size) throw new Error("空のファイルです。");
  const info: MediaInfo = {
    id: uid(),
    name: file.name,
    type: file.type,
    size: file.size,
    duration: 0,
    hasAudio: null,
    hasVideo: null,
    audioState: "unknown",
    waveform: [],
    offset: 0,
    warning: "",
  };
  const input = new Input({
    formats: ALL_FORMATS,
    source: new BlobSource(file),
  });
  try {
    const [a, v] = await Promise.all([
      input.getAudioTracks(),
      input.getVideoTracks(),
    ]);
    info.hasAudio = a.length > 0;
    info.hasVideo = v.length > 0;
    info.duration = await input.computeDuration();
    info.audioState = a.length ? "present" : "absent";
    if (!a.length && !v.length) throw new Error("No tracks");
  } catch {
    info.warning =
      "トラック構造を判定できません。ブラウザ再生で確認してください。";
  } finally {
    input.dispose();
  }
  const url = URL.createObjectURL(file);
  try {
    const el = document.createElement("video");
    el.preload = "metadata";
    el.src = url;
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        reject(
          new Error(
            "読込がタイムアウトしました。MP4 (H.264/AAC) または WAV に変換してください。",
          ),
        );
      }, 15000);
      const cleanup = () => {
        clearTimeout(timer);
        el.onloadedmetadata = null;
        el.onerror = null;
      };
      el.onloadedmetadata = () => {
        if (Number.isFinite(el.duration)) info.duration = el.duration;
        if (info.hasVideo === null) info.hasVideo = el.videoWidth > 0;
        cleanup();
        resolve();
      };
      el.onerror = () => {
        cleanup();
        reject(
          new Error(
            "未対応コーデックまたは破損ファイルです。FFmpeg等で MP4 (H.264/AAC) または WAV に変換してください。",
          ),
        );
      };
    });
    el.removeAttribute("src");
    el.load();
  } finally {
    URL.revokeObjectURL(url);
  }
  if (!Number.isFinite(info.duration) || info.duration <= 0)
    throw new Error(
      "メディアの長さを取得できません。ファイルへ書き出し直してください。",
    );
  // Bounded decoding prevents large uncompressed allocations. Unknown is never treated as silence.
  if (
    info.hasAudio !== false &&
    file.size <= 100 * 1024 * 1024 &&
    info.duration <= 600
  ) {
    const ctx = new AudioContext();
    try {
      const audio = await ctx.decodeAudioData(await file.arrayBuffer());
      info.hasAudio = true;
      const bins = 600;
      let peak = 0;
      const channels = Array.from({ length: audio.numberOfChannels }, (_, i) =>
        audio.getChannelData(i),
      );
      info.waveform = Array.from({ length: bins }, (_, b) => {
        let max = 0;
        const start = Math.floor((b * audio.length) / bins),
          end = Math.floor(((b + 1) * audio.length) / bins);
        for (let i = start; i < end; i++)
          for (const data of channels) max = Math.max(max, Math.abs(data[i]));
        peak = Math.max(peak, max);
        return Math.min(1, max);
      });
      info.audioState = peak < 0.00001 ? "silent" : "present";
    } catch {
      info.warning +=
        " 音声波形をデコードできません。音声の有無・無音判定は確定できません。";
      if (info.hasAudio === null) info.audioState = "unknown";
    } finally {
      await ctx.close();
    }
  } else if (info.hasAudio !== false) {
    info.warning += " 波形・無音検査は100 MBかつ10分以内が対象です。";
  }
  return info;
}
