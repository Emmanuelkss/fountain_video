/** Creates new service items with sensible defaults. */
import type {
  AnnouncementItem,
  AnnouncementSlide,
  BibleItem,
  BlankItem,
  HeaderItem,
  ImageItem,
  MediaItem,
  ServiceItem,
  SongItem,
  SongSummary,
  VideoItem,
} from '../../shared/types';
import { displayFileName, newId } from '../../shared/util';

const base = { themeId: null, notes: '' };

export function songItem(song: Pick<SongSummary, 'id' | 'title'>): SongItem {
  return { ...base, id: newId(), type: 'song', title: song.title, songId: song.id, arrangementId: null };
}

export function bibleItem(translationId: string, reference: string, versesPerSlide: number): BibleItem {
  return { ...base, id: newId(), type: 'bible', title: reference, translationId, reference, versesPerSlide, showVerseNumbers: true };
}

export function mediaItem(media: MediaItem): ImageItem | VideoItem {
  if (media.kind === 'image') return { ...base, id: newId(), type: 'image', title: media.name, path: media.path };
  return { ...base, id: newId(), type: 'video', title: media.name, path: media.path, loop: false, muted: false };
}

export function blankItem(): BlankItem {
  return { ...base, id: newId(), type: 'blank', title: 'Blank' };
}

export function headerItem(title = 'New section'): HeaderItem {
  return { ...base, id: newId(), type: 'header', title };
}

export interface AnnouncementPreset {
  key: string;
  label: string;
  description: string;
  slides: AnnouncementSlide[];
}

export const ANNOUNCEMENT_PRESETS: AnnouncementPreset[] = [
  {
    key: 'welcome',
    label: 'Welcome',
    description: 'Greeting shown before the service starts',
    slides: [{ title: 'Welcome', body: 'We are glad you are here.', imagePath: null }],
  },
  {
    key: 'schedule',
    label: 'Service schedule',
    description: 'Times and events, one per line',
    slides: [{ title: 'This Week', body: 'Wednesday 7:00 PM — Prayer meeting\nFriday 7:30 PM — Youth night\nSunday 10:00 AM — Worship service', imagePath: null }],
  },
  {
    key: 'title',
    label: 'Title slide',
    description: 'Sermon title, speaker or event name',
    slides: [{ title: 'Sermon title', body: 'Speaker name', imagePath: null }],
  },
  {
    key: 'announcement',
    label: 'Announcement',
    description: 'Free text with an optional picture',
    slides: [{ title: 'Announcement', body: 'Details…', imagePath: null }],
  },
  {
    key: 'closing',
    label: 'Closing',
    description: 'Blessing or goodbye at the end',
    slides: [{ title: 'Go in peace', body: 'Thank you for worshipping with us today.', imagePath: null }],
  },
];

export function announcementItem(preset: AnnouncementPreset): AnnouncementItem {
  return { ...base, id: newId(), type: 'announcement', title: preset.label, slides: structuredClone(preset.slides) };
}

export function itemSubtitle(item: ServiceItem): string {
  switch (item.type) {
    case 'bible':
      return item.reference;
    case 'announcement':
      return `${item.slides.length} slide${item.slides.length === 1 ? '' : 's'}`;
    case 'image':
    case 'video':
      return displayFileName(item.path);
    default:
      return '';
  }
}
