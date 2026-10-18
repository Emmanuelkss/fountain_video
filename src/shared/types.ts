/**
 * Core domain models shared by the main process, the operator UI and the
 * audience (projector) window. These are plain JSON-serialisable objects so
 * they can cross the IPC boundary unchanged.
 */

export type Id = string;

// ---------------------------------------------------------------- Songs

export type SectionType =
  | 'verse'
  | 'chorus'
  | 'pre-chorus'
  | 'bridge'
  | 'tag'
  | 'intro'
  | 'outro'
  | 'other';

export interface SongSection {
  id: Id;
  /** Short label used in arrangements and as a keyboard shortcut, e.g. "V1", "C", "B". */
  label: string;
  /** Human readable name as typed by the user, e.g. "Verse 1", "Chorus". */
  name: string;
  type: SectionType;
  /** Lyrics of the section. A blank line inside a section forces a new slide. */
  text: string;
}

export interface SongArrangement {
  id: Id;
  name: string;
  /** Ordered list of section labels, e.g. ["V1","C","V2","C","B","C"]. */
  order: string[];
}

export interface Song {
  id: Id;
  title: string;
  author: string;
  copyright: string;
  ccli: string;
  key: string;
  notes: string;
  categories: string[];
  sections: SongSection[];
  arrangements: SongArrangement[];
  /** Arrangement used when none is chosen in a service item. Empty = section order. */
  defaultArrangementId: Id | null;
  themeId: Id | null;
  createdAt: string;
  updatedAt: string;
}

export interface SongSummary {
  id: Id;
  title: string;
  author: string;
  categories: string[];
  /** First lyric line, shown in search results. */
  firstLine: string;
  updatedAt: string;
}

// ---------------------------------------------------------------- Bible

export interface BibleTranslation {
  id: Id;
  name: string;
  abbreviation: string;
  language: string;
  /** Free text: "Public domain", or the permission the church holds. */
  license: string;
  verseCount: number;
  createdAt: string;
}

export interface BibleBook {
  /** Canonical book number 1..66 (Protestant canon) — deuterocanon uses 67+. */
  number: number;
  name: string;
  chapters: number;
}

export interface BibleVerse {
  book: number;
  chapter: number;
  verse: number;
  text: string;
}

export interface BibleReference {
  book: number;
  chapter: number;
  verseStart: number | null;
  /** Inclusive. Null with verseStart null = whole chapter. */
  verseEnd: number | null;
  /** Optional end chapter for cross-chapter ranges (e.g. John 3:16-4:2). */
  chapterEnd?: number;
}

export interface BibleFavorite {
  id: Id;
  translationId: Id;
  reference: string;
  label: string;
  createdAt: string;
}

// ---------------------------------------------------------------- Themes

export type HAlign = 'left' | 'center' | 'right';
export type VAlign = 'top' | 'middle' | 'bottom';

export interface ThemeBackground {
  type: 'color' | 'gradient' | 'image' | 'video';
  color: string;
  color2: string;
  /** Gradient angle in degrees. */
  angle: number;
  /** Media library path for image/video backgrounds. */
  mediaPath: string | null;
  /** 0..1 darkening overlay to keep text readable over pictures. */
  dim: number;
}

export interface Theme {
  id: Id;
  name: string;
  builtin: boolean;
  fontFamily: string;
  /** Maximum font size in px relative to a 1080px-tall screen; text shrinks to fit. */
  fontSize: number;
  fontWeight: number;
  italic: boolean;
  uppercase: boolean;
  color: string;
  align: HAlign;
  vAlign: VAlign;
  lineHeight: number;
  /** Margins in percent of the screen size. */
  marginX: number;
  marginTop: number;
  marginBottom: number;
  shadow: boolean;
  shadowColor: string;
  shadowBlur: number;
  outline: boolean;
  outlineColor: string;
  outlineWidth: number;
  background: ThemeBackground;
  /** Footer (song title / Bible reference). */
  showFooter: boolean;
  footerSize: number;
  footerColor: string;
  /** Title style for announcement slides. */
  titleSize: number;
  titleColor: string;
  updatedAt: string;
}

// ---------------------------------------------------------------- Media

export type MediaKind = 'image' | 'video';

export interface MediaItem {
  id: Id;
  name: string;
  kind: MediaKind;
  /** Absolute path of the file managed by the media library. */
  path: string;
  /** Path the file was imported from (informational). */
  originalPath: string;
  size: number;
  createdAt: string;
  /** Filled at read time: false when the file disappeared from disk. */
  exists?: boolean;
}

