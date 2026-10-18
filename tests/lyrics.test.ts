import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyHeader, parseLyrics, resolveArrangement, serializeLyrics, splitIntoSlides, validateOrder, mergeSectionIds } from '../src/shared/lyrics';

test('parses bracket headers with types and labels', () => {
  const sections = parseLyrics('[Verse 1]\nLine a\nLine b\n\n[Chorus]\nSing\n\n[Verse 2]\nLine c\n[Bridge]\nBridge line');
  assert.deepEqual(
    sections.map((s) => [s.label, s.type, s.name]),
    [
      ['V1', 'verse', 'Verse 1'],
      ['C', 'chorus', 'Chorus'],
      ['V2', 'verse', 'Verse 2'],
      ['B', 'bridge', 'Bridge'],
    ],
  );
  assert.equal(sections[0]!.text, 'Line a\nLine b');
});

test('understands French headers and plain-line headers', () => {
  const sections = parseLyrics('Couplet 1\nA\n\nRefrain\nB\n\nPont:\nC\n\nCouplet 2\nD');
  assert.deepEqual(sections.map((s) => s.label), ['V1', 'C', 'B', 'V2']);
});

test('text without headers becomes one verse per paragraph', () => {
  const sections = parseLyrics('one\ntwo\n\nthree\nfour\n\n\nfive');
  assert.equal(sections.length, 3);
  assert.deepEqual(sections.map((s) => s.label), ['V1', 'V2', 'V3']);
});

test('blank lines inside a section are preserved as slide breaks', () => {
  const [s] = parseLyrics('[Verse 1]\na\nb\n\nc\nd');
  assert.deepEqual(splitIntoSlides(s!.text, 0), ['a\nb', 'c\nd']);
});

test('duplicate headers get unique labels', () => {
  const sections = parseLyrics('[Chorus]\na\n[Chorus]\nb');
  assert.deepEqual(sections.map((s) => s.label), ['C', 'C2']);
});

test('long blocks are split into balanced slides', () => {
  const text = ['1', '2', '3', '4', '5', '6'].join('\n');
  assert.deepEqual(splitIntoSlides(text, 4), ['1\n2\n3', '4\n5\n6']);
  assert.deepEqual(splitIntoSlides(text, 0), [text]);
});

test('arrangements resolve labels case-insensitively and report unknown ones', () => {
  const sections = parseLyrics('[V1]\na\n[C]\nb\n[V2]\nc');
  const order = ['v1', 'C', 'V2', 'c'];
  assert.deepEqual(validateOrder(order, sections), []);
  assert.deepEqual(validateOrder(['V9'], sections), ['V9']);
  const resolved = resolveArrangement(sections, { id: 'a', name: 'x', order });
  assert.deepEqual(resolved.map((s) => s.label), ['V1', 'C', 'V2', 'C']);
});

test('serialize/parse round-trip keeps section order and text', () => {
  const original = parseLyrics('[Verse 1]\na\nb\n\nc\n\n[Chorus]\nd\n\n[Bridge]\ne');
  const again = parseLyrics(serializeLyrics(original));
  assert.deepEqual(again.map((s) => [s.label, s.text]), original.map((s) => [s.label, s.text]));
});

test('re-parsing keeps ids of unchanged labels', () => {
  const first = parseLyrics('[Verse 1]\na\n[Chorus]\nb');
  const second = mergeSectionIds(first, parseLyrics('[Verse 1]\na changed\n[Chorus]\nb\n[Bridge]\nc'));
  assert.equal(second[0]!.id, first[0]!.id);
  assert.equal(second[1]!.id, first[1]!.id);
});

test('classifies short labels', () => {
  assert.equal(classifyHeader('C2').type, 'chorus');
  assert.equal(classifyHeader('P').type, 'pre-chorus');
  assert.equal(classifyHeader('Pré-refrain').type, 'pre-chorus');
  assert.equal(classifyHeader('Something').type, 'other');
});
