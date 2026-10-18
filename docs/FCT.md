# FCT — New features (FountainVideo 1.0.0)

**Branch:** `dev` · **Date:** 2026-10-18 · **Scope:** first version of the application. Every feature below is new.

**Legend for the "Verified" column**
- **U**: unit/integration test (`npm test`)
- **E2E**: full browser scenario (`npm run test:e2e`)
- **EL**: real-Electron smoke test (`npm run test:electron`, runs in CI on Windows)
- **Manual**: needs a check on the church computer

---

## 1. Songs and lyrics

| ID | Feature | What it does | How to use | Main code | Verified |
| --- | --- | --- | --- | --- | --- |
| S-01 | Song library | Create, edit, duplicate and delete songs with title, author, copyright, CCLI, key, notes and categories. | **Songs → New song**, then **Save** (Ctrl+S), **Duplicate** or **Delete**. | `views/songs/SongsView.tsx`, `main/db/songsRepo.ts` | U, E2E |
| S-02 | Sections and slide breaks | Lyrics are split into verses, choruses, bridges, pre-choruses, tags, intros and endings, with English and French headers. A blank line starts a new slide; long sections are split evenly. | Type `[Verse 1]`, `[Chorus]`, `Refrain`, `Pont`… in the lyrics box. The slide preview updates live. | `shared/lyrics.ts` | U |
| S-03 | Arrangements | Named section orders (e.g. `V1 C V2 C B C`), one default per song, chosen per service item. Unknown labels are rejected with a message. | Song editor → **Add arrangement**. In a service: item → **Edit** → *Arrangement*. | `shared/lyrics.ts`, `shared/validation.ts`, `ItemEditor.tsx` | U |
| S-04 | Instant search | Searches titles, lyrics, authors and categories, ignoring accents and case; title matches rank first. | Search box in **Songs**, or **Ctrl+F** anywhere. | `songsRepo.ts`, `shared/util.ts` | U, E2E |
| S-05 | Categories | Worship, Praise, Communion, Prayer, Hymn… plus your own; filter by category. | Category chips in the editor; category filter above the list. | `SongsView.tsx` | U |
| S-06 | Import | FountainVideo JSON, OpenLyrics XML, plain text, ChordPro (chords removed). Duplicate titles are never overwritten. A report lists skipped files. | **Songs → Import…** (several files at once). | `main/importers/songFormats.ts` | U |
| S-07 | Paste lyrics | Creates a song from text copied from a web page or document. | **Songs → Paste**. | `SongsView.tsx` (PasteDialog) | U |
| S-08 | Export | All songs or the selected one, as JSON (complete), OpenLyrics or text. | **Songs → Export…**. | `songFormats.ts`, `core.ts` | U |
| S-09 | Section shortcuts | While a song is live, keys jump to sections: 1–9 for verses, C chorus (next chorus on repeat), B bridge, P, T, I, E. | Press the key during the service. | `shared/live.ts`, `shared/shortcuts.ts` | U, E2E |
| S-10 | Delete protection | Warns which services use a song before deleting it. Items whose song is gone show a warning. | Delete a song that is in a service. | `core.ts` (`songs.usage`) | U |

## 2. Service planning

| ID | Feature | What it does | How to use | Main code | Verified |
| --- | --- | --- | --- | --- | --- |
| P-01 | Services | Create, open, duplicate and delete service plans with a name and a date. The last open service is reopened at start-up. | **Services → New service**, **Open**, duplicate icon. | `views/services/*`, `servicesRepo.ts` | U, E2E |
| P-02 | Every item type | Songs, Bible passages, announcements, images, videos, blank slides and group headers. | **Live → Add** menu. | `LiveView.tsx`, `pickers.tsx`, `shared/slides.ts` | U, E2E |
| P-03 | Drag and drop | Reorder items. A line shows where the item will drop. | Drag an item in the service order. | `LiveView.tsx` (ServicePanel) | Manual (logic U) |
| P-04 | Edit, duplicate, remove | Per-item editor (title, arrangement, reference, verses per slide, announcement slides, loop/mute, theme, operator notes); duplicate; remove with confirmation. | Hover an item → pencil / copy / bin. | `ItemEditor.tsx`, `useService.ts` | E2E |
| P-05 | Groups | Group headers ("Worship", "The Word"…) organise the order, can be collapsed, and are never projected. | **Add → Group header**; click a header to collapse it. | `LiveView.tsx` | U |
| P-06 | Templates | Save a service as a template and create new services from it. The starter "Sunday Service" template is included. | **Services → Save as template / New service from this**. | `servicesRepo.ts` (`duplicate`) | U, E2E |
| P-07 | Autosave | The service order saves 300 ms after each change and before closing ("Saving…/Saved"). | Automatic. | `useService.ts` | E2E (close & reopen) |
| P-08 | Operator notes | Notes on an item are shown above its slides and are never projected. | Item → **Edit** → *Operator notes*. | `ItemEditor.tsx`, `LiveView.tsx` | Manual |

