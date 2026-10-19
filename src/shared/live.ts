/**
 * Live presentation state machine. The main process owns one LiveState and is
 * the single source of truth; the operator UI only sends LiveCommands and the
 * projector only renders what it receives. Every change increments `seq`, so a
 * window that receives updates out of order can always ignore stale ones.
 */
import type { ServiceItemType, Slide } from './types';

export interface DeckItem {
  itemId: string;
  type: ServiceItemType;
  title: string;
  slides: Slide[];
  error: string | null;
}

export interface Deck {
  serviceId: string | null;
  serviceName: string;
  items: DeckItem[];
}

export interface LiveState {
  seq: number;
  serviceId: string | null;
  /** Item on screen (index in deck.items) or -1. */
  itemIndex: number;
  itemId: string | null;
  slideIndex: number;
  /** Snapshot of the slide on screen (kept even if the service is edited). */
  slide: Slide | null;
  nextSlide: Slide | null;
  black: boolean;
  clear: boolean;
  media: { playing: boolean; token: number };
}

export type LiveCommand =
  | { type: 'go'; itemId: string; slideIndex: number }
  | { type: 'next' }
  | { type: 'prev' }
  | { type: 'nextSection' }
  | { type: 'prevSection' }
  | { type: 'nextItem' }
  | { type: 'prevItem' }
  | { type: 'jumpLabel'; label: string }
  | { type: 'black'; value?: boolean }
  | { type: 'clear'; value?: boolean }
  | { type: 'mediaToggle' }
  | { type: 'mediaRestart' }
  | { type: 'stop' };

export function initialLiveState(): LiveState {
  return {
    seq: 0,
    serviceId: null,
    itemIndex: -1,
    itemId: null,
    slideIndex: 0,
    slide: null,
    nextSlide: null,
    black: false,
    clear: false,
    media: { playing: false, token: 0 },
  };
}

function presentable(item: DeckItem | undefined): boolean {
  return Boolean(item && item.type !== 'header' && item.slides.length > 0);
}

function nextPresentable(deck: Deck, from: number, step: 1 | -1): number {
  for (let i = from + step; i >= 0 && i < deck.items.length; i += step) {
    if (presentable(deck.items[i])) return i;
  }
  return -1;
}

/** Slide that would follow the current one (shown in the "Next" preview). */
export function peekNext(deck: Deck, itemIndex: number, slideIndex: number): Slide | null {
  const item = deck.items[itemIndex];
  if (item && slideIndex + 1 < item.slides.length) return item.slides[slideIndex + 1] ?? null;
  const nextIndex = nextPresentable(deck, itemIndex, 1);
  return nextIndex >= 0 ? (deck.items[nextIndex]!.slides[0] ?? null) : null;
}

function show(state: LiveState, deck: Deck, itemIndex: number, slideIndex: number): LiveState {
  const item = deck.items[itemIndex];
  if (!item || !presentable(item)) return state;
  const index = Math.max(0, Math.min(slideIndex, item.slides.length - 1));
  const slide = item.slides[index]!;
  const changedSlide = state.itemId !== item.itemId || state.slideIndex !== index || state.slide !== slide;
  const isVideo = slide.kind === 'video' && !slide.missing;
  const enteringVideo = isVideo && (state.itemId !== item.itemId || state.slide?.kind !== 'video');
  return {
    ...state,
    serviceId: deck.serviceId,
    itemIndex,
    itemId: item.itemId,
    slideIndex: index,
    slide,
    nextSlide: peekNext(deck, itemIndex, index),
    // Choosing a slide while the screen is cleared brings the text back; black stays until toggled.
    clear: changedSlide ? false : state.clear,
    media: enteringVideo
      ? { playing: true, token: state.media.token + 1 }
      : isVideo
        ? state.media
        : { playing: false, token: state.media.token },
  };
}

function currentItem(state: LiveState, deck: Deck): DeckItem | undefined {
  return state.itemIndex >= 0 ? deck.items[state.itemIndex] : undefined;
}

export interface LiveOptions {
  /** When true, next/prev continue into the neighbouring service item. */
  advanceAcrossItems?: boolean;
}

export function applyLiveCommand(state: LiveState, deck: Deck, command: LiveCommand, options: LiveOptions = {}): LiveState {
  const next = reduce(state, deck, command, options);
  return next === state ? state : { ...next, seq: state.seq + 1 };
}

