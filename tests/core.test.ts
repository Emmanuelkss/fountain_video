/**
 * Integration tests: the real AppCore on a real SQLite file in a temp folder,
 * covering the church-service scenarios from the specification.
 */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AppCore, type Platform } from '../src/main/core';
import type { OutputStatus, Service, Song } from '../src/shared/types';
import { parseLyrics } from '../src/shared/lyrics';
import { newId } from '../src/shared/util';

process.env.FV_QUIET = '1';
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fv-core-'));
after(() => fs.rmSync(root, { recursive: true, force: true }));

function platform(): Platform {
  let open = false;
  const status = (): OutputStatus => ({ open, displayId: null, windowed: true, width: 1280, height: 720, message: '' });
  return {
    appVersion: '1.0.0',
    mediaBase: 'test://',
    listDisplays: () => [],
    outputStatus: status,
    openOutput: () => ((open = true), status()),
    closeOutput: () => ((open = false), status()),
    identifyDisplays: () => undefined,
    openFiles: async () => [],
    saveFile: async () => null,
    openPath: () => undefined,
  };
}

function makeSong(title: string, lyrics: string): Song {
  return {
    id: '',
    title,
    author: 'Test',
    copyright: '',
    ccli: '',
    key: '',
    notes: '',
    categories: ['Worship'],
    sections: parseLyrics(lyrics),
    arrangements: [],
    defaultArrangementId: null,
    themeId: null,
    createdAt: '',
    updatedAt: '',
  };
}

const dataDir = path.join(root, 'data');

test('first launch seeds starter content and a template', async (t) => {
  const core = new AppCore(dataDir, platform());
  core.start();
  t.after(() => core.shutdown());
  const info = await core.invoke('app.info', undefined);
  assert.equal(info.firstRun, true);
  assert.ok((await core.invoke('songs.list', {})).length >= 5);
  const templates = await core.invoke('services.list', { templates: true });
  assert.equal(templates.length, 1);
  assert.equal((await core.invoke('bible.translations', undefined)).length, 2);
  assert.equal((await core.invoke('backup.list', undefined)).filter((b) => b.automatic).length, 1, 'daily backup');
});

let serviceId = '';
let songId = '';

test('songs: create, search (accent-insensitive), duplicate, validate', async (t) => {
  const core = new AppCore(dataDir, platform());
  core.start();
  t.after(() => core.shutdown());
  const info = await core.invoke('app.info', undefined);
  assert.equal(info.firstRun, false, 'seed runs only once');
  const saved = await core.invoke('songs.save', makeSong('Éternel, mon berger', '[Couplet 1]\nTu es mon roc\n\n[Refrain]\nAlléluia'));
  songId = saved.id;
  assert.deepEqual(saved.sections.map((s) => s.label), ['V1', 'C']);
  assert.equal((await core.invoke('songs.list', { query: 'eternel' }))[0]?.id, songId);
  assert.equal((await core.invoke('songs.list', { query: 'alleluia' }))[0]?.id, songId, 'searches lyrics');
  assert.ok((await core.invoke('songs.list', { category: 'worship' })).some((s) => s.id === songId));
  const copy = await core.invoke('songs.duplicate', { id: songId });
  assert.equal(copy.title, 'Éternel, mon berger (copy)');
  await assert.rejects(core.invoke('songs.save', makeSong('', 'x')), /title/);
  await assert.rejects(core.invoke('songs.save', { ...makeSong('Bad', '[V1]\na'), arrangements: [{ id: 'a', name: 'A', order: ['V1', 'X'] }] }), /unknown section/);
  await core.invoke('songs.delete', { id: copy.id });
  assert.equal(await core.invoke('songs.get', { id: copy.id }), null);
});

