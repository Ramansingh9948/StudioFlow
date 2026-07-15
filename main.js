/**
 * StudioFlow — Electron Main Process
 */
const {
  app,
  BrowserWindow,
  ipcMain,
  desktopCapturer,
  dialog,
  shell,
  screen,
} = require('electron');
const path = require('path');
const fs   = require('fs');
const os   = require('os');
const { spawn, spawnSync } = require('child_process');
const { startServer, stopServer } = require('./server');
const QRCode = require('qrcode');

// ── Auth & Plan system ─────────────────────────────────────────────
const authClient = require('./auth/mongodb');
const { isAllowed, getPlanInfo, getMonthlyMinutes, getRemainingMinutes, formatRemainingTime, getAllPlans } = require('./auth/plans');
const { PRICING_URL } = require('./auth/config');

// Current session state (set after login)
let currentUser   = null;
let currentPlan   = 'basic';
let currentProfile = null;

// ── Security: track files explicitly opened via dialog ─────────────
// Only paths the user picked through showOpenDialog are allowed to be
// read back by the renderer via the read-file-b64 IPC channel.
const allowedReadPaths = new Set();

// ── Output dirs ────────────────────────────────────────────────────
const STUDIO_DIR   = path.join(os.homedir(), 'Movies', 'StudioFlow');
const TEACHING_DIR = path.join(STUDIO_DIR, 'Teaching');
const STORIES_DIR  = path.join(STUDIO_DIR, 'Stories');

function ensureDirs() {
  [STUDIO_DIR, TEACHING_DIR, STORIES_DIR].forEach(d => {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  });
}

// ── Window references ─────────────────────────────────────────────
let win     = null;  // main app window
let authWin = null;  // auth window
let normalBounds = { x: undefined, y: undefined, width: 1380, height: 860 };

// ── Auth window ────────────────────────────────────────────────────
function createAuthWindow() {
  authWin = new BrowserWindow({
    width: 1100,
    height: 680,
    minWidth: 800,
    minHeight: 560,
    center: true,
    resizable: true,
    frame: false,
    transparent: false,
    backgroundColor: '#0d0f1a',
    show: false,
    hasShadow: true,
    titleBarStyle: 'hidden',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
    },
  });
  authWin.loadFile(path.join(__dirname, 'renderer', 'auth.html'));
  authWin.once('ready-to-show', () => authWin.show());
  authWin.on('closed', () => { authWin = null; });
}

// ── Main app window ────────────────────────────────────────────────
function createWindow() {
  win = new BrowserWindow({
    width: 1380,
    height: 860,
    minWidth: 900,
    minHeight: 640,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    show: false,
    hasShadow: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  });

  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.setFullScreenable(false);
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.once('ready-to-show', () => win.show());
  win.on('closed', () => { win = null; });
}

let serverInfo = null;

app.whenReady().then(async () => {
  ensureDirs();
  try {
    serverInfo = await startServer(3030);
    console.log('StudioFlow Server started successfully:', serverInfo.url);
  } catch(e) {
    console.error('Failed to start local server:', e);
  }

  // Try to restore an existing encrypted session
  const restored = await authClient.restoreSession();
  if (restored.ok) {
    currentUser    = restored.user || { id: 'offline' };
    currentPlan    = restored.plan || 'free';
    currentProfile = restored.profile || {};
    console.log(`[Auth] Session restored — plan: ${currentPlan}${restored.offline ? ' (offline cache)' : ''}`);
    createWindow();
  } else {
    console.log('[Auth] No session found, showing auth screen.');
    createAuthWindow();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      if (currentUser) createWindow(); else createAuthWindow();
    }
  });
});


app.on('window-all-closed', () => {
  stopServer();
  if (process.platform !== 'darwin') app.quit();
});

// ── IPC Handlers ──────────────────────────────────────────────────
ipcMain.handle('get-server-url', () => {
  // Return both the base server URL and the token-bearing client URL
  return serverInfo ? { url: serverInfo.url, clientUrl: serverInfo.clientUrl, token: serverInfo.token } : null;
});

