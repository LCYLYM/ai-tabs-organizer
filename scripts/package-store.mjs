import { mkdir, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, '..');
const distDir = path.join(projectRoot, 'dist');
const artifactsDir = path.join(projectRoot, 'artifacts');
const manifestPath = path.join(distDir, 'manifest.json');

const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const version = String(manifest.version ?? '').trim();

if (!version) {
  throw new Error('dist/manifest.json is missing a valid version.');
}

const outputFile = path.join(artifactsDir, `ai-tabs-organizer-${version}.zip`);

await mkdir(artifactsDir, { recursive: true });
await rm(outputFile, { force: true });

await new Promise((resolve, reject) => {
  const child = spawn(
    'zip',
    ['-qr', outputFile, '.', '-x', '.DS_Store', '*/.DS_Store', '__MACOSX/*'],
    {
      cwd: distDir,
      stdio: 'inherit'
    }
  );

  child.on('error', reject);
  child.on('exit', (code) => {
    if (code === 0) {
      resolve(undefined);
      return;
    }

    reject(new Error(`zip exited with code ${code ?? 'unknown'}`));
  });
});

console.log(`Created Chrome Web Store package: ${outputFile}`);