test('service with every item type builds slides; missing media is reported', async (t) => {
  const core = new AppCore(dataDir, platform());
  core.start();
  t.after(() => core.shutdown());
  const image = path.join(root, 'picture.png');
  fs.writeFileSync(image, Buffer.from('89504e470d0a1a0a', 'hex'));
  const media = await core.invoke('media.import', { paths: [image, path.join(root, 'clip.avi')] });
  assert.equal(media.imported, 1);
  assert.match(media.errors[0] ?? '', /not supported/);
  const libraryImage = (await core.invoke('media.list', undefined))[0]!;
  assert.notEqual(libraryImage.path, image, 'file copied into the library');
  const translations = await core.invoke('bible.translations', undefined);
  const kjv = translations.find((t) => t.abbreviation === 'KJV')!;
  const service: Service = {
    id: '',
    name: 'Sunday 19 Oct',
    date: '2026-10-19',
    isTemplate: false,
    notes: '',
    createdAt: '',
    updatedAt: '',
    items: [
      { id: newId(), type: 'header', title: 'Worship', themeId: null, notes: '' },
      { id: newId(), type: 'song', title: 'Éternel', themeId: null, notes: '', songId, arrangementId: null },
      { id: newId(), type: 'bible', title: 'Psalm 23', themeId: null, notes: '', translationId: kjv.id, reference: 'Ps 23:1-4', versesPerSlide: 2, showVerseNumbers: true },
      { id: newId(), type: 'announcement', title: 'News', themeId: null, notes: '', slides: [{ title: 'Welcome', body: 'Hello', imagePath: null }] },
      { id: newId(), type: 'image', title: 'Picture', themeId: null, notes: '', path: libraryImage.path },
      { id: newId(), type: 'video', title: 'Missing clip', themeId: null, notes: '', path: path.join(root, 'nope.mp4'), loop: false, muted: false },
      { id: newId(), type: 'blank', title: 'Blank', themeId: null, notes: '' },
    ],
  };
  const saved = await core.invoke('services.save', service);
  serviceId = saved.id;
  const deck = await core.invoke('live.load', { serviceId });
  const byType = Object.fromEntries(deck.items.map((i) => [i.type, i]));
  assert.equal(byType.song!.slides.length, 2);
  assert.equal(byType.bible!.slides.length, 2, '4 verses, 2 per slide');
  assert.match(byType.bible!.slides[0]!.footer, /Psalms 23:1-2 \(KJV\)/);
  assert.equal(byType.image!.slides[0]!.missing, false);
  assert.equal(byType.video!.slides[0]!.missing, true);
  assert.match(byType.video!.error ?? '', /not found/);
  assert.deepEqual(await core.invoke('songs.usage', { id: songId }), ['Sunday 19 Oct'], 'delete warning lists the services using the song');
});

test('service survives a restart; live engine drives through it', async (t) => {
  const core = new AppCore(dataDir, platform());
  core.start();
  t.after(() => core.shutdown());
  const state = await core.invoke('live.state', undefined);
  assert.equal(state.deck.serviceId, serviceId, 'last service is reopened');
  let live = await core.invoke('live.command', { type: 'next' });
  assert.equal(live.slide?.text, 'Tu es mon roc');
  const states: number[] = [];
  core.on('live:state', (s) => states.push(s.seq));
  for (let i = 0; i < 50; i += 1) await core.invoke('live.command', { type: i % 2 ? 'nextItem' : 'prevItem' });
  live = await core.invoke('live.command', { type: 'jumpLabel', label: 'C' });
  assert.ok(states.every((s, i) => i === 0 || s > states[i - 1]!), 'monotonic seq');
  // Editing the song while it is live updates the slide content.
  const song = (await core.invoke('songs.get', { id: songId }))!;
  live = await core.invoke('live.command', { type: 'go', itemId: state.deck.items[1]!.itemId, slideIndex: 0 });
  song.sections[0]!.text = 'Tu es mon roc (edited)';
  await core.invoke('songs.save', song);
  assert.equal(core.liveState.slide?.text, 'Tu es mon roc (edited)');
});

test('song import/export round trips (JSON, OpenLyrics, text, ChordPro)', async (t) => {
  const core = new AppCore(dataDir, platform());
  core.start();
  t.after(() => core.shutdown());
  const exportDir = path.join(root, 'export');
  fs.mkdirSync(exportDir, { recursive: true });
  const jsonFile = path.join(exportDir, 'songs.json');
  const exported = await core.invoke('songs.export', { ids: [songId], path: jsonFile, format: 'json' });
  assert.equal(exported.count, 1);
  await core.invoke('songs.export', { ids: [songId], path: path.join(exportDir, 'ol'), format: 'openlyrics' });
  const olFile = path.join(exportDir, 'ol', fs.readdirSync(path.join(exportDir, 'ol'))[0]!);
  const cho = path.join(exportDir, 'song.cho');
  fs.writeFileSync(cho, '{title: Chord Song}\n{artist: Someone}\n{comment: Verse 1}\n[G]Hello [C]world\n{soc}\nSing [D]out\n{eoc}\n');
  const txt = path.join(exportDir, 'plain.txt');
  fs.writeFileSync(txt, 'Plain Song\n\nfirst verse\n\nsecond verse');
  const report = await core.invoke('songs.importFiles', { paths: [jsonFile, olFile, cho, txt, path.join(exportDir, 'missing.txt')] });
  assert.equal(report.imported, 4, JSON.stringify(report));
  assert.equal(report.skipped, 1);
  const imported = await Promise.all(report.ids.map((id) => core.invoke('songs.get', { id })));
  const original = (await core.invoke('songs.get', { id: songId }))!;
  for (const song of imported.slice(0, 2)) {
    assert.deepEqual(song!.sections.map((s) => [s.label, s.text]), original.sections.map((s) => [s.label, s.text]));
  }
  const chord = imported[2]!;
  assert.equal(chord.title, 'Chord Song');
  assert.deepEqual(chord.sections.map((s) => [s.label, s.text]), [
    ['V1', 'Hello world'],
    ['C', 'Sing out'],
  ]);
  assert.equal(imported[3]!.title, 'Plain Song');
  assert.equal(imported[3]!.sections.length, 2);
});

