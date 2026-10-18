# FountainVideo — Architecture and decisions

## Overview

```
┌──────────────────────── Electron main process ────────────────────────┐
│  main.ts ── IPC (fv:invoke) ──►  AppCore (core.ts)                    │
│     │                            ├─ repositories ─► SQLite (node:sqlite)│
│     │                            ├─ importers (songs, Bibles)          │
│     │                            ├─ BackupManager, MediaLibrary        │
│     │                            └─ live engine (shared/live.ts)       │
│     │  events (live:state, live:deck, data:changed, notify…)          │
│     ├──────────────► operator window (React)                          │
│     └──────────────► OutputManager ──► projector window (React)       │
│  fvmedia:// protocol (local files, HTTP Range)                        │
└───────────────────────────────────────────────────────────────────────┘
```

* **One source of truth for the live state.** The main process holds `LiveState`.
  - The operator UI only sends `LiveCommand`s, and the projector only renders the state it receives.
  - Every change increments `seq`, and both windows ignore anything older than what they already show.
  - So rapid clicking or key repeat can never leave the projector showing a different slide from the operator's LIVE monitor.
* **The same renderer everywhere.** `SlideView` draws thumbnails, the LIVE/PREVIEW monitors and the projector.
  - Theme sizes are defined for a 1080-pixel-tall screen and scaled to the real height.
  - Text auto-shrinks to fit, so any resolution or aspect ratio works.
* **AppCore is Electron-free.** All business logic lives in `src/main/core.ts` and `src/shared/*`.
  - Unit tests, the browser end-to-end harness (`tests/e2e`) and the Electron app all drive the same code through the same command contract (`src/shared/api.ts`).

## Main decisions

| Decision | Choice | Why |
| --- | --- | --- |
| Desktop stack | Electron + TypeScript + React | Native multi-window/multi-display control, and Chromium's media stack (H.264/AAC, VP8/VP9) for video. One language end to end. |
| Database | SQLite via Node's built-in `node:sqlite` (Electron 40+) | Real SQLite with no native module to compile, so the Windows build is reproducible anywhere. WAL plus `synchronous=FULL`. |
| Storage layout | Songs, services and themes as rows with JSON columns for nested data (sections, items) | Atomic saves of a whole service or song; versioned migrations for schema changes. |
| Media | Imported files are copied into `<data>/media` | Services survive removed USB sticks. Paths are re-resolved by file name after a restore on another computer. |
| Projection | Frameless full-screen `BrowserWindow` on the chosen display; `backgroundThrottling: false`; autoplay allowed | Smooth video and transitions on an unfocused window, no clicks needed to start audio. |
| Display selection | Pure function `chooseOutputDisplay` | Settings choice first, then the first non-primary screen, then a test window. Re-evaluated on every display hot-plug event. |
| Bundling | esbuild | Fast, deterministic, no dev server. The packaged app loads local files only. |
| Packaging | electron-builder (NSIS installer + portable) | Per-user install, data kept in `%APPDATA%\FountainVideo` across updates and uninstall. |

## Reliability measures

* **Autosave.** The service order saves 300 ms after each change and immediately before the window closes. Songs save explicitly; unsaved changes are guarded.
* **Backups.**
  - Automatic: daily, before migrations, before the first run of a new version, and before restores.
  - Restore validates the file (SQLite header, tables, `quick_check`) and keeps a safety copy.
* **Corruption recovery.** If the database fails its integrity check, it is moved aside and the newest valid backup is restored automatically.
* **Crash handling.**
  - If the projector or operator renderer crashes, it reloads automatically, and the live state is re-sent.
  - Uncaught errors are logged to `<data>/logs` (kept 14 days). UI errors are forwarded to the same log.
* **Media errors.**
  - Unsupported video formats are refused at import with a clear message.
  - Undecodable files are reported once by the projector to the operator, and the projector stays black.
* **Security.**
  - Context isolation and sandboxed renderers, with no Node in pages.
  - IPC sender checks, a strict CSP, navigation and new windows blocked.
  - The media protocol only serves image and video file types.

## Testing strategy

| Layer | Tool | Location |
| --- | --- | --- |
| Pure logic (lyrics, references, live engine, shortcuts, display choice) | `node:test` | `tests/*.test.ts` |
| AppCore against real SQLite files (CRUD, persistence, import/export, backup/restore, recovery) | `node:test` | `tests/core.test.ts` |
| Full UI scenario: operator + projector pages, real AppCore over WebSocket | Playwright (Chromium) | `tests/e2e/` |
| Real Electron app (main process, preloads, projector window, `fvmedia://`, persistence) | Playwright `_electron` | `tests/electron/smoke.ts` (CI on Windows) |

## Adding a schema change

1. Append a migration to `src/main/db/migrations.ts` with the next `version`. Never edit a shipped migration.
2. Update the matching repository and add an integration test in `tests/core.test.ts`.
3. Existing users get an automatic backup before the migration runs.
