/**
 * Song import/export formats (see docs/FORMATS.md):
 *  - FountainVideo JSON (.json)  — full fidelity, used for backups/exchange
 *  - OpenLyrics XML (.xml)       — open standard used by OpenLP and others
 *  - Plain text (.txt)           — "[Verse 1]" style headers, optional "Title:" lines
 *  - ChordPro (.cho/.chordpro/.pro/.crd) — chords are stripped
 */
import type { Song, SongArrangement, SongSection } from '../../shared/types';
import { classifyHeader, parseLyrics, serializeLyrics } from '../../shared/lyrics';
import { newId, nowIso } from '../../shared/util';
import { escapeXml, find, findAll, parseXmlTree, textOf, type XmlNode } from './xml';
import { looksLikeVideoPsalm, parseVideoPsalm } from './videopsalm';

export const SONG_JSON_FORMAT = 'fountainvideo-songs';
export const SONG_IMPORT_EXTENSIONS = ['json', 'vpc', 'xml', 'txt', 'cho', 'chordpro', 'pro', 'crd'];

export function emptySong(title = ''): Song {
  const now = nowIso();
  return {
    id: newId(),
    title,
    author: '',
    copyright: '',
    ccli: '',
    key: '',
    notes: '',
    categories: [],
    songbook: '',
    songbookNumber: '',
    sections: [],
    arrangements: [],
    defaultArrangementId: null,
    themeId: null,
    createdAt: now,
    updatedAt: now,
  };
}

function extension(fileName: string): string {
  const m = /\.([^.\\/]+)$/.exec(fileName);
  return m ? m[1]!.toLowerCase() : '';
}

function baseName(fileName: string): string {
  return fileName.replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, '');
}

/** Parses the content of one file into song drafts (not yet validated). */
export function parseSongFile(fileName: string, content: string): Song[] {
  const text = content.replace(/^﻿/, '');
  const ext = extension(fileName);
  if (ext === 'vpc' || ((ext === 'json' || ext === '') && looksLikeVideoPsalm(text))) {
    return parseVideoPsalm(text, baseName(fileName)).songs;
  }
  switch (ext) {
    case 'json':
      return parseSongJson(text);
    case 'xml':
      return [parseOpenLyrics(text, baseName(fileName))];
    case 'cho':
    case 'chordpro':
    case 'pro':
    case 'crd':
      return [parseChordPro(text, baseName(fileName))];
    case 'txt':
    default:
      return [parsePlainText(text, baseName(fileName))];
  }
}

// ------------------------------------------------------------------ JSON

export function parseSongJson(text: string): Song[] {
  const data = JSON.parse(text) as unknown;
  const list = Array.isArray(data)
    ? data
    : data && typeof data === 'object' && Array.isArray((data as { songs?: unknown[] }).songs)
      ? (data as { songs: unknown[] }).songs
      : null;
  if (!list) throw new Error('This JSON file does not contain songs.');
  return list.map((raw) => {
    const r = raw as Partial<Song> & { lyrics?: string };
    const song = { ...emptySong(String(r.title ?? '')), ...r } as Song;
    if ((!Array.isArray(r.sections) || r.sections.length === 0) && typeof r.lyrics === 'string') {
      song.sections = parseLyrics(r.lyrics);
    }
    song.categories = Array.isArray(r.categories) ? r.categories.map(String) : [];
    song.songbook = typeof r.songbook === 'string' ? r.songbook : '';
    song.songbookNumber = r.songbookNumber === undefined || r.songbookNumber === null ? '' : String(r.songbookNumber);
    song.arrangements = Array.isArray(r.arrangements) ? r.arrangements : [];
    return song;
  });
}

export function exportSongJson(songs: Song[]): string {
  return JSON.stringify({ format: SONG_JSON_FORMAT, version: 1, exportedAt: nowIso(), songs }, null, 2);
}

// ------------------------------------------------------------------ Plain text

