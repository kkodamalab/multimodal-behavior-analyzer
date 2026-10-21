import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
const upload = async (page: Page, path: string | string[]) => {
  await page.locator("input[type=file]").first().setInputFiles(path);
  await expect(page.getByRole("status")).toContainText("読込完了");
};
const annotation = async (page: Page) => {
  await page.getByRole("button", { name: "注釈追加", exact: true }).click();
  await page.getByLabel("Start seconds").fill("0.5");
  await page.getByLabel("End seconds").fill("1.5");
  await page.getByLabel("Annotation text").fill("えー、確認します。");
  await page.getByRole("button", { name: "注釈を保存", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("注釈を保存しました");
};
test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  (page as Page & { mbaErrors?: string[] }).mbaErrors = errors;
  await page.goto("./");
});
test.afterEach(async ({ page }) => {
  expect((page as Page & { mbaErrors?: string[] }).mbaErrors).toEqual([]);
});

test("desktop layout and script/style requests succeed", async ({ page }) => {
  const failures: string[] = [];
  page.on("response", (r) => {
    if (
      ["script", "stylesheet"].includes(r.request().resourceType()) &&
      r.status() >= 400
    )
      failures.push(r.url());
  });
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.reload();
  await expect(page.locator(".source-panel")).toBeVisible();
  await page.screenshot({ path: "test-results/desktop.png", fullPage: true });
  expect(failures).toEqual([]);
});

test("storage failure leaves editing usable and gives a backup instruction", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(indexedDB, "open", {
      value: () => {
        throw new DOMException("Quota exceeded", "QuotaExceededError");
      },
    });
  });
  await page.reload();
  await upload(page, "fixtures/tone.wav");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.getByRole("status")).toContainText(/JSON/);
  await expect(
    page.getByRole("button", { name: "再生", exact: true }),
  ).toBeEnabled();
});