test('Bible import from file, lookup and favorites', async (t) => {
  const core = new AppCore(dataDir, platform());
  core.start();
  t.after(() => core.shutdown());
  const file = path.join(root, 'web.xml');
  fs.writeFileSync(
    file,
    `<XMLBIBLE biblename="World English Bible"><BIBLEBOOK bnumber="43" bname="John"><CHAPTER cnumber="3"><VERS vnumber="16">For God so loved the world</VERS><VERS vnumber="17">For God didn't send</VERS></CHAPTER><CHAPTER cnumber="4"><VERS vnumber="1">Therefore</VERS></CHAPTER></BIBLEBOOK></XMLBIBLE>`,
  );
  const tr = await core.invoke('bible.import', { path: file, abbreviation: 'web', license: 'Public domain' });
  assert.equal(tr.name, 'World English Bible');
  assert.equal(tr.abbreviation, 'WEB');
  assert.equal(tr.verseCount, 3);
  const res = await core.invoke('bible.lookup', { translationId: tr.id, reference: 'jn 3:16-4:1' });
  assert.equal(res.error, null);
  assert.equal(res.verses.length, 3);
  assert.equal((await core.invoke('bible.search', { translationId: tr.id, text: 'loved world' })).length, 1);
  const fav = await core.invoke('bible.saveFavorite', { translationId: tr.id, reference: 'John 3:16' });
  assert.equal(fav.reference, 'John 3:16');
  await assert.rejects(core.invoke('bible.saveFavorite', { translationId: tr.id, reference: 'John 9:1' }), /not found/);
  await assert.rejects(core.invoke('bible.import', { path: path.join(root, 'picture.png') }), /picture.png/);
});

test('backup and restore', async (t) => {
  const core = new AppCore(dataDir, platform());
  core.start();
  t.after(() => core.shutdown());
  const backup = await core.invoke('backup.create', {});
  assert.ok(fs.statSync(backup.path).size > 0);
  const before = (await core.invoke('songs.list', {})).length;
  await core.invoke('songs.save', makeSong('Added after backup', '[V1]\nnew'));
  assert.equal((await core.invoke('songs.list', {})).length, before + 1);
  let changed = false;
  core.on('data:changed', (e) => {
    if (e.kind === 'all') changed = true;
  });
  const result = await core.invoke('backup.restore', { path: backup.path });
  assert.ok(fs.existsSync(result.safetyCopy));
  assert.equal((await core.invoke('songs.list', {})).length, before, 'state from the backup');
  assert.ok(changed);
  const bogus = path.join(root, 'bogus.fvbackup');
  fs.writeFileSync(bogus, 'not a database');
  await assert.rejects(core.invoke('backup.restore', { path: bogus }), /not a FountainVideo backup/);
  assert.equal((await core.invoke('songs.list', {})).length, before, 'failed restore changes nothing');
});

test('a damaged database is recovered from the newest backup', async (t) => {
  fs.writeFileSync(path.join(dataDir, 'fountainvideo.db'), 'garbage'.repeat(1000));
  for (const s of ['-wal', '-shm']) fs.rmSync(path.join(dataDir, `fountainvideo.db${s}`), { force: true });
  const core = new AppCore(dataDir, platform());
  core.start();
  t.after(() => core.shutdown());
  assert.ok((await core.invoke('songs.list', {})).length > 0);
  const notices = core.takePendingNotices();
  assert.match(notices[0]?.message ?? '', /restored the backup/);
});

test('themes: built-ins are read-only, custom themes persist', async (t) => {
  const core = new AppCore(dataDir, platform());
  core.start();
  t.after(() => core.shutdown());
  const themes = await core.invoke('themes.list', undefined);
  assert.ok(themes.length >= 8);
  await assert.rejects(core.invoke('themes.save', themes[0]!), /Built-in/);
  const custom = await core.invoke('themes.save', { ...themes[0]!, id: '', name: 'Our Church', fontSize: 9999 });
  assert.equal(custom.fontSize, 300, 'clamped');
  assert.ok((await core.invoke('themes.list', undefined)).some((t) => t.id === custom.id));
});

test('media paths from another computer are found in the local library', async (t) => {
  const core = new AppCore(dataDir, platform());
  core.start();
  t.after(() => core.shutdown());
  const local = (await core.invoke('media.list', undefined))[0]!;
  const foreign = `C:\\Users\\OtherPC\\AppData\\Roaming\\FountainVideo\\media\\${path.basename(local.path)}`;
  const service = await core.invoke('services.save', {
    id: '',
    name: 'Moved',
    date: '',
    isTemplate: false,
    notes: '',
    createdAt: '',
    updatedAt: '',
    items: [{ id: newId(), type: 'image', title: 'Moved image', themeId: null, notes: '', path: foreign }],
  });
  const deck = await core.invoke('live.load', { serviceId: service.id });
  assert.equal(deck.items[0]!.slides[0]!.missing, false);
  assert.equal(deck.items[0]!.slides[0]!.mediaPath, local.path);
});