## 3. Live presentation

| ID | Feature | What it does | How to use | Main code | Verified |
| --- | --- | --- | --- | --- | --- |
| L-01 | Operator screen | Service order, slide thumbnails with section labels, a **LIVE** monitor (exactly what is projected) and a **PREVIEW / NEXT** monitor (never projected). | **Live** tab. | `LiveView.tsx`, `common/SlideView.tsx` | E2E |
| L-02 | Live indicators | The live item and slide have a red outline and LIVE badges. **BLACK**, **TEXT CLEARED** and **PROJECTOR OFF** badges show the screen state. A red strip in other tabs shows what is live. | — | `LiveView.tsx`, `App.tsx` | E2E |
| L-03 | Navigation | Next/previous slide, section and item; click a slide to show it; double-click an item or press Enter to show its first slide. Optionally continue into the next item. | Control buttons, keyboard, **Settings → Presentation**. | `shared/live.ts` | U, E2E |
| L-04 | Black / clear | Black screen, or clear the text while keeping the background, as toggles. | **.** / **/** (or F7 / F8), buttons. | `shared/live.ts`, `SlideView.tsx` | U, E2E |
| L-05 | Projector on/off and safe exit | Turn the audience screen on and off; Shift+Esc closes it; quitting while projecting asks for confirmation. | **F5**, **Shift+Esc**, *ON AIR* button. | `main/output.ts`, `main/main.ts` | E2E, EL |
| L-06 | Out-of-order protection | Every live change has a sequence number; stale updates are ignored, so 40 rapid key presses leave the projector in sync. | — | `shared/live.ts`, `output/index.tsx` | U, E2E |
| L-07 | Live editing | Editing a song or item that is on screen updates the projected slide without losing the position. | Edit while live. | `rebaseLiveState` in `shared/live.ts` | U |

## 4. Dual-screen projection

| ID | Feature | What it does | How to use | Main code | Verified |
| --- | --- | --- | --- | --- | --- |
| D-01 | Screen detection and choice | Lists Windows displays; *Automatic* uses the non-main screen; any screen can be chosen. | **Settings → Projector / audience screen**. | `main/output.ts`, `main/displays.ts` | U (rules), **Manual** (real projector) |
| D-02 | Full-screen audience window | Frameless, cursor hidden, always on top of pop-ups on the projector, no controls. Text and backgrounds scale to any resolution and aspect ratio. | F5. | `output.ts`, `renderer/output/` | EL, **Manual** |
| D-03 | Test mode | With one screen, or when forced, the audience view opens in a resizable window. | Settings → *Test mode*. | `displays.ts`, `output.ts` | U, EL |
| D-04 | Hot-plug | If the projector is unplugged mid-service, the view moves to a window and the operator is warned. Screen changes are followed live. | Automatic. | `output.ts` (`handleDisplaysChanged`) | **Manual** |
| D-05 | Identify screens | Shows a big number on each screen for 3 seconds. | Settings → **Identify screens**. | `output.ts` | **Manual** |
| D-06 | Keep awake | Windows will not turn the screens off while projecting. | Automatic. | `powerSaveBlocker` in `output.ts` | **Manual** |
| D-07 | Self-healing projector | If the projector page crashes it reloads, and the live state is re-sent. | Automatic. | `output.ts` | **Manual** |

## 5. Bible

| ID | Feature | What it does | How to use | Main code | Verified |
| --- | --- | --- | --- | --- | --- |
| B-01 | Import translations | Zefania XML, OSIS, JSON, CSV/TSV, with name, abbreviation, language and licence or permission. Several translations can be installed. | **Bible → Import** icon. | `main/importers/bibleFormats.ts`, `bibleRepo.ts` | U, E2E |
| B-02 | References (EN/FR) | Accepts `John 3:16-18`, `Jn 3:16`, `Jean 3.16`, `1 Co 13`, `Ps 23`, `Romans 8:28-9:2`, roman numerals, and the book names stored in the imported file. Clear error messages. | Reference box in **Bible**, in **Add → Bible passage**, and in the item editor. | `shared/bibleRef.ts`, `shared/bibleBooks.ts` | U |
| B-03 | Browse and select | Book list, chapter selector, click / Shift+click verse ranges. | **Bible** tab. | `BibleView.tsx` | E2E |
| B-04 | Bible slides | 1–5 verses per slide or automatic by length; optional verse numbers; footer "Psalms 23:1 (WEB)". Default theme for scripture. | Item editor / Bible tab. | `shared/slides.ts` | U, E2E |
| B-05 | Show now / add to service | Projects a passage immediately or adds it after the selected item. | **Show now**, **Add to service**. | `BibleView.tsx` | E2E |
| B-06 | Text search | Searches words in the translation, ignoring accents. | Right panel → *Search the text*. | `bibleRepo.ts` | U |
| B-07 | Favorites | Saves frequently used passages per translation. | ☆ button. | `bibleRepo.ts` | U |
| B-08 | Public-domain samples | KJV and Louis Segond 1910 samples (Ps 23, Jn 3:16-17) so the module works on first launch. No copyrighted text is bundled or downloaded. | — | `main/seed.ts` | U |

## 6. Slide design (themes)

| ID | Feature | What it does | How to use | Main code | Verified |
| --- | --- | --- | --- | --- | --- |
| T-01 | Built-in themes | 8 projection presets: Midnight, Classic Black, Royal Serif, Warm Sunrise, Forest, Scripture, Lower Third, Light Paper. | **Themes**. | `shared/themes.ts` | U |
| T-02 | Theme editor | Font, max size, weight, italic, uppercase, colour, horizontal/vertical alignment, line spacing, margins, shadow, outline, title and footer styles, background (colour, gradient, picture, looping video) and background darkening. Live preview of a song, a Bible verse and a title. | **Themes → Duplicate** a preset → edit → **Save**. | `views/themes/ThemesView.tsx` | E2E (page), U (validation) |
| T-03 | Auto-fit and scaling | Text shrinks to fit its box; sizes scale with the screen height, so 720p, 1080p, 4K, 4:3 and 16:10 all look right. | Automatic. | `common/SlideView.tsx` | E2E |
| T-04 | Theme defaults and overrides | Default theme for songs and slides, a separate default for the Bible, and per-song or per-item overrides. | **Use for songs & slides**, **Use for Bible**; *Theme* in the song or item editor. | `core.ts` (`slideContext`) | U (defaults), Manual (overrides) |

## 7. Media and announcements

| ID | Feature | What it does | How to use | Main code | Verified |
| --- | --- | --- | --- | --- | --- |
| M-01 | Media library | Imports images and videos by copying them into the library; previews; delete; add or show in the service. | **Media → Import files…** | `main/mediaLibrary.ts`, `MediaView.tsx` | U, E2E |
| M-02 | Video playback | Plays on the projector with sound, with play/pause/restart, loop and mute options. MP4 (H.264) and WebM recommended. | Show a video item; **Ctrl+Space**. | `SlideView.tsx` (VideoLayer), `shared/live.ts` | E2E, **Manual** (H.264 on Windows) |
| M-03 | Format and error handling | AVI, WMV and similar files are refused at import with advice. Undecodable files are reported once to the operator and the projector stays black. | — | `mediaLibrary.ts`, `SlideView.tsx`, `core.ts` | U, E2E |
| M-04 | Missing files | Items whose file disappeared show a warning in the order and on thumbnails; the projector shows the background only. | — | `shared/slides.ts`, `LiveView.tsx` | U, E2E |
| M-05 | Moving computers | After a restore on another PC, media are found by file name in the local library. | Restore a backup, then copy the `media` folder. | `core.ts` (`resolveMediaPath`) | U |
| M-06 | Announcements | Presets for welcome, service schedule, title, generic announcement and closing; several slides per item, each with a title, text and optional background picture. | **Add → Announcement…** | `itemFactory.ts`, `ItemEditor.tsx` | E2E |

## 8. Keyboard shortcuts

| ID | Feature | What it does | How to use | Main code | Verified |
| --- | --- | --- | --- | --- | --- |
| K-01 | Default shortcuts | Next/previous slide, section and item; black; clear; projector on/off; exit; play/pause; search; show selected item. Shown on the buttons. | See the README table. | `shared/shortcuts.ts`, `App.tsx` | U, E2E |
| K-02 | Customisation | Add or remove keys per action, warning on conflicts, reset to defaults; saved in the database. | **Settings → Keyboard shortcuts → Add key**. | `SettingsView.tsx` | U (conflicts), E2E (page) |
| K-03 | No conflict with typing | Shortcuts pause while typing in a text box or when a dialog is open, except Ctrl+F, F5, Shift+Esc and Black. | Automatic. | `App.tsx` (`useGlobalShortcuts`) | E2E |

## 9. Storage, backup and reliability

| ID | Feature | What it does | How to use | Main code | Verified |
| --- | --- | --- | --- | --- | --- |
| R-01 | Local SQLite database | All data in `%APPDATA%\FountainVideo\fountainvideo.db`, with WAL and full sync. Works offline, with no account. | Automatic. | `main/db/database.ts` | U, EL |
| R-02 | Migrations | Versioned schema upgrades, with an automatic backup before each one. | Automatic. | `main/db/migrations.ts` | U |
| R-03 | Input validation | Titles, lyrics, arrangements, references, item types, theme values and settings are checked and clamped, with readable error messages. | — | `shared/validation.ts`, `shared/settings.ts` | U |
| R-04 | Automatic backups | Daily, before migrations, before the first run of a new version, and before restores. The last 10 are kept. | Automatic. | `main/backup.ts`, `core.ts` | U |
| R-05 | Manual backup and restore | Back up now or to a chosen file; restore from the list or from a file, with validation and a safety copy. | **Settings → Backup & restore**. | `core.ts` (`restore`) | U, E2E |
| R-06 | Corruption recovery | A damaged database is moved aside and the newest valid backup restored, and the operator is told. | Automatic. | `core.ts` (`recoverDatabase`) | U |
| R-07 | Logging | Daily log files kept 14 days, including UI errors. Folders open from Settings. | **Settings → About → Open logs**. | `main/logger.ts` | Manual |
| R-08 | Single instance | Starting the app twice focuses the existing window. | — | `main.ts` | **Manual** |

## 10. Build, installation and CI

| ID | Feature | What it does | How to use | Main code | Verified |
| --- | --- | --- | --- | --- | --- |
| I-01 | Reproducible build | An esbuild bundle (no dev server); the app loads local files only. | `npm run build` | `scripts/build.mjs` | Run here |
| I-02 | Windows installer and portable exe | NSIS per-user installer (choose folder, Start menu and desktop shortcuts) plus a portable exe, with the app icon. Data is kept on update and uninstall. | `npm run dist` or `build-windows.bat` | `package.json` (`build`), `build/icon.*` | CI (built), Manual (install) |
| I-03 | GitHub Actions | On Windows: type check, tests, end-to-end, Electron smoke test, installer build, uploaded artifact; `v*` tags create a release. | Push to `dev`/`main`, or tag `v1.0.0`. | `.github/workflows/build.yml` | CI (green) |
| I-04 | First-launch experience | Welcome dialog with the 4-step Sunday workflow; starter hymns, Bible samples and a template. | First start. | `App.tsx`, `main/seed.ts` | U, E2E |

---

## Test summary

The **Build & test** workflow ran on GitHub Actions, on Windows, on 2026-10-18 (run 39149752416). Every step was green:

| Suite | Result |
| --- | --- |
| `npm run typecheck` (official Electron and React typings) | Pass |
| `npm test` (unit + integration on real SQLite) | 37 / 37 pass |
| `npm run test:e2e` (operator + projector pages in Chromium, real core) | Full church-service scenario passes |
| `npm run test:electron` (real Electron app: projector window, `fvmedia://` image, restart persistence) | Pass |
| `npm run dist` | Installer + portable exe built and uploaded as the `FountainVideo-windows` artifact |
| Manual checks still needed on the church PC | D-01, D-02, D-04 to D-07 with the real projector; M-02 with your own MP4 files; R-08 |