test("tier add, rename and delete preserve a valid annotation workspace", async ({
  page,
}) => {
  page.once("dialog", (d) => d.accept("Custom_Tier"));
  await page.getByRole("button", { name: "Tier追加", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Custom_Tier", exact: true }),
  ).toBeVisible();
  page.once("dialog", (d) => d.accept("Renamed_Tier"));
  await page.getByRole("button", { name: "Custom_Tier", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Renamed_Tier", exact: true }),
  ).toBeVisible();
  page.once("dialog", (d) => d.accept());
  await page
    .locator(".tier-row")
    .filter({ hasText: "Renamed_Tier" })
    .getByTitle("Tier削除")
    .click();
  await expect(
    page.getByRole("button", { name: "Renamed_Tier", exact: true }),
  ).toHaveCount(0);
});
test("empty workspace is honest, accessible and loads all scripts/styles", async ({
  page,
}) => {
  await expect(page).toHaveTitle("Multimodal Behavior Analyzer");
  await expect(page.getByText("AIエンジン：利用不可")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "リアルタイム映像" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "身体運動", exact: true }).click();
  await expect(page.getByText("身体行動解析は未実装です")).toBeVisible();
  await page.getByRole("button", { name: "EN", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "EXPORT", exact: true }),
  ).toBeVisible();
});
test("audio file waveform, playback, seeking, annotation revision and reload", async ({
  page,
}) => {
  await upload(page, "fixtures/tone.wav");
  await expect(
    page.getByText("音声トラックあり", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".wave-track svg")).toHaveCount(1);
  await page.getByRole("button", { name: "再生", exact: true }).click();
  await expect
    .poll(() =>
      page
        .locator("audio")
        .first()
        .evaluate((el: HTMLAudioElement) => el.currentTime),
    )
    .toBeGreaterThan(0.15);
  await page.getByRole("button", { name: "一時停止", exact: true }).click();
  await page.getByLabel("再生位置").fill("2");
  await expect
    .poll(() =>
      page
        .locator("audio")
        .first()
        .evaluate((el: HTMLAudioElement) => el.currentTime),
    )
    .toBeCloseTo(2, 1);
  await annotation(page);
  await page.getByLabel("Annotation text").fill("修正版");
  await page.getByRole("button", { name: "注釈を保存", exact: true }).click();
  await expect(page.getByText("修正履歴 (1)")).toBeVisible();
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("このブラウザに保存");
  await page.reload();
  await expect(page.locator(".annotation-block")).toHaveText("修正版");
  await expect(page.locator("audio")).toHaveAttribute("src", /^blob:/);
});
test("video without audio is distinct from a silent audio track", async ({
  page,
}) => {
  await upload(page, "fixtures/video-no-audio.mp4");
  await expect(
    page.getByText("音声トラックなし", { exact: true }),
  ).toBeVisible();
  await expect(page.locator("video")).toHaveCount(1);
  await expect(page.locator(".wave-track svg")).toHaveCount(0);
  await upload(page, "fixtures/video-silent-audio.mp4");
  await expect(page.getByText("無音", { exact: true })).toBeVisible();
});
test("video with audio and separate audio/video offsets", async ({ page }) => {
  await upload(page, ["fixtures/video-audio.mp4", "fixtures/tone.wav"]);
  await expect(page.getByText("音声トラックあり", { exact: true })).toHaveCount(
    2,
  );
  await page.getByLabel("Offset tone.wav").fill("1");
  await page.getByLabel("再生位置").fill("2");
  await expect
    .poll(() =>
      page
        .locator("audio")
        .first()
        .evaluate((el: HTMLAudioElement) => el.currentTime),
    )
    .toBeCloseTo(1, 1);
  await expect
    .poll(() =>
      page
        .locator("video")
        .first()
        .evaluate((el: HTMLVideoElement) => el.currentTime),
    )
    .toBeCloseTo(2, 1);
});
test("silent WAV reports silence, corrupt media reports an actionable error", async ({
  page,
}) => {
  await upload(page, "fixtures/silent.wav");
  await expect(page.getByText("無音", { exact: true })).toBeVisible();
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles({
      name: "broken.mp4",
      mimeType: "video/mp4",
      buffer: Buffer.from("invalid media"),
    });
  await expect(page.getByRole("status")).toContainText(
    "未対応コーデックまたは破損ファイル",
  );
});
test("annotation validation, tier visibility and deletion", async ({
  page,
}) => {
  await upload(page, "fixtures/tone.wav");
  await annotation(page);
  await page.getByLabel("Visible Speech_A").uncheck();
  await expect(page.locator(".annotation-block")).toHaveCount(0);
  await page.getByLabel("Visible Speech_A").check();
  await expect(page.locator(".annotation-block")).toHaveCount(1);
  await page.getByLabel("End seconds").fill("0");
  await page.getByRole("button", { name: "注釈を保存", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("開始 < 終了");
  await page.getByRole("button", { name: "削除", exact: true }).click();
  await expect(page.locator(".annotation-block")).toHaveCount(0);
});
test("CSV JSON TXT Markdown EAF downloads contain real edited annotations", async ({
  page,
}) => {
  await upload(page, "fixtures/tone.wav");
  await annotation(page);
  await page.getByRole("button", { name: "出力", exact: true }).click();
  for (const kind of ["JSON", "CSV", "TXT", "Markdown", "EAF"]) {
    const pending = page.waitForEvent("download");
    await page.getByRole("button", { name: new RegExp(`^${kind} `) }).click();
    const file = await pending;
    const content = await readFile((await file.path())!, "utf8");
    expect(content).toContain("えー、確認します。");
    if (kind === "JSON") {
      expect(JSON.parse(content).annotations).toHaveLength(1);
    }
    if (kind === "EAF") {
      expect(content).toContain('TIME_VALUE="500"');
    }
  }
});
test("JSON restores metadata and prompts to reattach original media", async ({
  page,
}) => {
  await upload(page, "fixtures/tone.wav");
  await annotation(page);
  await page.getByRole("button", { name: "出力", exact: true }).click();
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: /^JSON / }).click();
  const d = await pending;
  page.on("dialog", (dialog) => dialog.accept());
  await page
    .locator("input[type=file]")
    .nth(1)
    .setInputFiles((await d.path())!);
  await expect(page.getByRole("status")).toContainText("元メディア");
  await page.getByRole("button", { name: "メディア", exact: true }).click();
  await expect(page.locator(".missing")).toBeVisible();
  await upload(page, "fixtures/tone.wav");
  await expect(page.locator(".file-info")).toHaveCount(1);
  await expect(page.locator("audio")).toHaveAttribute("src", /^blob:/);
});
test("EAF import roundtrip and unsupported reference rejection", async ({
  page,
}) => {
  await upload(page, "fixtures/tone.wav");
  await annotation(page);
  await page.getByRole("button", { name: "出力", exact: true }).click();
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: /^EAF / }).click();
  const d = await pending;
  page.on("dialog", (dialog) => dialog.accept());
  await page
    .locator("input[type=file]")
    .nth(2)
    .setInputFiles((await d.path())!);
  await expect(page.locator(".annotation-block")).toHaveText(
    "えー、確認します。",
  );
  await page
    .locator("input[type=file]")
    .nth(2)
    .setInputFiles({
      name: "refs.eaf",
      mimeType: "application/xml",
      buffer: Buffer.from(
        "<ANNOTATION_DOCUMENT><REF_ANNOTATION/></ANNOTATION_DOCUMENT>",
      ),
    });
  await expect(page.getByRole("status")).toContainText("参照注釈");
});
test("fake microphone record/pause/resume/stop/download/reload", async ({
  page,
}) => {
  await page
    .getByRole("button", { name: "リアルタイム音声", exact: true })
    .click();
  await page.getByLabel("参加者の同意を確認しました").check();
  await page.getByRole("button", { name: "録音開始", exact: true }).click();
  await expect(page.getByText("RECORDING", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "逐語録", exact: true }).click();
  await expect(
    page.getByText("マイク使用中・録音セッション継続中"),
  ).toBeVisible();
  await page.getByRole("button", { name: "録音操作へ戻る" }).click();
  await expect(page.getByText("RECORDING", { exact: true })).toBeVisible();
  await page.waitForTimeout(1200);
  await page
    .locator(".recorder")
    .getByRole("button", { name: "一時停止", exact: true })
    .click();
  await expect(page.getByText("PAUSED", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "再開", exact: true }).click();
  await page.waitForTimeout(1100);
  await page.getByRole("button", { name: "停止", exact: true }).click();
  await expect(page.locator(".record-result audio")).toBeVisible();
  const pending = page.waitForEvent("download");
  await page.getByRole("link", { name: "録音ファイルを保存" }).click();
  expect((await pending).suggestedFilename()).toMatch(/^recording/);
  await page.getByRole("button", { name: "プロジェクトへ追加" }).click();
  await expect(page.getByRole("status")).toContainText("読込完了");
  await expect(page.locator(".file-info")).toHaveCount(1);
});
test("microphone permission denial is explicit", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
      value: () =>
        Promise.reject(new DOMException("Denied", "NotAllowedError")),
    });
  });
  await page.reload();
  await page
    .getByRole("button", { name: "リアルタイム音声", exact: true })
    .click();
  await page.getByLabel("参加者の同意を確認しました").check();
  await page.getByRole("button", { name: "録音開始", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("マイク権限が拒否");
});
test("phone width keeps workspace controls within viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await upload(page, "fixtures/tone.wav");
  await annotation(page);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await page.screenshot({ path: "test-results/mobile.png", fullPage: true });
});
