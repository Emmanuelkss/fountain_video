/**
 * Smoke test of the packaged-style Electron app (main process, preloads,
 * fvmedia:// protocol, projector window, persistence). Runs in CI on Windows:
 *   npm run test:electron
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { _electron as electron, type ElectronApplication, type Page } from 'playwright';

const root = path.resolve(__dirname, '../..');
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fv-electron-'));

async function launch(): Promise<{ app: ElectronApplication; operator: Page }> {
  const app = await electron.launch({ args: [root], env: { ...process.env, FV_USER_DATA: dataDir, FV_QUIET: '1' } });
  const operator = await app.firstWindow();
  await operator.waitForSelector('.nav');
  return { app, operator };
}

const call = (page: Page, name: string, input: unknown = null) =>
  page.evaluate(([n, i]) => (window as any).fountain.invoke(n, i), [name, input] as const) as Promise<any>;

async function main() {
  let { app, operator } = await launch();
  const info = await call(operator, 'app.info');
  assert.equal(info.firstRun, true);
  assert.equal(path.resolve(info.dataDir), path.resolve(dataDir));

  // Service from the starter template, with an image served through fvmedia://
  const [template] = await call(operator, 'services.list', { templates: true });
  const service = await call(operator, 'services.duplicate', { id: template.id, asTemplate: false, name: 'Electron smoke', date: '2026-10-25' });
  const png = path.join(dataDir, 'pixel.png');
  fs.writeFileSync(png, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=', 'base64'));
  const report = await call(operator, 'media.import', { paths: [png] });
  assert.equal(report.imported, 1);
  const [media] = await call(operator, 'media.list');
  const imageItem = { id: 'img-1', type: 'image', title: 'Pixel', themeId: null, notes: '', path: media.path };
  await call(operator, 'services.save', { ...service, items: [...service.items, imageItem] });
  await call(operator, 'live.load', { serviceId: service.id });

  // Projector window
  const opened = app.waitForEvent('window');
  const status = await call(operator, 'output.open');
  assert.equal(status.open, true);
  const output = await opened;
  await output.waitForFunction(() => document.body.dataset.seq !== undefined);

  const deck = (await call(operator, 'live.state')).deck;
  const song = deck.items.find((i: any) => i.type === 'song');
  const live = await call(operator, 'live.command', { type: 'go', itemId: song.itemId, slideIndex: 0 });
  await output.waitForFunction((seq) => Number(document.body.dataset.seq) >= seq, live.seq);
  const text = await output.locator('.fv-text').innerText();
  assert.ok(text.trim().length > 0, 'projector shows lyrics');

  await call(operator, 'live.command', { type: 'go', itemId: 'img-1', slideIndex: 0 });
  await output.waitForFunction(() => {
    const img = document.querySelector('.fv-output img.fv-contain') as HTMLImageElement | null;
    return Boolean(img && img.complete && img.naturalWidth > 0);
  });

  await call(operator, 'output.close');
  await app.close();

  // Reopen: service and media are still there.
  ({ app, operator } = await launch());
  const state = await call(operator, 'live.state');
  assert.equal(state.deck.serviceId, service.id);
  assert.ok(state.deck.items.some((i: any) => i.itemId === 'img-1'));
  await app.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
  console.log('Electron smoke test passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
