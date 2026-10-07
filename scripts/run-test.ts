/**
 * Cross-platform launcher for the Bash-based test pipeline.
 *
 * Windows exposes WSL's `bash.exe` on PATH before Git Bash, which makes the
 * script run with WSL's unrelated npm cache and can install a conflicting
 * dependency graph. Prefer Git Bash on Windows so the pipeline uses the
 * checkout's Windows Bun/Node tools; macOS and Linux keep using `bash`.
 */
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const root = join(import.meta.dir, '..');
const args = process.argv.slice(2);
const gitBashCandidates = [
  'C:/Program Files/Git/bin/bash.exe',
  'C:/Program Files/Git/usr/bin/bash.exe',
];
const bash = process.platform === 'win32'
  ? gitBashCandidates.find(existsSync)
  : 'bash';

if (!bash) {
  console.error('Git Bash is required on Windows to run the repository test pipeline.');
  process.exit(1);
}

const result = spawnSync(bash, ['scripts/test.sh', ...args], {
  cwd: root,
  stdio: 'inherit',
  env: process.env,
});

if (result.error) {
  console.error(`Could not start the test pipeline: ${result.error.message}`);
  process.exit(1);
}
process.exit(result.status ?? 1);
