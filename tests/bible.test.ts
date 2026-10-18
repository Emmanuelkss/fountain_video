import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseReference, formatReference } from '../src/shared/bibleRef';
import { findBook } from '../src/shared/bibleBooks';
import { parseBibleDelimited, parseBibleJson, parseOsis, parseZefania } from '../src/main/importers/bibleFormats';
import { groupVerses } from '../src/shared/slides';

function ref(text: string) {
  const r = parseReference(text);
  assert.ok(r.ok, `${text}: ${'error' in r ? r.error : ''}`);
  return r.ref;
}

test('parses common English and French references', () => {
  assert.deepEqual(ref('John 3:16'), { book: 43, chapter: 3, verseStart: 16, verseEnd: 16 });
  assert.deepEqual(ref('Jn 3:16-18'), { book: 43, chapter: 3, verseStart: 16, verseEnd: 18 });
  assert.deepEqual(ref('Jean 3.16'), { book: 43, chapter: 3, verseStart: 16, verseEnd: 16 });
  assert.deepEqual(ref('1 Co 13'), { book: 46, chapter: 13, verseStart: null, verseEnd: null });
  assert.deepEqual(ref('Psalm 23'), { book: 19, chapter: 23, verseStart: null, verseEnd: null });
  assert.deepEqual(ref('Ps 23:1-6'), { book: 19, chapter: 23, verseStart: 1, verseEnd: 6 });
  assert.deepEqual(ref('Romans 8:28-9:2'), { book: 45, chapter: 8, verseStart: 28, verseEnd: 2, chapterEnd: 9 });
  assert.deepEqual(ref('ii tim 3 16'), { book: 55, chapter: 3, verseStart: 16, verseEnd: 16 });
  assert.equal(ref('Ésaïe 53:5').book, 23);
  assert.equal(ref('Apocalypse 21:4').book, 66);
  assert.equal(ref('1 Jean 4:8').book, 62);
  assert.equal(ref('Philemon 1').book, 57);
});

test('rejects bad references with helpful messages', () => {
  const unknown = parseReference('Hezekiah 3:1');
  assert.equal(unknown.ok, false);
  const tooFar = parseReference('Jude 4');
  assert.ok(!tooFar.ok && /1 chapter/.test(tooFar.error));
  const backwards = parseReference('John 3:18-16');
  assert.equal(backwards.ok, false);
});

test('formats references', () => {
  assert.equal(formatReference(ref('jn 3:16-18'), 'John'), 'John 3:16-18');
  assert.equal(formatReference(ref('ps 23'), 'Psalms'), 'Psalms 23');
});

test('book lookup accepts translation-specific names', () => {
  assert.equal(findBook('Sprüche', [{ number: 20, name: 'Sprüche' }]), 20);
});

test('Zefania XML import', () => {
  const xml = `<?xml version="1.0"?><XMLBIBLE biblename="Test Bible"><BIBLEBOOK bnumber="43" bname="Jean"><CHAPTER cnumber="3">
    <VERS vnumber="16">Car Dieu a tant aimé <NOTE>note</NOTE>le monde</VERS><VERS vnumber="17">Dieu</VERS></CHAPTER></BIBLEBOOK></XMLBIBLE>`;
  const bible = parseZefania(xml);
  assert.equal(bible.title, 'Test Bible');
  assert.deepEqual(bible.books, [{ number: 43, name: 'Jean' }]);
  assert.equal(bible.verses.length, 2);
  assert.equal(bible.verses[0]!.text, 'Car Dieu a tant aimé le monde');
});

test('OSIS import, container and milestone styles', () => {
  const container = `<osis><osisText osisIDWork="WEB"><div type="book" osisID="John"><chapter osisID="John.3">
    <verse osisID="John.3.16">For God so loved<note>n</note> the world</verse><verse osisID="John.3.17">For God sent</verse></chapter></div></osisText></osis>`;
  const a = parseOsis(container);
  assert.equal(a.abbreviation, 'WEB');
  assert.deepEqual(a.verses.map((v) => [v.book, v.chapter, v.verse, v.text]), [
    [43, 3, 16, 'For God so loved the world'],
    [43, 3, 17, 'For God sent'],
  ]);
  const milestone = `<osis><osisText><chapter osisID="Ps.23"><verse sID="Ps.23.1" osisID="Ps.23.1"/>The LORD is my shepherd<verse eID="Ps.23.1"/><verse sID="Ps.23.2" osisID="Ps.23.2"/>He maketh me<verse eID="Ps.23.2"/></chapter></osisText></osis>`;
  const b = parseOsis(milestone);
  assert.deepEqual(b.verses.map((v) => [v.book, v.verse, v.text]), [
    [19, 1, 'The LORD is my shepherd'],
    [19, 2, 'He maketh me'],
  ]);
});

test('JSON imports (flat and nested)', () => {
  const flat = parseBibleJson(JSON.stringify([{ book: 'John', chapter: 3, verse: 16, text: 'x' }]));
  assert.deepEqual(flat.verses, [{ book: 43, chapter: 3, verse: 16, text: 'x' }]);
  const nested = parseBibleJson(JSON.stringify([{ abbrev: 'gn', name: 'Genesis', chapters: [['In the beginning', 'And the earth']] }]));
  assert.deepEqual(nested.verses.map((v) => [v.book, v.chapter, v.verse]), [
    [1, 1, 1],
    [1, 1, 2],
  ]);
});

test('CSV/TSV import with header and quotes', () => {
  const csv = 'book,chapter,verse,text\n43,3,16,"For God, so loved"\nJohn,3,17,For God sent';
  const bible = parseBibleDelimited(csv);
  assert.deepEqual(bible.verses.map((v) => [v.book, v.verse, v.text]), [
    [43, 16, 'For God, so loved'],
    [43, 17, 'For God sent'],
  ]);
  const tsv = parseBibleDelimited('Gen\t1\t1\tIn the beginning');
  assert.equal(tsv.verses[0]!.book, 1);
});

test('verse grouping', () => {
  const verses = [1, 2, 3, 4, 5].map((v) => ({ book: 1, chapter: 1, verse: v, text: 'x'.repeat(100) }));
  assert.equal(groupVerses(verses, 2).length, 3);
  assert.equal(groupVerses(verses, 0, 250).length, 3);
});
