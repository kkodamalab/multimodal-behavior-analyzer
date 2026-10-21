import { mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
mkdirSync("fixtures", { recursive: true });
const run = (args) => {
  const r = spawnSync(
    "ffmpeg",
    ["-y", "-hide_banner", "-loglevel", "error", ...args],
    { stdio: "inherit" },
  );
  if (r.status !== 0)
    throw new Error(
      "FFmpeg fixture creation failed. Install FFmpeg and put it on PATH.",
    );
};
run([
  "-f",
  "lavfi",
  "-i",
  "sine=frequency=440:duration=4",
  "-c:a",
  "pcm_s16le",
  "fixtures/tone.wav",
]);
run([
  "-f",
  "lavfi",
  "-i",
  "anullsrc=r=44100:cl=mono",
  "-t",
  "4",
  "fixtures/silent.wav",
]);
run([
  "-f",
  "lavfi",
  "-i",
  "color=c=0x355a4a:s=320x240:r=25:d=4",
  "-an",
  "-c:v",
  "libx264",
  "-pix_fmt",
  "yuv420p",
  "fixtures/video-no-audio.mp4",
]);
run([
  "-f",
  "lavfi",
  "-i",
  "testsrc2=s=320x240:r=25:d=4",
  "-f",
  "lavfi",
  "-i",
  "sine=frequency=440:duration=4",
  "-c:v",
  "libx264",
  "-pix_fmt",
  "yuv420p",
  "-c:a",
  "aac",
  "-shortest",
  "fixtures/video-audio.mp4",
]);
run([
  "-f",
  "lavfi",
  "-i",
  "color=c=0x355a4a:s=320x240:r=25:d=4",
  "-f",
  "lavfi",
  "-i",
  "anullsrc=r=44100:cl=mono",
  "-t",
  "4",
  "-c:v",
  "libx264",
  "-pix_fmt",
  "yuv420p",
  "-c:a",
  "aac",
  "fixtures/video-silent-audio.mp4",
]);
