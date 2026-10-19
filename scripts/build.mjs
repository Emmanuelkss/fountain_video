// Reproducible build: bundles main, preloads and renderers into dist/ with esbuild.
//   node scripts/build.mjs            production build used by `npm start` / `npm run dist`
//   node scripts/build.mjs --harness  also builds the browser shims used by automated UI tests
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const harness = process.argv.includes('--harness');
const dev = process.argv.includes('--dev');

fs.rmSync(dist, { recursive: true, force: true });

const common = { bundle: true, sourcemap: dev ? 'inline' : false, logLevel: 'warning', legalComments: 'none' };

await Promise.all([
  build({
    ...common,
    entryPoints: [path.join(root, 'src/main/main.ts')],
    outfile: path.join(dist, 'main/main.js'),
    platform: 'node',
    format: 'cjs',
    target: 'node22',
    external: ['electron'],
  }),
  build({
    ...common,
    entryPoints: {
      operator: path.join(root, 'src/preload/operator.ts'),
      output: path.join(root, 'src/preload/output.ts'),
    },
    outdir: path.join(dist, 'preload'),
    platform: 'node',
    format: 'cjs',
    target: 'node22',
    external: ['electron'],
  }),
  build({
    ...common,
    entryPoints: {
      operator: path.join(root, 'src/renderer/operator/index.tsx'),
      output: path.join(root, 'src/renderer/output/index.tsx'),
    },
    outdir: path.join(dist, 'renderer'),
    platform: 'browser',
    format: 'iife',
    target: 'chrome120',
    jsx: 'automatic',
    minify: !dev,
    define: { 'process.env.NODE_ENV': dev ? '"development"' : '"production"' },
  }),
  harness &&
    build({
      ...common,
      entryPoints: {
        'operator-shim': path.join(root, 'tests/e2e/operatorShim.ts'),
        'output-shim': path.join(root, 'tests/e2e/outputShim.ts'),
      },
      outdir: path.join(dist, 'harness'),
      platform: 'browser',
      format: 'iife',
      target: 'chrome120',
    }),
]);

for (const page of ['operator', 'output']) {
  fs.copyFileSync(path.join(root, `src/renderer/${page}.html`), path.join(dist, `renderer/${page}.html`));
}
console.log(`Built into ${path.relative(root, dist)}${harness ? ' (with test harness)' : ''}`);