const META = /^\s*(title|titre|author|auteur|copyright|ccli|key|tonalit[eé]|categories|cat[eé]gories|songbook|recueil|number|num[eé]ro)\s*:\s*(.*)$/i;

export function parsePlainText(text: string, fallbackTitle: string): Song {
  const song = emptySong(fallbackTitle);
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  let i = 0;
  let sawMeta = false;
  while (i < lines.length) {
    const m = META.exec(lines[i]!);
    if (!m) break;
    sawMeta = true;
    const key = m[1]!.toLowerCase();
    const value = m[2]!.trim();
    if (key.startsWith('tit')) song.title = value;
    else if (key.startsWith('aut')) song.author = value;
    else if (key === 'copyright') song.copyright = value;
    else if (key === 'ccli') song.ccli = value;
    else if (key === 'key' || key.startsWith('tonalit')) song.key = value;
    else if (key === 'songbook' || key === 'recueil') song.songbook = value;
    else if (key === 'number' || key.startsWith('num')) song.songbookNumber = value;
    else song.categories = value.split(/[,;]/).map((c) => c.trim()).filter(Boolean);
    i += 1;
  }
  let body = lines.slice(i).join('\n');
  if (!sawMeta) {
    // "Title\n\nlyrics..." : a short first line followed by a blank line is the title.
    const first = lines.findIndex((l) => l.trim() !== '');
    if (first >= 0 && lines[first + 1]?.trim() === '' && lines[first]!.trim().length <= 80 && !/^\s*\[/.test(lines[first]!)) {
      song.title = lines[first]!.trim();
      body = lines.slice(first + 2).join('\n');
    }
  }
  song.sections = parseLyrics(body);
  return song;
}

export function exportPlainText(song: Song): string {
  const meta = [`Title: ${song.title}`];
  if (song.author) meta.push(`Author: ${song.author}`);
  if (song.copyright) meta.push(`Copyright: ${song.copyright}`);
  if (song.ccli) meta.push(`CCLI: ${song.ccli}`);
  if (song.key) meta.push(`Key: ${song.key}`);
  if (song.songbook) meta.push(`Songbook: ${song.songbook}`);
  if (song.songbookNumber) meta.push(`Number: ${song.songbookNumber}`);
  if (song.categories.length) meta.push(`Categories: ${song.categories.join(', ')}`);
  return `${meta.join('\n')}\n\n${serializeLyrics(song.sections)}\n`;
}

// ------------------------------------------------------------------ ChordPro

export function parseChordPro(text: string, fallbackTitle: string): Song {
  const song = emptySong(fallbackTitle);
  const out: string[] = [];
  for (const rawLine of text.replace(/\r\n?/g, '\n').split('\n')) {
    const directive = /^\s*\{\s*([a-z_]+)\s*(?::\s*(.*?))?\s*\}\s*$/i.exec(rawLine);
    if (directive) {
      const name = directive[1]!.toLowerCase();
      const value = (directive[2] ?? '').trim();
      if (name === 'title' || name === 't') song.title = value;
      else if (name === 'subtitle' || name === 'st' || name === 'artist' || name === 'composer') song.author = song.author || value;
      else if (name === 'copyright') song.copyright = value;
      else if (name === 'ccli') song.ccli = value;
      else if (name === 'key') song.key = value;
      else if (name === 'start_of_chorus' || name === 'soc') out.push(`[${value || 'Chorus'}]`);
      else if (name === 'start_of_verse' || name === 'sov') out.push(`[${value || 'Verse'}]`);
      else if (name === 'start_of_bridge' || name === 'sob') out.push(`[${value || 'Bridge'}]`);
      else if (name === 'comment' || name === 'c' || name === 'ci' || name === 'comment_italic') {
        if (value && classifyHeader(value).type !== 'other') out.push(`[${value}]`);
      }
      continue;
    }
    if (/^\s*#/.test(rawLine)) continue;
    out.push(rawLine.replace(/\[[^\]]*\]/g, '').replace(/\s{2,}/g, ' ').trimEnd());
  }
  song.sections = parseLyrics(out.join('\n'));
  return song;
}

// ------------------------------------------------------------------ OpenLyrics

const OL_TYPES: Record<string, string> = { v: 'Verse', c: 'Chorus', b: 'Bridge', p: 'Pre-Chorus', e: 'Ending', i: 'Intro', o: 'Other' };

function linesText(node: XmlNode): string {
  const parts: string[] = [];
  for (const child of node.children) {
    if (typeof child === 'string') parts.push(child.replace(/\s*\n\s*/g, ' '));
    else if (child.name === 'br') parts.push('\n');
    else if (child.name === 'chord' || child.name === 'comment') {
      if (child.name === 'chord') parts.push(textOf(child));
    } else parts.push(linesText(child));
  }
  return parts
    .join('')
    .split('\n')
    .map((l) => l.trim())
    .join('\n')
    .trim();
}

export function parseOpenLyrics(xml: string, fallbackTitle: string): Song {
  const root = parseXmlTree(xml);
  const songNode = find(root, 'song');
  if (!songNode) throw new Error('Not an OpenLyrics file (no <song> element).');
  const song = emptySong(fallbackTitle);
  const props = find(songNode, 'properties');
  if (props) {
    const title = find(props, 'title');
    if (title) song.title = textOf(title).trim() || fallbackTitle;
    song.author = findAll(props, 'author')
      .map((a) => textOf(a).trim())
      .filter(Boolean)
      .join(', ');
    song.copyright = textOf(find(props, 'copyright')).trim();
    song.ccli = textOf(find(props, 'ccliNo')).trim();
    song.key = textOf(find(props, 'key')).trim();
    song.categories = findAll(props, 'theme').map((t) => textOf(t).trim()).filter(Boolean);
    const book = find(props, 'songbook');
    if (book) {
      song.songbook = (book.attrs.name ?? '').trim();
      song.songbookNumber = (book.attrs.entry ?? '').trim();
    }
  }
  const lyrics = find(songNode, 'lyrics');
  const sections: SongSection[] = [];
  const nameToLabel = new Map<string, string>();
  const verseNodes = lyrics ? findAll(lyrics, 'verse') : [];
  // Number a section only when its type occurs with several numbers ("c1" alone = "Chorus").
  const numbersByType = new Map<string, Set<string>>();
  for (const verse of verseNodes) {
    const m = /^([a-z])(\d*)/i.exec((verse.attrs.name ?? '').trim());
    if (!m) continue;
    const key = m[1]!.toLowerCase();
    numbersByType.set(key, (numbersByType.get(key) ?? new Set()).add(m[2] ?? ''));
  }
  for (const verse of verseNodes) {
    const olName = (verse.attrs.name ?? '').trim();
    const m = /^([a-z])(\d*)([a-z]?)$/i.exec(olName);
    const typeKey = m ? m[1]!.toLowerCase() : 'v';
    const type = OL_TYPES[typeKey] ?? 'Verse';
    const numbered = typeKey === 'v' || (numbersByType.get(typeKey)?.size ?? 0) > 1;
    const number = m && m[2] && numbered ? ` ${m[2]}` : '';
    const name = `${type}${number}`;
    const text = findAll(verse, 'lines').map(linesText).join('\n\n');
    // Same section split in parts (v1a, v1b) => merge into one section.
    const existing = sections.find((s) => s.name === name);
    if (existing) {
      existing.text += `\n\n${text}`;
      nameToLabel.set(olName.toLowerCase(), existing.label);
      continue;
    }
    const parsed = parseLyrics(`[${name}]\n${text}`)[0];
    if (!parsed) continue;
    sections.push(parsed);
    nameToLabel.set(olName.toLowerCase(), parsed.label);
  }
  // Re-label to guarantee uniqueness.
  const relabeled = parseLyrics(serializeLyrics(sections));
  relabeled.forEach((s, i) => {
    const old = sections[i]!.label;
    for (const [k, v] of nameToLabel) if (v === old) nameToLabel.set(k, s.label);
  });
  song.sections = relabeled;
  const order = textOf(props ? find(props, 'verseOrder') : null)
    .split(/\s+/)
    .map((t) => nameToLabel.get(t.toLowerCase()))
    .filter((t): t is string => Boolean(t));
  if (order.length > 0) {
    const arrangement: SongArrangement = { id: newId(), name: 'Default', order };
    song.arrangements = [arrangement];
    song.defaultArrangementId = arrangement.id;
  }
  return song;
}

const TYPE_TO_OL: Record<string, string> = {
  verse: 'v',
  chorus: 'c',
  'pre-chorus': 'p',
  bridge: 'b',
  tag: 'o',
  intro: 'i',
  outro: 'e',
  other: 'o',
};

export function exportOpenLyrics(song: Song): string {
  const counters = new Map<string, number>();
  const olNames = new Map<string, string>();
  for (const s of song.sections) {
    const prefix = TYPE_TO_OL[s.type] ?? 'o';
    const n = (counters.get(prefix) ?? 0) + 1;
    counters.set(prefix, n);
    olNames.set(s.label.toUpperCase(), `${prefix}${n}`);
  }
  const arrangement = song.arrangements.find((a) => a.id === song.defaultArrangementId) ?? song.arrangements[0];
  const verseOrder = arrangement ? arrangement.order.map((l) => olNames.get(l.toUpperCase())).filter(Boolean).join(' ') : '';
  const verses = song.sections
    .map((s) => {
      const blocks = s.text
        .split(/\n\s*\n/)
        .map((b) => `      <lines>${b.split('\n').map(escapeXml).join('<br/>')}</lines>`)
        .join('\n');
      return `    <verse name="${olNames.get(s.label.toUpperCase())}">\n${blocks}\n    </verse>`;
    })
    .join('\n');
  const authors = song.author
    ? `      <authors>\n${song.author
        .split(/\s*[,;&]\s*/)
        .filter(Boolean)
        .map((a) => `        <author>${escapeXml(a)}</author>`)
        .join('\n')}\n      </authors>\n`
    : '';
  const songbooks = song.songbook
    ? `      <songbooks>\n        <songbook name="${escapeXml(song.songbook)}"${song.songbookNumber ? ` entry="${escapeXml(song.songbookNumber)}"` : ''}/>\n      </songbooks>\n`
    : '';
  const themes = song.categories.length
    ? `      <themes>\n${song.categories.map((c) => `        <theme>${escapeXml(c)}</theme>`).join('\n')}\n      </themes>\n`
    : '';
  return `<?xml version="1.0" encoding="UTF-8"?>
<song xmlns="http://openlyrics.info/namespace/2009/song" version="0.9" createdIn="FountainVideo" modifiedDate="${nowIso()}">
  <properties>
      <titles>
        <title>${escapeXml(song.title)}</title>
      </titles>
${authors}${song.copyright ? `      <copyright>${escapeXml(song.copyright)}</copyright>\n` : ''}${song.ccli ? `      <ccliNo>${escapeXml(song.ccli)}</ccliNo>\n` : ''}${song.key ? `      <key>${escapeXml(song.key)}</key>\n` : ''}${verseOrder ? `      <verseOrder>${verseOrder}</verseOrder>\n` : ''}${songbooks}${themes}  </properties>
  <lyrics>
${verses}
  </lyrics>
</song>
`;
}

export function safeFileName(name: string): string {
  return name.replace(/[<>:"/\\|?*\u0000-\u001f]+/g, '_').replace(/\s+/g, ' ').trim().slice(0, 100) || 'song';
}
