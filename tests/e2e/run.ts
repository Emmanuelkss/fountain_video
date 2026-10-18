/**
 * End-to-end church-service scenario in a real browser (Chromium):
 * the real operator UI and projector page, driven like a volunteer would.
 *
 *   npm run test:e2e           (needs Playwright's Chromium: npx playwright install chromium)
 *   SHOTS=dir npm run test:e2e (also saves screenshots)
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { chromium, type Page } from 'playwright';
import { startHarness, type Harness } from './server';

process.env.FV_QUIET = '1';
const shots = process.env.SHOTS ?? '';
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fv-e2e-'));
const dataDir = path.join(root, 'data');
const fixtures = path.join(root, 'fixtures');
fs.mkdirSync(fixtures, { recursive: true });

let step = 0;
const openPages: Page[] = [];
async function shot(page: Page, name: string) {
  if (!shots) return;
  fs.mkdirSync(shots, { recursive: true });
  await page.screenshot({ path: path.join(shots, `${String(++step).padStart(2, '0')}-${name}.png`) });
}

function makeFixtures() {
  // A real PNG (1x1 pixel is enough for decoding; we use a 64x36 gradient).
  const png = path.join(fixtures, 'welcome-banner.png');
  const hasFfmpeg = (() => {
    try {
      execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  })();
  if (hasFfmpeg) {
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'gradients=s=640x360:c0=0x1b3a5c:c1=0xe8a23b:d=1', '-frames:v', '1', png]);
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc=size=320x180:rate=25:duration=3', '-c:v', 'libvpx', '-b:v', '300k', path.join(fixtures, 'countdown.webm')]);
  } else {
    // Minimal valid PNG (1x1 white pixel).
    fs.writeFileSync(png, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=', 'base64'));
  }
  fs.writeFileSync(path.join(fixtures, 'broken.mp4'), Buffer.alloc(4096, 7));
  fs.writeFileSync(
    path.join(fixtures, 'web-sample.xml'),
    `<?xml version="1.0"?><XMLBIBLE biblename="World English Bible (sample)"><BIBLEBOOK bnumber="19" bname="Psalms"><CHAPTER cnumber="23">
      <VERS vnumber="1">Yahweh is my shepherd: I shall lack nothing.</VERS>
      <VERS vnumber="2">He makes me lie down in green pastures. He leads me beside still waters.</VERS>
      <VERS vnumber="3">He restores my soul. He guides me in the paths of righteousness for his name’s sake.</VERS>
    </CHAPTER></BIBLEBOOK></XMLBIBLE>`,
  );
  return { png, webm: hasFfmpeg ? path.join(fixtures, 'countdown.webm') : null, broken: path.join(fixtures, 'broken.mp4'), bible: path.join(fixtures, 'web-sample.xml') };
}

async function outputText(page: Page): Promise<string> {
  return page.evaluate(() => {
    const body = document.querySelector('.fv-output .fv-body, .fv-output .fv-title');
    return body ? (body.closest('.fv-text') as HTMLElement).innerText.trim() : '';
  });
}

async function outputBlack(page: Page): Promise<boolean> {
  // The black overlay fades in over 250 ms.
  return page
    .waitForFunction(() => getComputedStyle(document.querySelector('.fv-output .fv-black')!).opacity === '1', undefined, { timeout: 2000 })
    .then(() => true)
    .catch(() => false);
}

async function waitSync(operator: Page, output: Page) {
  // Wait until the projector shows the same sequence number as the main process.
  const seq = await operator.evaluate(async () => (await (window as any).fountain.invoke('live.state', null)).state.seq);
  await output.waitForFunction((s) => Number(document.body.dataset.seq) === s, seq, { timeout: 5000 });
  return seq as number;
}

async function main() {
  const files = makeFixtures();
  let harness: Harness = await startHarness(dataDir);
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const operator = await context.newPage();
  openPages.push(operator);
  const errors: string[] = [];
  operator.on('pageerror', (e) => errors.push(`operator: ${e.message}`));
  await operator.goto(`${harness.url}/operator.html`);

  // 1. First launch: welcome screen, starter content.
  await operator.getByRole('dialog', { name: 'Welcome to FountainVideo' }).waitFor();
  await shot(operator, 'welcome');
  await operator.getByRole('button', { name: 'Get started' }).click();

  // 2. Create several songs.
  await operator.getByRole('button', { name: 'Songs' }).click();
  const songs = [
    { title: 'Great Is the Lord Test', lyrics: '[Verse 1]\nGreat is the Lord\nAnd worthy of praise\n\n[Chorus]\nHallelujah, hallelujah\nHallelujah, amen\n\n[Verse 2]\nHoly is the Lord\nForever and ever\n\n[Bridge]\nWe lift Your name' },
    { title: 'Jésus, tu es là', lyrics: 'Couplet 1\nJésus, tu es là\nAu milieu de nous\n\nRefrain\nNous t’adorons\nNous t’adorons' },
  ];
  for (const s of songs) {
    await operator.getByRole('button', { name: 'New song' }).click();
    await operator.getByTestId('song-title').fill(s.title);
    await operator.getByTestId('song-lyrics').fill(s.lyrics);
    await operator.getByTestId('song-save').click();
    await operator.getByText(`“${s.title}” saved`).waitFor();
  }
  await operator.getByTestId('song-search').fill('jesus');
  await operator.locator('.list-item', { hasText: 'Jésus, tu es là' }).waitFor();
  await operator.locator('.list-item', { hasText: 'Jésus, tu es là' }).click();
  await shot(operator, 'song-editor');

  // 3. Import media and a Bible translation.
  await operator.getByRole('button', { name: 'Media' }).click();
  harness.queueOpenFiles([files.png, ...(files.webm ? [files.webm] : []), files.broken, path.join(fixtures, 'clip.avi')]);
  await operator.getByRole('button', { name: 'Import files…' }).click();
  await operator.getByText(/files? imported/).waitFor();
  await operator.getByText(/\.avi videos are not supported/).waitFor();
  await shot(operator, 'media');

  await operator.getByRole('button', { name: 'Bible', exact: true }).click();
  await operator.locator('button[title="Import a translation"]').click();
  harness.queueOpenFiles([files.bible]);
  await operator.getByRole('button', { name: 'Choose…' }).click();
  await operator.getByPlaceholder('LSG').fill('WEB');
  await operator.getByRole('button', { name: 'Import', exact: true }).click();
  await operator.getByText(/imported \(3 verses\)/).waitFor();

  // 4. Build a service from the template and add every kind of item.
  await operator.getByRole('button', { name: 'Services' }).click();
  await operator.getByRole('button', { name: 'New service from this' }).first().click();
  await operator.getByRole('button', { name: 'Create & open' }).click();
  await operator.locator('.service-item', { hasText: 'Holy, Holy, Holy' }).waitFor();

  const addVia = async (label: string) => {
    await operator.getByRole('button', { name: 'Add', exact: true }).first().click();
    await operator.getByRole('menuitem', { name: label }).click();
  };
  // Song through the Ctrl+F search shortcut, Enter adds it.
  await operator.keyboard.press('Control+f');
  await operator.getByPlaceholder('Search by title, words or author…').fill('great is the lord');
  await operator.keyboard.press('Enter');
  await operator.locator('.service-item', { hasText: 'Great Is the Lord Test' }).waitFor();
  // Bible passage
  await addVia('Bible passage…');
  await operator.locator('.modal select').first().selectOption({ label: 'WEB — World English Bible (sample)' });
  await operator.getByPlaceholder('e.g. John 3:16-18, Ps 23, Jean 3.16').fill('Ps 23:1-3');
  await operator.getByText('Psalms 23:1-3 · 3 verses').waitFor();
  await operator.getByRole('button', { name: 'Add', exact: true }).last().click();
  // Image and videos
  await addVia('Image…');
  await operator.locator('.modal .media-card').first().waitFor();
  await operator.locator('.modal .media-card').first().getByRole('button', { name: 'Add', exact: true }).click();
  await addVia('Video…');
  const videoCards = operator.locator('.modal .media-card');
  await videoCards.last().waitFor();
  for (let i = (await videoCards.count()) - 1; i >= 0; i -= 1) {
    await videoCards.nth(i).getByRole('button', { name: 'Add', exact: true }).click();
    if (i > 0) await addVia('Video…');
  }
  // Announcement from a preset
  await addVia('Announcement…');
  await operator.getByRole('button', { name: /Service schedule/ }).click();
  await operator.getByRole('button', { name: 'Save', exact: true }).click();
  await operator.waitForTimeout(600); // autosave debounce
  await shot(operator, 'service-built');

  // 5. Close and reopen: the service is preserved.
  const serviceId = harness.core.liveDeck.serviceId;
  const itemCount = harness.core.liveDeck.items.length;
  assert.ok(itemCount >= 16, `service has all items (${itemCount})`);
  await operator.close();
  await harness.close();
  harness = await startHarness(dataDir);
  const op = await context.newPage();
  openPages.push(op);
  op.on('pageerror', (e) => errors.push(`operator: ${e.message}`));
  await op.goto(`${harness.url}/operator.html`);
  await op.locator('.service-item', { hasText: 'Great Is the Lord Test' }).waitFor();
  assert.equal(harness.core.liveDeck.serviceId, serviceId, 'same service reopened');
  assert.equal(harness.core.liveDeck.items.length, itemCount, 'no item lost');

  // 6. Projector on (F5) and present.
  await op.keyboard.press('F5');
  await op.locator('.projector-btn.on').waitFor();
  const out = await context.newPage();
  out.on('pageerror', (e) => errors.push(`output: ${e.message}`));
  await out.setViewportSize({ width: 1280, height: 720 });
  await out.goto(`${harness.url}/output.html`);

  await op.locator('.service-item', { hasText: 'Great Is the Lord Test' }).click();
  await op.getByTestId('thumb-0').click();
  await waitSync(op, out);
  assert.match(await outputText(out), /Great is the Lord/);
  await shot(op, 'live-operator');
  await shot(out, 'live-projector');

  // 7. Rapid navigation: 40 key presses as fast as possible, projector must match.
  for (let i = 0; i < 40; i += 1) await op.keyboard.press(i % 4 === 3 ? 'ArrowLeft' : 'ArrowRight', { delay: 0 });
  await waitSync(op, out);
  const live = harness.core.liveState;
  assert.equal(await outputText(out), live.slide?.text.trim(), 'projector shows the live slide after rapid navigation');

  // Section shortcuts: C jumps to the chorus, 2 to verse 2, B to bridge.
  await op.keyboard.press('ArrowLeft');
  await op.keyboard.press('c');
  await waitSync(op, out);
  assert.match(await outputText(out), /Hallelujah/);
  await op.keyboard.press('2');
  await waitSync(op, out);
  assert.match(await outputText(out), /Holy is the Lord/);

  // Black and clear.
  await op.keyboard.press('.');
  await waitSync(op, out);
  assert.equal(await outputBlack(out), true, 'black screen');
  await op.keyboard.press('.');
  await op.keyboard.press('/');
  await waitSync(op, out);
  assert.equal(await outputText(out), '', 'text cleared');
  await op.keyboard.press('/');

  // 8. Switch items: next item, Bible passage with verse numbers and reference footer.
  await op.locator('.service-item', { hasText: 'Ps 23' }).or(op.locator('.service-item', { hasText: 'Psalms 23:1-3' })).first().dblclick();
  await waitSync(op, out);
  assert.match(await outputText(out), /Yahweh is my shepherd/);
  assert.match(await out.locator('.fv-footer').innerText(), /Psalms 23:1 \(WEB\)/);
  await shot(out, 'bible-projector');

  // Image item
  await op.locator('.service-item', { hasText: 'welcome-banner' }).dblclick();
  await waitSync(op, out);
  assert.equal(await out.locator('.fv-output img.fv-contain').count(), 1, 'image on projector');

  // 9. Video: plays on the projector; a broken file is reported to the operator.
  if (files.webm) {
    await op.locator('.service-item', { hasText: 'countdown' }).dblclick();
    await waitSync(op, out);
    await out.waitForFunction(() => {
      const v = document.querySelector('.fv-output video') as HTMLVideoElement | null;
      return Boolean(v && !v.paused && v.currentTime > 0);
    }, undefined, { timeout: 8000 });
    await op.getByTestId('ctl-media').click();
    await out.waitForFunction(() => (document.querySelector('.fv-output video') as HTMLVideoElement).paused);
  }
  await op.locator('.service-item', { hasText: 'broken' }).dblclick();
  await op.getByText(/broken\.mp4 cannot be played/).first().waitFor({ timeout: 8000 });
  assert.equal(await op.getByText(/broken\.mp4 cannot be played/).count(), 1, 'reported once');
  await shot(op, 'video-error');

  // Missing file: delete the imported image from disk -> warning in the service, projector stays clean.
  const imagePath = harness.core.liveDeck.items.find((i) => i.type === 'image')!.slides[0]!.mediaPath!;
  fs.renameSync(imagePath, `${imagePath}.moved`);
  await op.evaluate(() => (window as any).fountain.invoke('settings.update', {}));
  await op.locator('.service-item', { hasText: 'welcome-banner' }).locator('.item-warn').waitFor();
  fs.renameSync(`${imagePath}.moved`, imagePath);

  // 10. Projector off with Shift+Esc (safe exit).
  await op.keyboard.press('Shift+Escape');
  await op.locator('.projector-btn:not(.on)').waitFor();

  // 11. Backup and restore.
  await op.getByRole('button', { name: 'Settings' }).click();
  await op.getByRole('button', { name: 'Back up now' }).click();
  await op.getByText(/Backup saved/).waitFor();
  await shot(op, 'settings');
  const songCount = (await harness.core.invoke('songs.list', {})).length;
  const victim = (await harness.core.invoke('songs.list', { query: 'Jésus' }))[0]!;
  await harness.core.invoke('songs.delete', { id: victim.id });
  const newest = (await harness.core.invoke('backup.list', undefined)).find((b) => !b.automatic)!;
  harness.queueOpenFiles([newest.path]);
  await op.getByRole('button', { name: 'Restore from file…' }).click();
  await op.getByRole('dialog', { name: 'Restore backup' }).getByRole('button', { name: 'Restore', exact: true }).click();
  await op.getByText('Backup restored').waitFor();
  assert.equal((await harness.core.invoke('songs.list', {})).length, songCount, 'deleted song is back after restore');

  // 12. Customisable shortcuts are listed.
  await op.locator('.shortcut-table').getByText('Black screen').waitFor();

  // Themes page renders.
  await op.getByRole('button', { name: 'Themes' }).click();
  await op.getByText('Use for Bible').waitFor();
  await shot(op, 'themes');

  assert.deepEqual(errors, [], 'no JavaScript errors');
  await browser.close();
  await harness.close();
  fs.rmSync(root, { recursive: true, force: true });
  console.log('E2E: all church-service scenarios passed');
}

main().catch(async (err) => {
  console.error(err);
  if (shots) {
    for (const [i, page] of openPages.entries()) {
      if (!page.isClosed()) await page.screenshot({ path: path.join(shots, `failure-${i}.png`) }).catch(() => undefined);
    }
  }
  process.exit(1);
});
