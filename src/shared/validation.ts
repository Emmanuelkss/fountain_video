/**
 * Input validation for everything the UI (or an import) sends to storage.
 * Functions return a cleaned copy or throw a UserError with a readable message.
 */
import type {
  AnnouncementSlide,
  Service,
  ServiceItem,
  Song,
  SongArrangement,
  SongSection,
  Theme,
} from './types';
import { UserError, newId, nowIso } from './util';
import { classifyHeader, validateOrder } from './lyrics';
import { normalizeTheme } from './themes';

const MAX_TITLE = 200;
const MAX_TEXT = 100_000;

function text(value: unknown, max: number, field: string): string {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') throw new UserError(`${field} must be text`);
  const clean = value.replace(/\r\n?/g, '\n');
  if (clean.length > max) throw new UserError(`${field} is too long (max ${max} characters)`);
  return clean;
}

function id(value: unknown): string {
  return typeof value === 'string' && value.trim() ? value : newId();
}

export function validateSong(input: Song): Song {
  if (!input || typeof input !== 'object') throw new UserError('Invalid song');
  const title = text(input.title, MAX_TITLE, 'Title').trim();
  if (!title) throw new UserError('A song needs a title');
  const sectionsIn = Array.isArray(input.sections) ? input.sections : [];
  const sections: SongSection[] = sectionsIn
    .map((s) => {
      const label = text(s.label, 12, 'Section label').trim();
      const name = text(s.name, 60, 'Section name').trim();
      return {
        id: id(s.id),
        label: label || classifyHeader(name || 'Verse').prefix,
        name: name || label,
        type: s.type ?? classifyHeader(name || label).type,
        text: text(s.text, MAX_TEXT, 'Lyrics').replace(/^\n+|\n+$/g, ''),
      };
    })
    .filter((s) => s.text.trim() !== '');
  if (sections.length === 0) throw new UserError('A song needs lyrics (at least one section)');
  const seen = new Set<string>();
  for (const s of sections) {
    const key = s.label.toUpperCase();
    if (seen.has(key)) throw new UserError(`Two sections share the label "${s.label}". Rename one of them.`);
    seen.add(key);
  }
  const arrangements: SongArrangement[] = (Array.isArray(input.arrangements) ? input.arrangements : []).map((a) => {
    const name = text(a.name, 60, 'Arrangement name').trim() || 'Arrangement';
    const order = (Array.isArray(a.order) ? a.order : []).map((t) => String(t).trim()).filter(Boolean);
    const unknown = validateOrder(order, sections);
    if (unknown.length > 0) {
      throw new UserError(`Arrangement "${name}" uses unknown section${unknown.length > 1 ? 's' : ''}: ${unknown.join(', ')}`);
    }
    return { id: id(a.id), name, order };
  });
  const categories = [
    ...new Set(
      (Array.isArray(input.categories) ? input.categories : [])
        .map((c) => text(c, 40, 'Category').trim())
        .filter(Boolean),
    ),
  ];
  const now = nowIso();
  return {
    id: id(input.id),
    title,
    author: text(input.author, MAX_TITLE, 'Author').trim(),
    copyright: text(input.copyright, MAX_TITLE, 'Copyright').trim(),
    ccli: text(input.ccli, 20, 'CCLI number').trim(),
    key: text(input.key, 12, 'Key').trim(),
    notes: text(input.notes, 5000, 'Notes'),
    categories,
    sections,
    arrangements,
    defaultArrangementId: arrangements.some((a) => a.id === input.defaultArrangementId) ? input.defaultArrangementId : null,
    themeId: typeof input.themeId === 'string' && input.themeId ? input.themeId : null,
    createdAt: typeof input.createdAt === 'string' && input.createdAt ? input.createdAt : now,
    updatedAt: now,
  };
}

function validateAnnouncementSlide(s: AnnouncementSlide): AnnouncementSlide {
  return {
    title: text(s?.title, 300, 'Announcement title'),
    body: text(s?.body, 5000, 'Announcement text'),
    imagePath: typeof s?.imagePath === 'string' && s.imagePath ? s.imagePath : null,
  };
}

export function validateServiceItem(raw: ServiceItem): ServiceItem {
  const common = {
    id: id(raw.id),
    title: text(raw.title, MAX_TITLE, 'Item title'),
    themeId: typeof raw.themeId === 'string' && raw.themeId ? raw.themeId : null,
    notes: text(raw.notes, 5000, 'Notes'),
  };
  switch (raw.type) {
    case 'song':
      if (!raw.songId) throw new UserError('Song item without a song');
      return { ...common, type: 'song', songId: raw.songId, arrangementId: raw.arrangementId ?? null };
    case 'bible':
      if (!raw.reference?.trim()) throw new UserError('Bible item without a reference');
      return {
        ...common,
        type: 'bible',
        translationId: String(raw.translationId ?? ''),
        reference: text(raw.reference, 200, 'Reference').trim(),
        versesPerSlide: Number.isInteger(raw.versesPerSlide) ? Math.min(10, Math.max(0, raw.versesPerSlide)) : 1,
        showVerseNumbers: raw.showVerseNumbers !== false,
      };
    case 'announcement': {
      const slides = (Array.isArray(raw.slides) ? raw.slides : []).map(validateAnnouncementSlide);
      return { ...common, type: 'announcement', slides: slides.length > 0 ? slides : [{ title: common.title, body: '', imagePath: null }] };
    }
    case 'image':
      if (!raw.path) throw new UserError('Image item without a file');
      return { ...common, type: 'image', path: raw.path };
    case 'video':
      if (!raw.path) throw new UserError('Video item without a file');
      return { ...common, type: 'video', path: raw.path, loop: Boolean(raw.loop), muted: Boolean(raw.muted) };
    case 'blank':
      return { ...common, type: 'blank' };
    case 'header':
      return { ...common, type: 'header' };
    default:
      throw new UserError(`Unknown service item type "${(raw as { type?: string }).type}"`);
  }
}

export function validateService(input: Service): Service {
  if (!input || typeof input !== 'object') throw new UserError('Invalid service');
  const name = text(input.name, MAX_TITLE, 'Service name').trim();
  if (!name) throw new UserError('A service needs a name');
  const date = typeof input.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input.date) ? input.date : '';
  const items = (Array.isArray(input.items) ? input.items : []).map(validateServiceItem);
  const ids = new Set<string>();
  for (const item of items) {
    if (ids.has(item.id)) item.id = newId();
    ids.add(item.id);
  }
  const now = nowIso();
  return {
    id: id(input.id),
    name,
    date,
    isTemplate: Boolean(input.isTemplate),
    notes: text(input.notes, 10_000, 'Notes'),
    items,
    createdAt: typeof input.createdAt === 'string' && input.createdAt ? input.createdAt : now,
    updatedAt: now,
  };
}

export function validateTheme(input: Theme): Theme {
  if (!input || typeof input !== 'object') throw new UserError('Invalid theme');
  const name = text(input.name, 80, 'Theme name').trim();
  if (!name) throw new UserError('A theme needs a name');
  return { ...normalizeTheme({ ...input, id: id(input.id), name }), builtin: false, updatedAt: nowIso() };
}