function reduce(state: LiveState, deck: Deck, command: LiveCommand, options: LiveOptions): LiveState {
  const item = currentItem(state, deck);
  switch (command.type) {
    case 'go': {
      const index = deck.items.findIndex((i) => i.itemId === command.itemId);
      if (index < 0) return state;
      return show(state, deck, index, command.slideIndex);
    }
    case 'next': {
      if (!item) {
        const first = nextPresentable(deck, -1, 1);
        return first >= 0 ? show(state, deck, first, 0) : state;
      }
      if (state.slideIndex + 1 < item.slides.length) return show(state, deck, state.itemIndex, state.slideIndex + 1);
      if (options.advanceAcrossItems) {
        const target = nextPresentable(deck, state.itemIndex, 1);
        if (target >= 0) return show(state, deck, target, 0);
      }
      return state; // End of item: by default the operator moves on deliberately (next item).
    }
    case 'prev': {
      if (!item) return state;
      if (state.slideIndex > 0) return show(state, deck, state.itemIndex, state.slideIndex - 1);
      if (options.advanceAcrossItems) {
        const target = nextPresentable(deck, state.itemIndex, -1);
        if (target >= 0) return show(state, deck, target, deck.items[target]!.slides.length - 1);
      }
      return state;
    }
    case 'nextSection': {
      if (!item) return state;
      const group = item.slides[state.slideIndex]?.group ?? 0;
      const target = item.slides.findIndex((s, i) => i > state.slideIndex && s.group !== group);
      return target >= 0 ? show(state, deck, state.itemIndex, target) : state;
    }
    case 'prevSection': {
      if (!item) return state;
      const group = item.slides[state.slideIndex]?.group ?? 0;
      const startOfCurrent = item.slides.findIndex((s) => s.group === group);
      if (startOfCurrent < state.slideIndex) return show(state, deck, state.itemIndex, startOfCurrent);
      // Already at the start of the section: go to the start of the previous one.
      for (let i = state.slideIndex - 1; i >= 0; i -= 1) {
        const prevGroup = item.slides[i]!.group;
        if (prevGroup !== group) {
          const start = item.slides.findIndex((s) => s.group === prevGroup);
          return show(state, deck, state.itemIndex, start);
        }
      }
      return state;
    }
    case 'nextItem': {
      const target = nextPresentable(deck, state.itemIndex, 1);
      return target >= 0 ? show(state, deck, target, 0) : state;
    }
    case 'prevItem': {
      const from = state.itemIndex >= 0 ? state.itemIndex : deck.items.length;
      const target = nextPresentable(deck, from, -1);
      return target >= 0 ? show(state, deck, target, 0) : state;
    }
    case 'jumpLabel': {
      if (!item) return state;
      const wanted = command.label.toUpperCase();
      const matches = (i: number) => item.slides[i]?.label.toUpperCase() === wanted;
      const currentGroup = item.slides[state.slideIndex]?.group;
      // Next occurrence after the current section, wrapping around (repeated choruses).
      for (let step = 1; step <= item.slides.length; step += 1) {
        const i = (state.slideIndex + step) % item.slides.length;
        if (matches(i) && (item.slides[i]!.group !== currentGroup || !matches(state.slideIndex))) {
          const start = item.slides.findIndex((s) => s.group === item.slides[i]!.group);
          return show(state, deck, state.itemIndex, start);
        }
      }
      return state;
    }
    case 'black':
      return { ...state, black: command.value ?? !state.black };
    case 'clear':
      return { ...state, clear: command.value ?? !state.clear };
    case 'mediaToggle':
      if (state.slide?.kind !== 'video') return state;
      return { ...state, media: { ...state.media, playing: !state.media.playing } };
    case 'mediaRestart':
      if (state.slide?.kind !== 'video') return state;
      return { ...state, media: { playing: true, token: state.media.token + 1 } };
    case 'stop':
      return { ...state, itemIndex: -1, itemId: null, slideIndex: 0, slide: null, nextSlide: null, clear: false, media: { playing: false, token: state.media.token } };
  }
}

/**
 * Re-attaches the live position after the deck was rebuilt (service edited,
 * song changed...). The slide on screen only changes if its content changed.
 */
export function rebaseLiveState(state: LiveState, deck: Deck): LiveState {
  if (!state.itemId) return { ...state, nextSlide: null };
  const index = deck.items.findIndex((i) => i.itemId === state.itemId);
  if (index < 0 || !presentable(deck.items[index])) {
    // Item removed: keep what is on screen, but navigation restarts from the top.
    return { ...state, seq: state.seq + 1, itemIndex: -1, nextSlide: null };
  }
  const item = deck.items[index]!;
  const slideIndex = Math.min(state.slideIndex, item.slides.length - 1);
  const slide = item.slides[slideIndex]!;
  return {
    ...state,
    seq: state.seq + 1,
    serviceId: deck.serviceId,
    itemIndex: index,
    slideIndex,
    slide,
    nextSlide: peekNext(deck, index, slideIndex),
  };
}
