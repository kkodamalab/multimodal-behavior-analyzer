# Multimodal Behavior Analyzer

研究用のブラウザローカル・メディアアノテーション環境です。**v0.1.0は再生・手動アノテーション基盤です。AI解析機能はまだありません。**

- Repository: https://github.com/kkodamalab/multimodal-behavior-analyzer
- Public app: https://kkodamalab.github.io/multimodal-behavior-analyzer/
- 実装範囲・制約: [DEVELOPMENT_STATUS.md](DEVELOPMENT_STATUS.md)
- 検証記録: [VERIFICATION.md](VERIFICATION.md)

2026-10-21: PR #1をCI成功後mainへマージしPages公開済み。単体18件、ローカル/公開版それぞれE2E15件が成功しています（合成メディア・仮想マイクでの確認）。

## はじめに

1. 公開アプリ→「ファイルを選択」で音声または映像を選びます。別ファイルなら「MULTI-FILE」から両方を追加します。
2. 右側の長さ・容量・音声トラック情報を確認。開始時刻は「開始オフセット（秒）」で合わせます。正の値は遅く開始します。
3. 再生ボタン→「注釈追加」→Tier・開始/終了秒・テキスト→「注釈を保存」。既存区間のクリックで編集できます。
4. 「保存」でブラウザにプロジェクトとメディアを保存。変更時は自動保存もあります。再読込で最後の保存状態を復元します。
5. 「出力」→「JSON」でバックアップ。CSV/TXT/Markdown/EAFも出力可能。**JSONに元メディアは含まれません。別途保管してください。**
6. 「リアルタイム音声」→同意確認→「録音開始」→「停止」→「録音ファイルを保存」または「プロジェクトへ追加」。

元メディアは外部送信しません。サイトへのアクセスに通常必要なHTTP通信は発生します。端末の機密データを消去するにはブラウザのサイトデータ削除を行ってください。

## 開発・検証

Node.js 24、npm、FFmpeg（E2E用）を使用。

```sh
npm ci
npm run dev
npm test
npm run build
node scripts/fixtures.mjs
npx playwright install chromium
npm run test:e2e
```

Vite baseは `/multimodal-behavior-analyzer/`。E2Eは合成データを使用し、参加者データは含みません。公開版の検証は環境変数 `MBA_BASE_URL=https://kkodamalab.github.io/multimodal-behavior-analyzer/` を設定し `npm run test:e2e` を実行します。

## 公開フロー

PRのCIで単体テスト、TypeScript/Viteビルド、Chromium E2Eを実行。mainのCI成功後にActionsがPagesへデプロイします。Pages設定のSourceはGitHub Actionsです。

## 構成

- `src/App.tsx`: セッション、メディア同期、注釈UI
- `src/model.ts`: プロジェクト構造、区間検証、履歴、出力
- `src/media.ts`: Mediabunnyトラック検査、Web Audio波形
- `src/storage.ts`: IndexedDB保存
- `src/Recorder.tsx`: MediaDevices/MediaRecorder録音
- `src/eaf.ts`: ELAN EAF 3.0の独立した時間整列Tier部分集合

EAFは[公式EAF 3.0仕様](https://www.mpi.nl/tools/elan/EAF_Annotation_Format_3.0_and_ELAN.pdf)を参照。階層/参照注釈は未対応、ELAN実機互換性検証は未実施です。トラック検査は[Mediabunny](https://github.com/Vanilagy/mediabunny)を使用。

## AI・モデル

現在、AI推論エンジン・モデル設定画面はありません。APIキーは不要です。Whisper、WhisperX、pyannote.audio、MediaPipeは同梱していません。後続開発でライセンス・必要メモリ・実行環境を確定し、モデル未設定/設定済みの両方を検証する必要があります。

## メディア互換性

WAV/MP3/M4A/MP4/WebM等のうちブラウザがデコードできるファイルを使用できます。未対応/破損はエラー表示します。変換例（元ファイルを上書きしないでください）:

```sh
ffmpeg -i input.mov -c:v libx264 -pix_fmt yuv420p -c:a aac converted.mp4
ffmpeg -i input.m4a -c:a pcm_s16le converted.wav
```

AI文字起こし・話者分離・要約・身体解析・RQA/CRQAは未実装です。Coming Soonは利用可能な機能を意味しません。