// ---------------------------------------------------------------- Services

export type ServiceItemType =
  | 'song'
  | 'bible'
  | 'announcement'
  | 'image'
  | 'video'
  | 'blank'
  | 'header';

export interface AnnouncementSlide {
  title: string;
  body: string;
  imagePath: string | null;
}

export interface ServiceItemBase {
  id: Id;
  type: ServiceItemType;
  /** Display title in the service order. */
  title: string;
  /** Optional theme override for this item. */
  themeId: Id | null;
  notes: string;
}

export interface SongItem extends ServiceItemBase {
  type: 'song';
  songId: Id;
  arrangementId: Id | null;
}

export interface BibleItem extends ServiceItemBase {
  type: 'bible';
  translationId: Id;
  reference: string;
  versesPerSlide: number;
  showVerseNumbers: boolean;
}

export interface AnnouncementItem extends ServiceItemBase {
  type: 'announcement';
  slides: AnnouncementSlide[];
}

export interface ImageItem extends ServiceItemBase {
  type: 'image';
  path: string;
}

export interface VideoItem extends ServiceItemBase {
  type: 'video';
  path: string;
  loop: boolean;
  muted: boolean;
}

export interface BlankItem extends ServiceItemBase {
  type: 'blank';
}

/** A group header: organises the order of service ("Worship", "Word"...). Never projected. */
export interface HeaderItem extends ServiceItemBase {
  type: 'header';
}

export type ServiceItem =
  | SongItem
  | BibleItem
  | AnnouncementItem
  | ImageItem
  | VideoItem
  | BlankItem
  | HeaderItem;

export interface Service {
  id: Id;
  name: string;
  /** ISO date (yyyy-mm-dd) of the meeting, may be empty for templates. */
  date: string;
  isTemplate: boolean;
  notes: string;
  items: ServiceItem[];
  createdAt: string;
  updatedAt: string;
}

export interface ServiceSummary {
  id: Id;
  name: string;
  date: string;
  isTemplate: boolean;
  itemCount: number;
  updatedAt: string;
}

// ---------------------------------------------------------------- Slides

export type SlideKind = 'text' | 'title' | 'image' | 'video' | 'blank';

/** A fully resolved slide ready to be drawn by SlideView. */
export interface Slide {
  kind: SlideKind;
  /** Section label shown on thumbnails ("V1", "C", "John 3:16"...). */
  label: string;
  /** Index of the section/group this slide belongs to (for next/prev section). */
  group: number;
  title: string;
  text: string;
  footer: string;
  /** Media path for image/video slides or announcement images. */
  mediaPath: string | null;
  /** True when the referenced media file is missing on disk. */
  missing: boolean;
  loop: boolean;
  muted: boolean;
  theme: Theme;
}

// ---------------------------------------------------------------- Settings

export type ShortcutAction =
  | 'nextSlide'
  | 'prevSlide'
  | 'nextSection'
  | 'prevSection'
  | 'nextItem'
  | 'prevItem'
  | 'black'
  | 'clear'
  | 'toggleOutput'
  | 'exitOutput'
  | 'mediaToggle'
  | 'searchSong'
  | 'goLive';

export type ShortcutMap = Record<ShortcutAction, string[]>;

export interface AppSettings {
  /** Display id chosen for the projector; null = automatic (first non-primary). */
  outputDisplayId: number | null;
  /** Force a resizable window instead of full screen (test mode). */
  windowedOutput: boolean;
  defaultThemeId: Id;
  bibleThemeId: Id;
  defaultTranslationId: Id | null;
  defaultVersesPerSlide: number;
  /** Maximum lines per slide when a song section has no manual slide break. 0 = no limit. */
  maxLinesPerSlide: number;
  operatorTheme: 'dark' | 'light';
  shortcuts: ShortcutMap;
  lastServiceId: Id | null;
  autoBackupKeep: number;
  /** Aspect ratio used for previews when no projector is connected. */
  previewAspect: '16:9' | '4:3' | '16:10';
  /** Continue into the next service item when pressing "next" on the last slide. */
  advanceAcrossItems: boolean;
}

// ---------------------------------------------------------------- Displays

export interface DisplayInfo {
  id: number;
  label: string;
  bounds: { x: number; y: number; width: number; height: number };
  primary: boolean;
  scaleFactor: number;
}

export interface OutputStatus {
  open: boolean;
  /** Display used, or null when running in windowed/test mode. */
  displayId: number | null;
  windowed: boolean;
  width: number;
  height: number;
  message: string;
}
