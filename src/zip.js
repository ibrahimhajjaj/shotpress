import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import JSZip from 'jszip';

// files: [{ path: absolute, name: path inside the zip }]
export async function zipFiles(files, outPath) {
  const zip = new JSZip();
  for (const f of files) {
    // zip entries always use forward slashes, whatever the host separator
    zip.file(f.name.split(path.sep).join('/'), await readFile(f.path));
  }
  const buf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  await writeFile(outPath, buf);
  return { path: outPath, bytes: buf.length, entries: files.length };
}

export function zipName(outDir, base) {
  return path.join(outDir, `${base}.zip`);
}
