import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readdir, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';

const run = promisify(execFile);

function toolError(tool, hint) {
  const err = new Error(`${tool} not found — ${hint}`);
  err.code = 'NO_TOOL';
  return err;
}

const isMissing = (e) => e.code === 'ENOENT';

async function shotIos(device, file) {
  try {
    await run('xcrun', ['simctl', 'io', device, 'screenshot', file]);
  } catch (e) {
    if (isMissing(e)) throw toolError('xcrun', 'iOS simulator capture needs Xcode command line tools (macOS)');
    if (/No devices are booted|Invalid device/i.test(String(e.stderr || e.message))) {
      throw new Error(`no booted simulator${device !== 'booted' ? ` matching "${device}"` : ''}. Boot one with: xcrun simctl boot "<device name>" (list: xcrun simctl list devices available)`);
    }
    throw e;
  }
}

async function shotAndroid(device, file) {
  const args = device ? ['-s', device, 'exec-out', 'screencap', '-p'] : ['exec-out', 'screencap', '-p'];
  try {
    const { stdout } = await run('adb', args, { encoding: 'buffer', maxBuffer: 64 * 1024 * 1024 });
    if (!stdout.length || stdout[1] !== 0x50) throw new Error('adb returned no image — is an emulator running? (adb devices)');
    await writeFile(file, stdout);
  } catch (e) {
    if (isMissing(e)) throw toolError('adb', 'Android capture needs platform-tools on PATH');
    if (/no devices|device offline|device .* not found/i.test(String(e.stderr || e.message))) {
      throw new Error('no Android emulator/device visible to adb. Start one, then check: adb devices');
    }
    throw e;
  }
}

// Runs a Maestro flow with the output dir as cwd, so its takeScreenshot steps
// land there; whatever PNGs the run produced become the manifest.
async function runFlow(flow, device, outDir) {
  const before = new Set((await readdir(outDir)).filter(f => f.endsWith('.png')));
  const args = [...(device ? ['--device', device] : []), 'test', path.resolve(flow)];
  try {
    await run('maestro', args, { cwd: outDir, maxBuffer: 16 * 1024 * 1024 });
  } catch (e) {
    if (isMissing(e)) throw toolError('maestro', 'flow capture needs Maestro (https://maestro.mobile.dev)');
    throw new Error(`maestro flow failed: ${String(e.stderr || e.stdout || e.message).trim().split('\n').slice(-3).join(' ')}`);
  }
  const produced = (await readdir(outDir)).filter(f => f.endsWith('.png') && !before.has(f));
  if (!produced.length) {
    throw new Error('the flow ran but produced no screenshots; add takeScreenshot steps to the flow');
  }
  return produced.map(f => ({ path: path.join(outDir, f) }));
}

// simctl records until it receives SIGINT; the file finalizes on clean exit.
async function startIosRecording(device, file) {
  const proc = spawn('xcrun', ['simctl', 'io', device, 'recordVideo', '--codec', 'h264', '--force', file], { stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = '';
  proc.stderr.on('data', (d) => { stderr += d; });
  let exited = false;
  const exit = new Promise((resolve) => proc.on('exit', (code) => { exited = true; resolve(code); }));
  await new Promise((resolve, reject) => { proc.on('spawn', resolve); proc.on('error', reject); })
    .catch((e) => { throw isMissing(e) ? toolError('xcrun', 'video capture needs Xcode command line tools (macOS)') : e; });
  await new Promise(r => setTimeout(r, 800)); // recorder warm-up
  if (exited) {
    if (/No devices are booted|Invalid device/i.test(stderr)) {
      throw new Error(`no booted simulator${device !== 'booted' ? ` matching "${device}"` : ''} — boot one first`);
    }
    throw new Error(`recording failed to start: ${stderr.trim().split('\n').pop()}`);
  }
  return async () => {
    proc.kill('SIGINT');
    const code = await exit;
    if (code !== 0) throw new Error(`recording failed: ${stderr.trim().split('\n').pop() || `exit ${code}`}`);
    if (!(await stat(file).then(s => s.size, () => 0))) throw new Error('recording produced an empty file');
  };
}

// screenrecord stops on SIGINT too, but pkill inside the device shell is the
// reliable way to reach it; the file then finalizes for pull.
async function startAndroidRecording(device, file) {
  const sel = device ? ['-s', device] : [];
  const remote = `/sdcard/shotpress-${process.pid}.mp4`;
  const proc = spawn('adb', [...sel, 'shell', 'screenrecord', '--time-limit', '180', remote], { stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = '';
  proc.stderr.on('data', (d) => { stderr += d; });
  let exited = false;
  const exit = new Promise((resolve) => proc.on('exit', () => { exited = true; resolve(); }));
  await new Promise((resolve, reject) => { proc.on('spawn', resolve); proc.on('error', reject); })
    .catch((e) => { throw isMissing(e) ? toolError('adb', 'video capture needs platform-tools on PATH') : e; });
  await new Promise(r => setTimeout(r, 800));
  if (exited && /no devices|device .* not found|offline/i.test(stderr)) {
    throw new Error('no Android emulator/device visible to adb. Start one, then check: adb devices');
  }
  return async () => {
    await run('adb', [...sel, 'shell', 'pkill', '-INT', 'screenrecord']).catch(() => {});
    await exit;
    await new Promise(r => setTimeout(r, 500)); // file finalize
    try {
      await run('adb', [...sel, 'pull', remote, file]);
    } catch {
      throw new Error(`could not pull the recording: ${stderr.trim().split('\n').pop() || 'screenrecord produced nothing'}`);
    } finally {
      await run('adb', [...sel, 'shell', 'rm', '-f', remote]).catch(() => {});
    }
    if (!(await stat(file).then(s => s.size, () => 0))) throw new Error('recording produced an empty file');
  };
}

export async function simShot({ platform, device = null, outDir = './shotpress-captures', name = 'sim', flow = null, video = false, duration = 20 }) {
  if (!['ios', 'android'].includes(platform)) {
    const err = new Error(`simshot needs a platform: ios or android (got "${platform ?? ''}")`);
    err.code = 'USAGE';
    throw err;
  }
  await mkdir(outDir, { recursive: true });

  if (video) {
    const mp4 = path.join(outDir, `${name}.mp4`);
    const stopRecording = platform === 'ios'
      ? await startIosRecording(device || 'booted', mp4)
      : await startAndroidRecording(device, mp4);
    let files = [];
    try {
      if (flow) files = await runFlow(flow, device, outDir);
      else await new Promise(r => setTimeout(r, duration * 1000));
    } finally {
      await stopRecording();
    }
    return { platform, ...(flow ? { flow } : {}), files, video: { path: mp4 } };
  }

  if (flow) {
    const files = await runFlow(flow, device, outDir);
    return { platform, flow, files };
  }

  const file = path.join(outDir, `${name}.png`);
  if (platform === 'ios') await shotIos(device || 'booted', file);
  else await shotAndroid(device, file);
  return { platform, files: [{ path: file }] };
}
