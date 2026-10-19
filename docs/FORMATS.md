# FountainVideo — File formats

## Songs

### Lyrics text (used in the editor, `.txt` import/export and "Paste")

```
Title: Amazing Grace
Author: John Newton
Copyright: Public domain
CCLI: 0000000
Key: G
Categories: Hymn, Worship

[Verse 1]
Amazing grace! How sweet the sound
That saved a wretch like me!

I once was lost, but now am found;
Was blind, but now I see.

[Chorus]
...
```

**Metadata lines**
* The lines at the top are optional. French keys are accepted too: `Titre`, `Auteur`, `Tonalité`, `Catégories`.
* Without metadata, a short first line followed by a blank line is taken as the title.

**Section headers**
* Headers are written `[Name]`, or alone on a line for common names.

| Type | English | French | Label |
| --- | --- | --- | --- |
| Verse | Verse 1 | Couplet 1, Strophe 1 | V1 |
| Chorus | Chorus | Refrain, Chœur | C (C2, …) |
| Pre-chorus | Pre-Chorus | Pré-refrain | P |
| Bridge | Bridge | Pont | B |
| Tag | Tag | | T |
| Intro | Intro | Introduction | I |
| Ending | Ending, Outro | Fin, Final, Coda | E |

* Short labels can also be used as headers: `[V1]`, `[C]`, `[B2]`.

**Slides**
* A blank line inside a section starts a new slide.
* Without blank lines, sections longer than *Settings → Maximum lines per slide* are split evenly.
* Text without any header becomes one verse per paragraph.

### FountainVideo JSON (`.json`)

Complete export/import, used for exchange between computers.

```json
{
  "format": "fountainvideo-songs",
  "version": 1,
  "exportedAt": "2026-10-18T12:00:00.000Z",
  "songs": [
    {
      "id": "…",
      "title": "Amazing Grace",
      "author": "John Newton",
      "copyright": "Public domain",
      "ccli": "",
      "key": "G",
      "notes": "",
      "categories": ["Hymn"],
      "sections": [{ "id": "…", "label": "V1", "name": "Verse 1", "type": "verse", "text": "Amazing grace…" }],
      "arrangements": [{ "id": "…", "name": "Default", "order": ["V1", "C", "V2", "C"] }],
      "defaultArrangementId": "…",
      "themeId": null
    }
  ]
}
```

* Import also accepts:
  * a plain array of songs;
  * songs that have a `"lyrics"` string (in the text format above) instead of `"sections"`.
* Imported songs get new ids.
* A song whose title already exists is imported as "Title (imported)", so nothing is overwritten.

### OpenLyrics (`.xml`)

**Import (OpenLyrics 0.8/0.9, as used by OpenLP and others)**
* Read: title, authors, copyright, CCLI number, key, themes (as categories), verse order (as the default arrangement), and verses with `<br/>` line breaks.
* Each `<lines>` element becomes a slide.
* Chords and comments are dropped.

**Export**
* One file per song.

### ChordPro (`.cho`, `.chordpro`, `.pro`, `.crd`)

* `{title}`, `{artist}`/`{subtitle}`, `{copyright}`, `{ccli}` and `{key}` are read.
* `{soc}`/`{start_of_chorus}` and `{comment: Verse 2}` become section headers.
* Chords in square brackets are removed.

## Bibles

The church must be allowed to use the translation it imports. Public-domain texts such as the King James Version, Louis Segond 1910 and the World English Bible are freely available in these formats.

| Format | Recognised by | Structure |
| --- | --- | --- |
| Zefania XML | `<XMLBIBLE>` | `<BIBLEBOOK bnumber bname><CHAPTER cnumber><VERS vnumber>text</VERS>`. Notes and cross-references are skipped. |
| OSIS XML | `<osis>` or `osisID=` | `<verse osisID="John.3.16">…</verse>` (container) or `<verse sID/>…<verse eID/>` (milestone). Notes and titles are skipped. |
| JSON | `.json` or leading `[`/`{` | `[{ "book": 43 or "John", "chapter": 3, "verse": 16, "text": "…" }]`, or nested `[{ "name"/"abbrev": "John", "chapters": [["v1", "v2", …], …] }]`, or the same wrapped as `{ "name", "abbreviation", "language", "books": [...] }` |
| CSV / TSV | anything else | `book,chapter,verse,text`. The book is a number (1–66), an English or French name, or an OSIS id. An optional header row is fine, and quotes are supported. |

* Book numbers follow the 66-book Protestant order (1 Genesis … 66 Revelation).
* Book names found in the file are kept for display and are also accepted in references, so `Sprüche 3:5` works for a German Bible.

## Backups (`.fvbackup`)

A backup is a complete SQLite copy of the database, written with `VACUUM INTO`.
It contains songs, services, templates, themes, Bible texts, favorites, the media list and settings.
The media files themselves stay in `<data>/media`; copy that folder too when moving to another computer.