ipcMain.handle('get-server-qr', async () => {
  if (!serverInfo) return null;
  try {
    // [M1] Encode the clientUrl (which contains the session token) into the QR code.
    // Only devices that scan this QR code will know the token and can connect.
    const qrDataUrl = await QRCode.toDataURL(serverInfo.clientUrl || serverInfo.url);
    return qrDataUrl;
  } catch (err) {
    console.error('Failed to generate QR code:', err);
    return null;
  }
});

ipcMain.handle('generate-qr', async (event, text) => {
  try {
    const qrDataUrl = await QRCode.toDataURL(text);
    return { ok: true, url: qrDataUrl };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('get-sources', async () => {
  try {
    const sources = await desktopCapturer.getSources({
      types: ['screen', 'window'],
      thumbnailSize: { width: 400, height: 250 },
    });
    return sources.map(s => ({
      id: s.id,
      name: s.name,
      thumbnail: s.thumbnail.toDataURL(),
    }));
  } catch (e) {
    console.error('getSources error:', e);
    return [];
  }
});
ipcMain.handle('save-recording', async (event, { buffer, mode, filename }) => {
  // [C1] Sanitize filename: strip any path separators or shell-special characters.
  // Filenames are generated by the renderer as e.g. "teach_2026-07-09T11-30-00.webm"
  // but we must never trust renderer input blindly.
  const safeFilename = path.basename(String(filename || 'recording.webm'))
    .replace(/[^a-zA-Z0-9._\-]/g, '_')
    .slice(0, 128);
  if (!safeFilename.endsWith('.webm')) {
    return { ok: false, error: 'Invalid recording filename' };
  }

  const dir  = mode === 'teaching' ? TEACHING_DIR : STORIES_DIR;
  const webmPath = path.join(dir, safeFilename);
  const mp4Filename = safeFilename.replace('.webm', '.mp4');
  const mp4Path = path.join(dir, mp4Filename);

  try {
    fs.writeFileSync(webmPath, Buffer.from(buffer));

    // Resolve standard macOS FFmpeg paths for M1/M2/M3 and Intel Macs
    let ffmpegPath = 'ffmpeg';
    if (process.platform === 'darwin') {
      if (fs.existsSync('/opt/homebrew/bin/ffmpeg')) {
        ffmpegPath = '/opt/homebrew/bin/ffmpeg';
      } else if (fs.existsSync('/usr/local/bin/ffmpeg')) {
        ffmpegPath = '/usr/local/bin/ffmpeg';
      }
    }

    // [C1] Use spawn() with an argument array — never a shell command string.
    // This completely prevents shell injection regardless of path content.
    const videoEncoder = process.platform === 'darwin' ? 'h264_videotoolbox' : 'libx264';

    // Probe resolution from filename/buffer to pick appropriate bitrate
    // VideoToolbox needs an explicit -b:v or it defaults to low quality (~2 Mbps)
    const isDarwin = process.platform === 'darwin';
    const vBitrate = isDarwin ? '20M' : null; // Use 20Mbps; actual bitrate will match source quality
    const darwinArgs = [
      '-b:v', vBitrate,   // explicit bitrate — prevents VideoToolbox soft-quality default
      '-allow_sw', '1',   // allow CPU fallback if GPU encode fails (avoids silent skip)
      '-tag:v', 'avc1',   // proper H.264 MP4 tagging for QuickTime/Finder
    ];
    const linuxArgs = ['-crf', '18', '-preset', 'fast', '-profile:v', 'high'];
    const extraArgs = isDarwin ? darwinArgs : linuxArgs;

    return new Promise((resolve) => {
      const ffmpeg = spawn(ffmpegPath, [
        '-y', '-i', webmPath,
        '-c:v', videoEncoder, ...extraArgs,
        '-c:a', 'aac', '-b:a', '256k',
        mp4Path,
      ]);

      ffmpeg.on('close', (code) => {
        if (code === 0) {
          try { fs.unlinkSync(webmPath); } catch(e) {}
          resolve({ ok: true, path: mp4Path, filename: mp4Filename });
        } else {
          console.error('FFmpeg conversion exited with code', code);
          resolve({ ok: true, path: webmPath, filename: safeFilename, error: `FFmpeg exited with code ${code}` });
        }
      });

      ffmpeg.on('error', (err) => {
        console.error('FFmpeg spawn error:', err);
        resolve({ ok: false, error: err.message });
      });
    });
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('open-file', async (event, { filters, title } = {}) => {
  const r = await dialog.showOpenDialog(win, {
    title: title || 'Open File',
    properties: ['openFile'],
    filters: filters || [{ name: 'All Files', extensions: ['*'] }],
  });
  if (r.canceled || !r.filePaths[0]) return null;

  // [C2] Register this path as explicitly allowed for subsequent read-file-b64 calls.
  const chosen = r.filePaths[0];
  allowedReadPaths.add(chosen);
  return chosen;
});

ipcMain.handle('read-file-b64', async (event, filePath) => {
  // [C2] Reject any path that was NOT explicitly chosen by the user via the file dialog.
  const normalized = path.resolve(String(filePath || ''));
  if (!allowedReadPaths.has(normalized)) {
    console.warn('[Security] read-file-b64 blocked for unregistered path:', normalized);
    return null;
  }
  try {
    const buf = fs.readFileSync(normalized);
    const ext = path.extname(normalized).toLowerCase().slice(1);
    const mimes = {
      pdf: 'application/pdf', mp4: 'video/mp4', mov: 'video/quicktime',
      webm: 'video/webm', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
      gif: 'image/gif', mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4',
      ogg: 'audio/ogg', flac: 'audio/flac',
    };
    const mime = mimes[ext] || 'application/octet-stream';
    return `data:${mime};base64,${buf.toString('base64')}`;
  } catch (e) { return null; }
});

ipcMain.handle('open-finder', async (event, p) => shell.showItemInFolder(p));
ipcMain.handle('get-dirs', () => ({ root: STUDIO_DIR, teaching: TEACHING_DIR, stories: STORIES_DIR }));

// ── Widget / Window controls ──────────────────────────────────────
ipcMain.handle('set-always-on-top', (event, flag) => {
  if (win) win.setAlwaysOnTop(flag, 'screen-saver');
});

ipcMain.handle('set-ignore-mouse-events', (event, ignore, options) => {
  if (win) win.setIgnoreMouseEvents(ignore, options);
});

ipcMain.handle('enter-widget-mode', () => {
  if (!win) return;
  normalBounds = win.getBounds();
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;
  
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setBounds({ x: 0, y: 0, width, height });
});

ipcMain.handle('exit-widget-mode', () => {
  if (!win) return;
  win.setAlwaysOnTop(false);
  win.setBounds(normalBounds);
});

ipcMain.handle('minimize-app', () => {
  if (win) win.minimize();
});

ipcMain.handle('close-app', () => {
  if (win) win.close();
});

// ── YouTube Live Streaming ─────────────────────────────────────────
let ffmpegProcess = null;

ipcMain.handle('start-youtube-stream', async (event, { streamKey, serverUrl, streams, fps }) => {
  if (ffmpegProcess) {
    return { ok: false, error: 'A stream is already active.' };
  }

  // Resolve standard macOS FFmpeg paths for M1/M2/M3 and Intel Macs
  let ffmpegPath = 'ffmpeg';
  if (process.platform === 'darwin') {
    if (fs.existsSync('/opt/homebrew/bin/ffmpeg')) {
      ffmpegPath = '/opt/homebrew/bin/ffmpeg';
    } else if (fs.existsSync('/usr/local/bin/ffmpeg')) {
      ffmpegPath = '/usr/local/bin/ffmpeg';
    }
  }

  // [L3] Verify FFmpeg works using spawnSync (no shell, no injection risk).
  try {
    const check = spawnSync(ffmpegPath, ['-version']);
    if (check.error) throw check.error;
  } catch (err) {
    return { ok: false, error: 'FFmpeg was not found. Please install FFmpeg (e.g. via Homebrew: brew install ffmpeg).' };
  }

  // Support both legacy single stream args and new streams array format
  let streamTargets = [];
  if (streams && Array.isArray(streams) && streams.length > 0) {
    streamTargets = streams;
  } else {
    streamTargets = [{ serverUrl, streamKey }];
  }

  const gVal = (fps || 30) * 2;

  try {
    let videoCodec = 'libx264';
    let codecArgs = ['-preset', 'veryfast', '-tune', 'zerolatency'];
    if (process.platform === 'darwin') {
      videoCodec = 'h264_videotoolbox';
      codecArgs = ['-realtime', 'true'];
    }

    const logPath = path.join(STUDIO_DIR, 'ffmpeg_stream.log');
    const logStream = fs.createWriteStream(logPath, { flags: 'w' });

    // Build FFmpeg output stream arguments
    const outputArgs = [
      '-c:a', 'aac',
      '-b:a', '128k',
      '-ar', '44100',
      '-flags', '+global_header'
    ];

    let loggedIngestStr = '';

    if (streamTargets.length === 1) {
      const s = streamTargets[0];
      const cleanKey = String(s.streamKey || '').trim().replace(/\s+/g, '');
      let ingestUrl = String(s.serverUrl || 'rtmp://a.rtmp.youtube.com/live2/').trim().replace(/\s+/g, '');
      if (!ingestUrl.startsWith('rtmp://') && !ingestUrl.startsWith('rtmps://')) {
        ingestUrl = 'rtmp://' + ingestUrl;
      }
      const fullUrl = ingestUrl.endsWith('/') ? `${ingestUrl}${cleanKey}` : `${ingestUrl}/${cleanKey}`;
      outputArgs.push('-f', 'flv', fullUrl);
      loggedIngestStr = ingestUrl;
    } else {
      const teeTargets = streamTargets.map(s => {
        const cleanKey = String(s.streamKey || '').trim().replace(/\s+/g, '');
        let ingestUrl = String(s.serverUrl || '').trim().replace(/\s+/g, '');
        if (!ingestUrl.startsWith('rtmp://') && !ingestUrl.startsWith('rtmps://')) {
          ingestUrl = 'rtmp://' + ingestUrl;
        }
        const fullUrl = ingestUrl.endsWith('/') ? `${ingestUrl}${cleanKey}` : `${ingestUrl}/${cleanKey}`;
        // Escape colons and pipes in tee syntax
        const escaped = fullUrl.replace(/:/g, '\\:').replace(/\|/g, '\\|');
        return `[f=flv:onfail=ignore]${escaped}`;
      }).join('|');

      outputArgs.push('-f', 'tee', '-map', '0:v', '-map', '0:a', teeTargets);
      loggedIngestStr = `${streamTargets.length} destinations via tee`;
    }

    ffmpegProcess = spawn(ffmpegPath, [
      '-y',
      // Input parameters
      '-fflags', '+genpts+nobuffer',
      '-use_wallclock_as_timestamps', '1',
      '-f', 'webm',
      '-i', 'pipe:0',
      
      // Video transcoding parameters
      '-c:v', videoCodec,
      ...codecArgs,
      '-r', String(fps || 30),
      '-b:v', '2500k',
      '-maxrate', '3000k',
      '-bufsize', '6000k',
      '-pix_fmt', 'yuv420p',
      '-g', String(gVal),
      
      ...outputArgs
    ]);

    logStream.write(`Started stream to: ${loggedIngestStr} (stream keys redacted)\n`);
    // Redact the last argument (full RTMP URL containing key) before logging.
    const safeArgs = [...ffmpegProcess.spawnargs.slice(0, -1), '<rtmp-url-redacted>'];
    logStream.write(`FFmpeg parameters: ${JSON.stringify(safeArgs)}\n\n`);

    ffmpegProcess.on('error', (err) => {
      console.error('Failed to start FFmpeg:', err);
      logStream.write(`\nFailed to start FFmpeg: ${err.message}\n`);
      logStream.end();
      if (win) win.webContents.send('stream-error', err.message);
      ffmpegProcess = null;
    });

    ffmpegProcess.stderr.on('data', (data) => {
      const msg = data.toString();
      console.log('FFmpeg:', msg);
      logStream.write(msg);
    });

    ffmpegProcess.on('close', (code) => {
      console.log(`FFmpeg process exited with code ${code}`);
      logStream.write(`\nFFmpeg process exited with code ${code}\n`);
      logStream.end();
      ffmpegProcess = null;
      if (win) win.webContents.send('stream-stopped', code);
    });

    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('write-stream-chunk', async (event, buffer) => {
  if (ffmpegProcess && ffmpegProcess.stdin.writable) {
    try {
      ffmpegProcess.stdin.write(Buffer.from(buffer));
      return { ok: true };
    } catch (err) {
      console.error('Error writing to FFmpeg stdin:', err);
      return { ok: false, error: err.message };
    }
  }
  return { ok: false, error: 'FFmpeg process not running or writable' };
});

ipcMain.handle('stop-youtube-stream', async () => {
  if (ffmpegProcess) {
    try {
      ffmpegProcess.stdin.end();
      const proc = ffmpegProcess;
      setTimeout(() => {
        if (proc === ffmpegProcess && ffmpegProcess) {
          ffmpegProcess.kill('SIGKILL');
          ffmpegProcess = null;
        }
      }, 3000);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }
  return { ok: false, error: 'No active stream to stop' };
});

// ── Auth IPC Handlers ────────────────────────────────────────────────────────

ipcMain.handle('auth:sign-in', async (event, email, password) => {
  const res = await authClient.signIn(email, password);
  if (res.ok) {
    currentUser = res.user;
    currentPlan = res.plan;
    currentProfile = res.profile;
  }
  return res;
});

ipcMain.handle('auth:sign-up', async (event, email, password, name, plan) => {
  return await authClient.signUp(email, password, name, plan);
});

ipcMain.handle('auth:sign-out', async () => {
  const res = await authClient.signOut();
  currentUser = null;
  currentPlan = 'free';
  currentProfile = null;
  
  // Transition back to auth window
  if (win) {
    win.close();
    win = null;
  }
  if (!authWin) {
    createAuthWindow();
  }
  return res;
});

ipcMain.handle('auth:reset-password', async (event, email) => {
  return await authClient.resetPassword(email);
});

ipcMain.handle('auth:launch-app', async (event, authResult) => {
  currentUser = authResult.user;
  currentPlan = authResult.plan;
  currentProfile = authResult.profile;
  
  // Create index window first, then close auth window
  createWindow();
  if (authWin) {
    authWin.close();
    authWin = null;
  }
  return { ok: true };
});

ipcMain.handle('auth:open-external', async (event, url) => {
  shell.openExternal(url);
  return { ok: true };
});

// ── Plan & Usage IPC Handlers ────────────────────────────────────────────────

ipcMain.handle('plan:get-info', async () => {
  return {
    plan: currentPlan,
    user: currentUser,
    profile: currentProfile
  };
});

ipcMain.handle('plan:is-allowed', async (event, feature) => {
  return isAllowed(currentPlan, feature);
});

ipcMain.handle('plan:get-usage', async () => {
  return await authClient.getUsage();
});

ipcMain.handle('plan:add-usage', async (event, minutes) => {
  await authClient.addUsage(minutes);
  return await authClient.getUsage();
});

ipcMain.handle('plan:open-upgrade', async () => {
  shell.openExternal(PRICING_URL);
  return { ok: true };
});

ipcMain.handle('plan:update-plan', async (event, newPlan) => {
  const res = await authClient.updateUserPlan(newPlan);
  if (res.ok) {
    currentPlan = newPlan;
    // Refresh local cache representation
    const freshProfile = await authClient.fetchProfile(currentUser ? currentUser.id : 'dev-user-id');
    currentProfile = freshProfile;
  }
  return res;
});

