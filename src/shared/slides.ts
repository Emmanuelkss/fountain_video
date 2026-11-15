/**
 * Turns service items into fully resolved slides. Pure functions: everything
 * they need (songs, verses, themes, file existence) is passed in, so the same
 * logic is used by the live engine and covered by unit tests.
 */
import type {
  AnnouncementItem,
  BibleVerse,
  ServiceItem,
  Slide,
  Song,
  Theme,
} from './types';
import { resolveArrangement, splitIntoSlides } from './lyrics';
import { formatVerseSpan } from './bibleRef';

export interface SlideContext {
  getSong(id: string): Song | null;
  /** Verses for a Bible item, already resolved from its reference. */
  getPassage(item: Extract<ServiceItem, { type: 'bible' }>): { bookName: (book: number) => string; verses: BibleVerse[]; translation: string } | { error: string };
  theme(id: string | null | undefined, kind: 'song' | 'bible' | 'other'): Theme;
  mediaExists(path: string): boolean;
  maxLinesPerSlide: number;
}

function base(theme: Theme): Omit<Slide, 'kind' | 'label' | 'group'> {
  return { title: '', text: '', footer: '', mediaPath: null, missing: false, loop: false, muted: false, theme };
}

function songFooter(song: Song): string {
  const parts = [song.songbook && song.songbookNumber ? `${song.songbook} ${song.songbookNumber} — ${song.title}` : song.title];
  if (song.author) parts.push(song.author);
  if (song.copyright) parts.push(`© ${song.copyright.replace(/^©\s*/, '')}`);
  if (song.ccli) parts.push(`CCLI ${song.ccli}`);
  return parts.join(' · ');
}

export function songSlides(song: Song, arrangementId: string | null, theme: Theme, maxLines: number): Slide[] {
  const arrangement =
    song.arrangements.find((a) => a.id === arrangementId) ??
    song.arrangements.find((a) => a.id === song.defaultArrangementId) ??
    null;
  const sections = resolveArrangement(song.sections, arrangement);
  const footer = songFooter(song);
  const slides: Slide[] = [];
  sections.forEach((section, group) => {
    const texts = splitIntoSlides(section.text, maxLines);
    if (texts.length === 0) texts.push('');
    texts.forEach((text) => {
      slides.push({ ...base(theme), kind: 'text', label: section.label, group, text, footer });
    });
  });
  return slides;
}

/** Groups verses into slides: N verses per slide (0 = automatic by length). */
export function groupVerses(verses: BibleVerse[], versesPerSlide: number, maxChars = 320): BibleVerse[][] {
  const groups: BibleVerse[][] = [];
  if (versesPerSlide > 0) {
    for (let i = 0; i < verses.length; i += versesPerSlide) groups.push(verses.slice(i, i + versesPerSlide));
    return groups;
  }
  let current: BibleVerse[] = [];
  let length = 0;
  for (const verse of verses) {
    if (current.length > 0 && length + verse.text.length > maxChars) {
      groups.push(current);
      current = [];
      length = 0;
    }
    current.push(verse);
    length += verse.text.length;
  }
  if (current.length > 0) groups.push(current);
  return groups;
}

export function bibleSlides(
  verses: BibleVerse[],
  bookName: (book: number) => string,
  translation: string,
  versesPerSlide: number,
  showVerseNumbers: boolean,
  theme: Theme,
): Slide[] {
  const groups = groupVerses(verses, versesPerSlide);
  const multiChapter = new Set(verses.map((v) => v.chapter)).size > 1;
  return groups.map((group, index) => {
    const name = bookName(group[0]!.book);
    const span = formatVerseSpan(name, group);
    const text = group
      .map((v) => {
        if (!showVerseNumbers) return v.text;
        const number = multiChapter ? `${v.chapter}:${v.verse}` : String(v.verse);
        return `⁣${number}⁣ ${v.text}`;
      })
      .join(' ');
    const label = group.length === 1 ? `${group[0]!.chapter}:${group[0]!.verse}` : `${group[0]!.chapter}:${group[0]!.verse}-${group[group.length - 1]!.verse}`;
    return {
      ...base(theme),
      kind: 'text' as const,
      label,
      group: index,
      text,
      footer: translation ? `${span} (${translation})` : span,
    };
  });
}

export function announcementSlides(item: AnnouncementItem, theme: Theme, exists: (p: string) => boolean): Slide[] {
  return item.slides.map((s, group) => ({
    ...base(theme),
    kind: s.title && !s.body ? ('title' as const) : ('text' as const),
    label: s.title ? s.title.slice(0, 18) : `${group + 1}`,
    group,
    title: s.title,
    text: s.body,
    mediaPath: s.imagePath,
    missing: s.imagePath ? !exists(s.imagePath) : false,
  }));
}

export function buildItemSlides(item: ServiceItem, ctx: SlideContext): { slides: Slide[]; error: string | null } {
  switch (item.type) {
    case 'header':
      return { slides: [], error: null };
    case 'blank': {
      const theme = ctx.theme(item.themeId, 'other');
      return { slides: [{ ...base(theme), kind: 'blank', label: 'Blank', group: 0 }], error: null };
    }
    case 'song': {
      const song = ctx.getSong(item.songId);
      const theme = ctx.theme(item.themeId ?? song?.themeId, 'song');
      if (!song) {
        return {
          slides: [{ ...base(theme), kind: 'title', label: '!', group: 0, title: item.title, text: '' }],
          error: 'This song was deleted from the library.',
        };
      }
      return { slides: songSlides(song, item.arrangementId, theme, ctx.maxLinesPerSlide), error: null };
    }
    case 'bible': {
      const theme = ctx.theme(item.themeId, 'bible');
      const passage = ctx.getPassage(item);
      if ('error' in passage) {
        return {
          slides: [{ ...base(theme), kind: 'title', label: '!', group: 0, title: item.reference, text: '' }],
          error: passage.error,
        };
      }
      return {
        slides: bibleSlides(passage.verses, passage.bookName, passage.translation, item.versesPerSlide, item.showVerseNumbers, theme),
        error: null,
      };
    }
    case 'announcement': {
      const theme = ctx.theme(item.themeId, 'other');
      return { slides: announcementSlides(item, theme, ctx.mediaExists), error: null };
    }
    case 'image': {
      const theme = ctx.theme(item.themeId, 'other');
      const missing = !ctx.mediaExists(item.path);
      return {
        slides: [{ ...base(theme), kind: 'image', label: 'Image', group: 0, mediaPath: item.path, missing }],
        error: missing ? `Image not found: ${item.path}` : null,
      };
    }
    case 'video': {
      const theme = ctx.theme(item.themeId, 'other');
      const missing = !ctx.mediaExists(item.path);
      return {
        slides: [
          { ...base(theme), kind: 'video', label: 'Video', group: 0, mediaPath: item.path, missing, loop: item.loop, muted: item.muted },
        ],
        error: missing ? `Video not found: ${item.path}` : null,
      };
    }
  }
}

/** Splits the invisible verse-number markers inserted by bibleSlides. */
export function splitVerseMarkers(text: string): Array<{ verse: string | null; text: string }> {
  const parts: Array<{ verse: string | null; text: string }> = [];
  const regex = /⁣([^⁣]+)⁣/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > last) parts.push({ verse: null, text: text.slice(last, match.index) });
    parts.push({ verse: match[1]!, text: '' });
    last = regex.lastIndex;
  }
  if (last < text.length) parts.push({ verse: null, text: text.slice(last) });
  return parts;
}
