# FountainVideo

FountainVideo is an offline church presentation application for Windows.
It projects song lyrics, Bible passages, announcements, pictures and videos on a
second screen while the operator controls everything from the main screen.

- **Works offline.** No account, no subscription and no internet are needed after installation.
- **Saves automatically** into a local SQLite database, with daily automatic backups.
- **Two screens.** The full-screen audience view goes on the projector or TV. A test window is used when only one screen is connected.
- **Built for volunteers:** a dark interface for dim rooms, clear LIVE / PREVIEW monitors, and keyboard shortcuts for everything.

> The workflow is inspired by VideoPsalm. The implementation, interface and branding are original.

---

## Contents

1. [Install](#install)
2. [First launch](#first-launch)
3. [Preparing and running a service](#preparing-and-running-a-service)
4. [Keyboard shortcuts](#keyboard-shortcuts)
5. [Projector setup](#projector-setup)
6. [Songs, Bible, media and themes](#songs-bible-media-and-themes)
7. [Backups, updates and moving to another computer](#backups-updates-and-moving-to-another-computer)
8. [Troubleshooting](#troubleshooting)
9. [For developers](#for-developers)
10. [Known limitations](#known-limitations)

See also: [docs/FCT.md](docs/FCT.md) (new features), [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/FORMATS.md](docs/FORMATS.md).

---

## Install

### Option A: download the installer (recommended)

Every push to `main` or `dev` builds the installer on GitHub (workflow **Build & test**):

1. On GitHub, open **Actions → Build & test**, pick the latest green run, and download the **FountainVideo-windows** artifact.
   Tags named `v*` (for example `v1.0.0`) also attach the files to a GitHub Release.
2. Run `FountainVideo-Setup-<version>.exe`. You can choose the install folder, and Start-menu and desktop shortcuts are created.
3. Alternatively, `FountainVideo-Portable-<version>.exe` runs without installing, for example from a USB stick.

Windows SmartScreen may warn that the app is from an unknown publisher, because it is not code-signed.
Click **More info → Run anyway**.

### Option B: build it yourself on any Windows PC

1. Install **Node.js 22 LTS** (or newer) from nodejs.org.
2. Double-click **`build-windows.bat`** in this folder.
   It installs the build tools, runs the tests and produces the installer in `release\`.

The first build needs internet access to download Electron. The installed application never does.

---

## First launch

On the first start FountainVideo adds starter content, all of it public domain:

- 5 hymns, including *Amazing Grace* and *À toi la gloire*.
- **Samples** of the King James Version and Louis Segond 1910 (Psalm 23, John 3:16-17). Import a full Bible in the **Bible** tab.
- A **"Sunday Service"** template.

You can delete any of it. Your data is stored in `%APPDATA%\FountainVideo`.

---

## Preparing and running a service

1. **Services → New service.** Start from a template or from an empty service, and set the date.
2. In **Live**, use **Add** to add songs, Bible passages, announcements (welcome, schedule, title, closing), images, videos, blank slides and group headers.
   - Drag items to reorder them.
   - Hover an item to **edit**, **duplicate** or **remove** it.
   - Click a group header to collapse or expand its items.
   - Changes save automatically ("Saved" next to the date).
3. Connect the projector and press **F5** (or click **Projector off** in the bottom-left corner) to turn the audience screen on.
4. **Click a slide** to show it. The slide that is on screen has a red **LIVE** outline, and the big **LIVE** monitor shows exactly what the congregation sees.
   - The **PREVIEW / NEXT** monitor shows the slide you hover, the selected item, or the next slide. It is never on screen.
   - Double-click an item, or press **Enter**, to show its first slide.
5. Use the arrow keys or Space to move through slides, **.** for a black screen and **/** to clear the text but keep the background.
6. **Shift+Esc** turns the projector off. Closing FountainVideo while projecting asks for confirmation.

The open service is reopened automatically the next time you start FountainVideo.

---

## Keyboard shortcuts

All shortcuts can be changed in **Settings → Keyboard shortcuts**, which also warns about keys assigned twice.
Shortcuts are ignored while you type in a text box, except Ctrl+F, F5, Shift+Esc and Black.

| Action | Default keys |
| --- | --- |
| Next slide | → ↓ Page Down Space |
| Previous slide | ← ↑ Page Up |
| Next / previous section | Ctrl+→ / Ctrl+← |
| Next / previous service item | Ctrl+↓ / Ctrl+↑ |
| Black screen (toggle) | . or F7 |
| Clear text, keep background (toggle) | / or F8 |
| Projector on / off | F5 |
| Exit presentation (projector off) | Shift+Esc |
| Play / pause video | Ctrl+Space |
| Search songs | Ctrl+F |
| Show the selected item | Enter |
| Save song (in the song editor) | Ctrl+S |

**Song sections** (while a song is live):

| Key | Jumps to |
| --- | --- |
| 1–9 | Verse 1–9 |
| C | Chorus (pressing it again goes to the next chorus) |
| B | Bridge |
| P | Pre-chorus |
| T | Tag |
| I | Intro |
| E | Ending |

---

## Projector setup

1. Connect the projector or TV, press **Win+P** in Windows and choose **Extend**. Do not use **Duplicate**.
2. In **Settings → Projector / audience screen**:
   - **Automatic** uses the screen that is not the main one.
   - You can also pick a specific screen. **Identify screens** shows a big number on each one.
   - **Test mode** shows the audience view in a window, which is useful for rehearsing on a laptop.
3. If the projector is unplugged during a service, the audience view moves to a window on the main screen and you get a warning.
   Plug it back in and turn the projector off and on again (**F5** twice).

While the projector is on, Windows is prevented from turning the screens off.

---

## Songs, Bible, media and themes

**Songs**

Lyrics use simple headers, and a blank line starts a new slide:

```
[Verse 1]
Amazing grace! How sweet the sound
That saved a wretch like me!

I once was lost, but now am found;
Was blind, but now I see.

[Chorus]
...
```

- **Headers:** English and French names are recognised (Verse/Couplet, Chorus/Refrain, Bridge/Pont, Pre-Chorus/Pré-refrain, Tag, Intro, Ending/Fin).
- **Arrangements** set the section order, for example `V1 C V2 C B C`. Each service item can use a different arrangement.
- **Search** covers titles, lyrics and authors, and ignores accents ("eternel" finds "Éternel").
- **Import:** FountainVideo JSON, OpenLyrics XML (OpenLP and others), plain text and ChordPro (chords are removed).
- **Paste** creates a song from lyrics copied from anywhere.
- **Export:** JSON (complete), OpenLyrics or plain text. See [docs/FORMATS.md](docs/FORMATS.md).

**Bible**

- **Import:** a translation your church may use, in Zefania XML, OSIS XML, JSON or CSV/TSV format.
  Public-domain examples are the King James Version, Louis Segond 1910 and the World English Bible.
- **Go to:** type a reference, for example `John 3:16-18`, `Jn 3:16`, `Jean 3.16`, `Ps 23` or `1 Co 13`, or browse by book and chapter.
- **Select verses:** click a verse, and Shift+click another to select a range.
- **Show:** **Show now** projects the passage at once. **Add to service** adds it for later. The ☆ button saves frequently used passages.
- **Slides:** choose 1–5 verses per slide or *Automatic* (by length). The reference and translation appear in the footer.

**Media**

- **Import:** imported pictures and videos are **copied** into the library, so services keep working after a USB stick is removed.
- **Videos:** MP4 (H.264) or WebM work best. AVI and WMV are refused with a message suggesting conversion.
- **Errors:** a video that cannot be played is reported to the operator, and the projector stays black instead of showing an error.
- **Missing files** are marked with a warning in the service order and in the slides.

**Themes**

- **Built-in themes:** 8 designs for projection, including dark gradients, a serif design for scripture, a lower third for video backgrounds and light paper.
- **Your own themes:** duplicate a built-in theme to change the font, size, weight, colours, alignment, margins, shadow, outline, gradient, picture or moving-video background, background darkening and footer.
- **Fitting:** text shrinks automatically to fit, and slides adapt to any projector resolution (16:9, 16:10, 4:3).
- **Defaults:** set one default theme for songs and slides and another for the Bible, and override them per song or per service item.

---

## Backups, updates and moving to another computer

**Automatic backups**

FountainVideo backs up automatically:
- once a day at startup,
- before a database upgrade,
- **before the first start of a new version** (after an update),
- before every restore.

The last 10 automatic backups are kept.

**Manual backups**

In **Settings → Backup & restore**:
- **Back up now** saves a backup to the backups folder.
- **Save a backup to…** saves it elsewhere, for example a USB stick.
- **Restore from file…** or **Restore** in the list replaces the current data. A safety copy is made first.

**Updating**

1. Optionally click **Back up now**.
2. Run the new installer over the old one. Your data in `%APPDATA%\FountainVideo` is kept, including on uninstall.

**Moving to another computer**

1. Copy a backup (`.fvbackup`) and the `media` folder from the data folder.
2. On the new computer, restore the backup, then copy the `media` folder back into the data folder.

---

## Troubleshooting

- **Logs:** daily log files are in `%APPDATA%\FountainVideo\logs` (**Settings → About → Open logs**). They are kept for 14 days.
- **Damaged data file:** if the data file is damaged (for example after a power cut during a write), FountainVideo restores the newest backup automatically, keeps the damaged file, and tells you.
- **Projector shows the desktop instead of the slides:** use Win+P → **Extend**, then turn the projector off and on (F5 twice).
- **Video does not play:** convert it to MP4 (H.264 video, AAC audio) or WebM.
- **Nothing happens when pressing keys:** click on an empty part of the window. Shortcuts are paused while a text box has focus.

---

## For developers

```bash
npm install               # Node 22.12+ (uses the built-in node:sqlite in Electron 40+)
npm start                 # build and run the app
npm test                  # unit + integration tests (real SQLite)
npm run test:e2e          # full church-service scenario in Chromium (npx playwright install chromium)
npm run test:electron     # smoke test of the real Electron app (main process, projector window)
npm run typecheck
npm run dist              # Windows installer + portable exe in release/
```

Project layout:

```
src/shared/     domain model and pure logic (lyrics, slides, live engine, Bible references, shortcuts, validation)
src/main/       Electron main process: AppCore, SQLite repositories, importers, backups, media, projector window
src/preload/    context-isolated bridges for the operator and projector windows
src/renderer/   React UI: operator app, projector page, shared SlideView
tests/          node:test unit/integration tests, e2e harness (Playwright), Electron smoke test
scripts/        esbuild build script
docs/           FCT (new features), architecture, file formats
```

CI: `.github/workflows/build.yml` runs, on Windows:
1. type check
2. tests
3. end-to-end tests
4. the Electron smoke test
5. the installer build, uploaded as an artifact

---

## Known limitations

- **No built-in full Bibles.** Full copyrighted translations are not bundled. Only short public-domain samples are included, and full texts must be imported.
- **No physical second screen in automated tests.** Two-screen placement was tested with simulated displays. The window logic follows Windows display changes, but check it once with your own projector before the first service.
- **No chord charts or stage display.** Chords are removed on import. A separate stage/confidence monitor for musicians is not included yet.
- **English interface.** French song headers, references and Bible books are understood, but the menus are in English.
