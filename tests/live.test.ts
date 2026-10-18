import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyLiveCommand, initialLiveState, rebaseLiveState, type Deck } from '../src/shared/live';
import { fallbackTheme } from '../src/shared/themes';
import type { Slide } from '../src/shared/types';
import { actionForCombo, comboFromEvent, DEFAULT_SHORTCUTS, findConflicts, sectionLabelForKey } from '../src/shared/shortcuts';

function slide(label: string, group: number, kind: Slide['kind'] = 'text'): Slide {
  return { kind, label, group, title: '', text: label, footer: '', mediaPath: null, missing: false, loop: false, muted: false, theme: fallbackTheme() };
}

const deck: Deck = {
  serviceId: 's',
  serviceName: 'Sunday',
  items: [
    { itemId: 'h', type: 'header', title: 'Worship', slides: [], error: null },
    { itemId: 'song', type: 'song', title: 'Song', slides: [slide('V1', 0), slide('V1', 0), slide('C', 1), slide('V2', 2), slide('C', 3)], error: null },
    { itemId: 'empty', type: 'song', title: 'Missing', slides: [], error: 'deleted' },
    { itemId: 'video', type: 'video', title: 'Clip', slides: [slide('Video', 0, 'video')], error: null },
  ],
};

test('next/prev within an item, stopping at the edges', () => {
  let s = applyLiveCommand(initialLiveState(), deck, { type: 'next' });
  assert.equal(s.itemId, 'song');
  assert.equal(s.slideIndex, 0);
  s = applyLiveCommand(s, deck, { type: 'next' });
  assert.equal(s.slideIndex, 1);
  assert.equal(s.nextSlide?.label, 'C');
  s = applyLiveCommand(s, deck, { type: 'go', itemId: 'song', slideIndex: 4 });
  const end = applyLiveCommand(s, deck, { type: 'next' });
  assert.equal(end, s, 'no change at the end of an item');
  const across = applyLiveCommand(s, deck, { type: 'next' }, { advanceAcrossItems: true });
  assert.equal(across.itemId, 'video', 'skips headers and empty items');
});

test('sections and items', () => {
  let s = applyLiveCommand(initialLiveState(), deck, { type: 'go', itemId: 'song', slideIndex: 1 });
  s = applyLiveCommand(s, deck, { type: 'nextSection' });
  assert.equal(s.slideIndex, 2);
  s = applyLiveCommand(s, deck, { type: 'prevSection' });
  assert.equal(s.slideIndex, 0);
  s = applyLiveCommand(s, deck, { type: 'nextItem' });
  assert.equal(s.itemId, 'video');
  assert.equal(s.media.playing, true, 'video starts when shown');
  s = applyLiveCommand(s, deck, { type: 'prevItem' });
  assert.equal(s.itemId, 'song');
  assert.equal(s.media.playing, false);
});

test('section jumps find the next chorus after the current position', () => {
  let s = applyLiveCommand(initialLiveState(), deck, { type: 'go', itemId: 'song', slideIndex: 0 });
  s = applyLiveCommand(s, deck, { type: 'jumpLabel', label: 'c' });
  assert.equal(s.slideIndex, 2);
  s = applyLiveCommand(s, deck, { type: 'jumpLabel', label: 'C' });
  assert.equal(s.slideIndex, 4, 'second chorus');
  s = applyLiveCommand(s, deck, { type: 'jumpLabel', label: 'V2' });
  assert.equal(s.slideIndex, 3);
});

test('black and clear toggles; choosing a slide un-clears but keeps black', () => {
  let s = applyLiveCommand(initialLiveState(), deck, { type: 'go', itemId: 'song', slideIndex: 0 });
  s = applyLiveCommand(s, deck, { type: 'black' });
  s = applyLiveCommand(s, deck, { type: 'clear' });
  assert.ok(s.black && s.clear);
  s = applyLiveCommand(s, deck, { type: 'next' });
  assert.equal(s.black, true);
  assert.equal(s.clear, false);
});

test('every change increases seq (rapid navigation cannot be applied out of order)', () => {
  let s = initialLiveState();
  const seqs: number[] = [];
  for (let i = 0; i < 200; i += 1) {
    s = applyLiveCommand(s, deck, { type: i % 3 === 0 ? 'prev' : 'next' });
    seqs.push(s.seq);
  }
  for (let i = 1; i < seqs.length; i += 1) assert.ok(seqs[i]! >= seqs[i - 1]!);
});

test('rebase keeps the live slide when the service is edited', () => {
  let s = applyLiveCommand(initialLiveState(), deck, { type: 'go', itemId: 'song', slideIndex: 3 });
  const edited: Deck = { ...deck, items: [deck.items[1]!, deck.items[3]!] };
  const rebased = rebaseLiveState(s, edited);
  assert.equal(rebased.itemIndex, 0);
  assert.equal(rebased.slideIndex, 3);
  const removed = rebaseLiveState(s, { ...deck, items: [deck.items[3]!] });
  assert.equal(removed.itemIndex, -1);
  assert.ok(removed.slide, 'what is on screen stays on screen');
  s = removed;
});

test('shortcut combos', () => {
  const ev = (key: string, mods: Partial<{ ctrlKey: boolean; shiftKey: boolean; altKey: boolean; metaKey: boolean }> = {}) => ({
    key,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    metaKey: false,
    ...mods,
  });
  assert.equal(comboFromEvent(ev(' ')), 'Space');
  assert.equal(comboFromEvent(ev('ArrowDown', { ctrlKey: true })), 'Ctrl+ArrowDown');
  assert.equal(comboFromEvent(ev('Escape', { shiftKey: true })), 'Shift+Escape');
  assert.equal(comboFromEvent(ev('Control', { ctrlKey: true })), null);
  assert.equal(actionForCombo('Space', DEFAULT_SHORTCUTS), 'nextSlide');
  assert.equal(actionForCombo('ctrl+f', DEFAULT_SHORTCUTS), 'searchSong');
  assert.equal(actionForCombo('.', DEFAULT_SHORTCUTS), 'black');
  assert.deepEqual(findConflicts(DEFAULT_SHORTCUTS), []);
  assert.deepEqual(findConflicts({ ...DEFAULT_SHORTCUTS, black: ['Space'] }).map((c) => c.combo), ['Space']);
  assert.equal(sectionLabelForKey(ev('2')), 'V2');
  assert.equal(sectionLabelForKey(ev('c')), 'C');
  assert.equal(sectionLabelForKey(ev('c', { ctrlKey: true })), null);
});
