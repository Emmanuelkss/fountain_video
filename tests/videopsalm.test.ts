import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { cleanVerseText, exportVideoPsalm, looksLikeVideoPsalm, parseVideoPsalm, relaxedJsonToJson } from '../src/main/importers/videopsalm';
import { AppCore, type Platform } from '../src/main/core';
import type { OutputStatus } from '../src/shared/types';
import { decodeText } from '../src/shared/util';

process.env.FV_QUIET = '1';
const sample = path.join(__dirname, 'fixtures', 'videopsalm-sample.json');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fv-vp-'));
after(() => fs.rmSync(root, { recursive: true, force: true }));

test('relaxed VideoPsalm syntax becomes valid JSON', () => {
  const json = relaxedJsonToJson('{a:1,b:-2.5,c:"x\ny",d:true,e:[1,2,],f:\'it\\\'s\',g:null}');
  assert.deepEqual(JSON.parse(json), { a: 1, b: -2.5, c: 'x\ny', d: true, e: [1, 2], f: "it's", g: null });
});

test('chords and formatting tags are removed from verses', () => {
  assert.equal(cleanVerseText('[G]Grand [D/F#]est\r\nl’<b>Éternel</b>  '), 'Grand est\nl’Éternel');
});

test('parses a VideoPsalm songbook: name, numbers, metadata, choruses, order', () => {
  const content = decodeText(fs.readFileSync(sample));
  assert.ok(looksLikeVideoPsalm(content));
  const book = parseVideoPsalm(content, 'fallback');
  assert.equal(book.name, "J'aime l'Éternel");
  assert.equal(book.songs.length, 3);
  const [first, second, empty] = book.songs;
  assert.equal(first!.title, "Grand est l'Éternel");
  assert.equal(first!.songbook, "J'aime l'Éternel");
  assert.equal(first!.songbookNumber, '1');
  assert.equal(first!.author, 'Jean Dupont, Inconnu');
  assert.equal(first!.copyright, '© 2001 Exemple Tous droits réservés');
  assert.equal(first!.ccli, '123456');
  assert.deepEqual(first!.categories, ['Louange', 'Adoration']);
  assert.match(first!.notes, /Commencer doucement/);
  assert.match(first!.notes, /Grand est l'Éternel/);
  // Repeated verse = chorus; projection order kept as the default arrangement.
  assert.deepEqual(first!.sections.map((s) => [s.label, s.text.split('\n')[0]]), [
    ['V1', "Grand est l'Éternel"],
    ['C', 'Alléluia, alléluia'],
    ['V2', "Saint est l'Éternel"],
  ]);
  assert.deepEqual(first!.arrangements[0]!.order, ['V1', 'C', 'V2', 'C']);
  assert.equal(first!.defaultArrangementId, first!.arrangements[0]!.id);
  // "Refrain" first line marks the chorus and is removed; a verse without Text is skipped.
  assert.deepEqual(second!.sections.map((s) => [s.label, s.text]), [
    ['C', 'Jésus, tu es là'],
    ['V1', "Au milieu de nous\nNous t'adorons"],
    ['V2', 'Couplet sans texte gras'],
  ]);
  assert.equal(second!.arrangements.length, 0, 'no repeats = plain section order');
  assert.equal(empty!.sections.length, 0);
});

test('export to VideoPsalm and re-import keeps songs and order', () => {
  const book = parseVideoPsalm(decodeText(fs.readFileSync(sample)), 'x');
  const again = parseVideoPsalm(exportVideoPsalm(book.name, book.songs.slice(0, 2)), 'x');
  assert.equal(again.name, book.name);
  assert.deepEqual(again.songs.map((s) => [s.title, s.songbookNumber]), [
    ["Grand est l'Éternel", '1'],
    ['Jésus tu es là', '2'],
  ]);
  assert.deepEqual(again.songs[0]!.arrangements[0]!.order, ['V1', 'C', 'V2', 'C']);
});

function platform(): Platform {
  const status = (): OutputStatus => ({ open: false, displayId: null, windowed: true, width: 0, height: 0, message: '' });
  return {
    appVersion: '1.0.0',
    mediaBase: 'test://',
    listDisplays: () => [],
    outputStatus: status,
    openOutput: status,
    closeOutput: status,
    identifyDisplays: () => undefined,
    openFiles: async () => [],
    saveFile: async () => null,
    openPath: () => undefined,
  };
}

test('importing a songbook into FountainVideo: songbooks, number search, re-import updates, rename, delete', async (t) => {
  const core = new AppCore(path.join(root, 'data'), platform());
  core.start();
  t.after(() => core.shutdown());
  const vpc = path.join(root, 'JEM.vpc');
  fs.copyFileSync(sample, vpc);
  const report = await core.invoke('songs.importFiles', { paths: [vpc] });
  assert.equal(report.imported, 2, JSON.stringify(report));
  assert.equal(report.skipped, 1, 'the empty song is reported');
  assert.match(report.errors[0] ?? '', /Chant vide/);
  assert.deepEqual(await core.invoke('songs.songbooks', undefined), [{ name: "J'aime l'Éternel", count: 2 }]);

  const inBook = await core.invoke('songs.list', { songbook: "j'aime l'éternel" });
  assert.deepEqual(inBook.map((s) => s.songbookNumber), ['1', '2'], 'sorted by number');
  assert.equal((await core.invoke('songs.list', { query: '2' }))[0]?.title, 'Jésus tu es là', 'search by number');
  assert.equal((await core.invoke('songs.list', { query: "j'aime l'eternel 1" }))[0]?.title, "Grand est l'Éternel");

  // Re-import: updated, not duplicated; a theme chosen in FountainVideo is kept.
  const song = (await core.invoke('songs.get', { id: inBook[0]!.id }))!;
  await core.invoke('songs.save', { ...song, themeId: 'builtin-royal' });
  const again = await core.invoke('songs.importFiles', { paths: [vpc] });
  assert.equal(again.imported, 0);
  assert.equal(again.updated, 2);
  assert.equal((await core.invoke('songs.list', {})).filter((s) => s.songbook).length, 2);
  assert.equal((await core.invoke('songs.get', { id: song.id }))!.themeId, 'builtin-royal');

  // The projected footer names the songbook entry.
  const service = await core.invoke('services.save', {
    id: '', name: 'VP', date: '', isTemplate: false, notes: '', createdAt: '', updatedAt: '',
    items: [{ id: 'i1', type: 'song', title: song.title, themeId: null, notes: '', songId: song.id, arrangementId: null }],
  });
  const deck = await core.invoke('live.load', { serviceId: service.id });
  assert.match(deck.items[0]!.slides[0]!.footer, /^J'aime l'Éternel 1 — Grand est l'Éternel/);
  assert.equal(deck.items[0]!.slides.length, 4, 'V1 C V2 C');

  // Export as a VideoPsalm songbook.
  const out = path.join(root, 'export.json');
  const ids = inBook.map((s) => s.id);
  await core.invoke('songs.export', { ids, path: out, format: 'videopsalm', songbookName: 'JEM' });
  assert.equal(parseVideoPsalm(fs.readFileSync(out, 'utf8'), 'x').songs.length, 2);

  assert.equal((await core.invoke('songs.renameSongbook', { from: "J'aime l'Éternel", to: 'JEM' })).count, 2);
  assert.deepEqual(await core.invoke('songs.songbooks', undefined), [{ name: 'JEM', count: 2 }]);
  assert.equal((await core.invoke('songs.deleteSongbook', { name: 'jem' })).count, 2);
  assert.deepEqual(await core.invoke('songs.songbooks', undefined), []);
});

test('UTF-16 and Windows-1252 files are decoded', () => {
  const utf16 = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('{Songs:[]}', 'utf16le')]);
  assert.equal(decodeText(utf16), '{Songs:[]}');
  assert.equal(decodeText(Buffer.from([0x63, 0x6f, 0x75, 0x70, 0x6c, 0x65, 0x74, 0x20, 0xe9])), 'couplet é');
});

test('an existing v1 database is upgraded (backup first) and keeps its songs', async (t) => {
  const { Database } = await import('../src/main/db/database');
  const { MIGRATIONS } = await import('../src/main/db/migrations');
  const dir = path.join(root, 'v1');
  fs.mkdirSync(dir, { recursive: true });
  const db = new Database(path.join(dir, 'fountainvideo.db'));
  db.transaction(() => {
    MIGRATIONS[0]!.up(db);
    db.exec('PRAGMA user_version = 1');
  });
  db.run(
    "INSERT INTO songs (id, title, sections, search_title, created_at, updated_at) VALUES ('old', 'Old Song', ?, 'old song', 'x', 'x')",
    JSON.stringify([{ id: 's', label: 'V1', name: 'Verse 1', type: 'verse', text: 'old words' }]),
  );
  db.close();
  const core = new AppCore(dir, platform());
  core.start();
  t.after(() => core.shutdown());
  const old = await core.invoke('songs.get', { id: 'old' });
  assert.equal(old?.title, 'Old Song');
  assert.equal(old?.songbook, '');
  assert.ok((await core.invoke('backup.list', undefined)).some((b) => b.name.includes('before-migration-v2')));
});
