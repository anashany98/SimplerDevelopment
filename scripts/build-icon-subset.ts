#!/usr/bin/env bun
/**
 * Regenerate the Material Icons subset served at /fonts/material-icons-subset.woff2.
 *
 * Why this exists: the portal self-hosts a ~28KB subset instead of the full
 * 126KB icon font. Any icon NAME used in code that is missing from the subset
 * renders as blank literal text whose advance is one em PER LETTER — that is
 * what once blew out the sidebar footer (the theme toggle "escaped" the rail
 * as a floating ghost). Run this after adding or renaming icons, then commit
 * the regenerated woff2.
 *
 *   bun run icons:subset
 *
 * Requires python3 + fonttools + brotli (pip install fonttools brotli).
 * Names that do not exist in the full font at all (Material Symbols-only
 * icons) are reported at the end — swap those in code; the subset cannot
 * include what the source font lacks.
 */
import { readdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtempSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const ROOTS = ['app', 'components', 'lib', 'packages', 'workers'];
// Catalog files whose quoted strings are icon names (pickers, block maps).
const CATALOGS = [
  'components/product-designer/IconList.tsx',
  'components/product-designer/IconPicker.tsx',
  'components/product-designer/utils/iconResolver.ts',
  'components/portal/IconPicker.tsx',
  'components/ui/Icon.tsx',
  'lib/blocks/inline-material-icons.ts',
  'components/portal/visual-editor/_lib/block-icon-map.ts',
];
const NAME = /^[a-z][a-z0-9_]{2,40}$/;
const RX = [
  /material-icons[^>]*>\s*\{?\s*'([a-z][a-z0-9_]{2,40})'/g,
  /material-icons[^>]*>\s*([a-z][a-z0-9_]{2,40})\s*</g,
  /icon(?:Name)?[:=]\s*['"]([a-z][a-z0-9_]{2,40})['"]/g,
  /icon(?:Name)?[:=]\s*\{\s*['"]([a-z][a-z0-9_]{2,40})['"]\s*\}/g,
  /['"]?icon['"]?\s*:\s*'([a-z][a-z0-9_]{2,40})'/g,
];

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (['node_modules', '.next', 'dist'].includes(e.name)) continue;
      walk(p, out);
    } else if (/\.(tsx|ts)$/.test(e.name)) out.push(p);
  }
  return out;
}

const icons = new Set<string>();
for (const root of ROOTS) {
  let files: string[] = [];
  try {
    files = walk(root);
  } catch {
    continue;
  }
  for (const f of files) {
    const src = readFileSync(f, 'utf8');
    for (const rx of RX) {
      let m: RegExpExecArray | null;
      while ((m = rx.exec(src))) icons.add(m[1]);
    }
    if (CATALOGS.some((c) => f.replace(/\\/g, '/').endsWith(c))) {
      const rx2 = /['"]([a-z][a-z0-9_]{2,40})['"]/g;
      let m: RegExpExecArray | null;
      while ((m = rx2.exec(src))) if (NAME.test(m[1])) icons.add(m[1]);
    }
  }
}
// Dynamic theme-toggle icons resolved at runtime.
['light_mode', 'dark_mode', 'brightness_auto'].forEach((i) => icons.add(i));

const names = [...icons].sort();
const workDir = mkdtempSync(join(tmpdir(), 'icons-subset-'));
const namesFile = join(workDir, 'names.txt');
writeFileSync(namesFile, names.join('\n') + '\n', 'utf8');
console.log(`[icons] extracted ${names.length} unique names from ${ROOTS.join(', ')}`);

const py = spawnSync('python', ['scripts/icon-subset.py', namesFile], { stdio: 'inherit' });
try {
  rmSync(workDir, { recursive: true, force: true });
} catch {
  /* best-effort cleanup */
}
process.exitCode = py.status ?? 1;
