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
const { spawn } = require('child_process');

// ── Output dirs ────────────────────────────────────────────────────
const STUDIO_DIR   = path.join(os.homedir(), 'Movies', 'StudioFlow');
const TEACHING_DIR = path.join(STUDIO_DIR, 'Teaching');
const STORIES_DIR  = path.join(STUDIO_DIR, 'Stories');

function ensureDirs() {
  [STUDIO_DIR, TEACHING_DIR, STORIES_DIR].forEach(d => {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  });
}

// ── Window ─────────────────────────────────────────────────────────
let win;
let normalBounds = { x: undefined, y: undefined, width: 1380, height: 860 };

function createWindow() {
  win = new BrowserWindow({
    width: 1380,
    height: 860,
    minWidth: 900,
    minHeight: 640,
    frame: false,                 // Frameless for custom titlebar / floating widget
    transparent: true,            // Transparent for Loom-style floating window
    backgroundColor: '#00000000', // Set transparent background
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

  // Enable visibility over macOS native fullscreen spaces
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.setFullScreenable(false);

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.once('ready-to-show', () => win.show());
}

app.whenReady().then(() => {
  ensureDirs();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ── IPC Handlers ──────────────────────────────────────────────────
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

  const dir  = mode === 'teaching' ? TEACHING_DIR : STORIES_DIR;
  const webmPath = path.join(dir, filename);
  const mp4Filename = filename.replace('.webm', '.mp4');
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

    const { exec } = require('child_process');
    return new Promise((resolve) => {
      // Use Apple hardware encoder on macOS to avoid CPU spike during conversion
      const videoEncoder = process.platform === 'darwin' ? 'h264_videotoolbox' : 'libx264';
      const extraArgs = process.platform === 'darwin' ? '' : '-crf 20 -preset fast';
      exec(`"${ffmpegPath}" -y -i "${webmPath}" -c:v ${videoEncoder} ${extraArgs} -c:a aac -b:a 192k "${mp4Path}"`, (err) => {
        if (!err) {
          try { fs.unlinkSync(webmPath); } catch(e) {}
          resolve({ ok: true, path: mp4Path, filename: mp4Filename });
        } else {
          console.error('FFmpeg error:', err);
          resolve({ ok: true, path: webmPath, filename: filename, error: 'FFmpeg conversion failed: ' + err.message });
        }
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
  return r.canceled ? null : r.filePaths[0];
});

ipcMain.handle('read-file-b64', async (event, filePath) => {
  try {
    const buf = fs.readFileSync(filePath);
    const ext = path.extname(filePath).toLowerCase().slice(1);
    const mimes = { pdf:'application/pdf', mp4:'video/mp4', mov:'video/quicktime',
      webm:'video/webm', png:'image/png', jpg:'image/jpeg', jpeg:'image/jpeg',
      gif:'image/gif', mp3:'audio/mpeg', wav:'audio/wav', m4a:'audio/mp4',
      ogg:'audio/ogg', flac:'audio/flac' };
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

ipcMain.handle('start-youtube-stream', async (event, { streamKey, serverUrl, fps }) => {
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

  // Verify FFmpeg works
  const { execSync } = require('child_process');
  try {
    execSync(`"${ffmpegPath}" -version`);
  } catch (err) {
    return { ok: false, error: 'FFmpeg was not found. Please install FFmpeg (e.g. via Homebrew: brew install ffmpeg).' };
  }

  const cleanKey = String(streamKey || '').trim().replace(/\s+/g, '');
  let ingestUrl = String(serverUrl || 'rtmp://a.rtmp.youtube.com/live2/').trim().replace(/\s+/g, '');
  if (!ingestUrl.startsWith('rtmp://') && !ingestUrl.startsWith('rtmps://')) {
    ingestUrl = 'rtmp://' + ingestUrl;
  }
  const fullUrl = ingestUrl.endsWith('/') ? `${ingestUrl}${cleanKey}` : `${ingestUrl}/${cleanKey}`;
  const gVal = (fps || 30) * 2;

  try {
    let videoCodec = 'libx264';
    let codecArgs = ['-preset', 'veryfast', '-tune', 'zerolatency'];
    if (process.platform === 'darwin') {
      videoCodec = 'h264_videotoolbox';
      codecArgs = ['-realtime', 'true'];
    }

    ffmpegProcess = spawn(ffmpegPath, [
      '-y',
      '-f', 'webm',
      '-i', 'pipe:0',
      '-c:v', videoCodec,
      ...codecArgs,
      '-b:v', '2500k',
      '-maxrate', '3000k',
      '-bufsize', '6000k',
      '-pix_fmt', 'yuv420p',
      '-g', String(gVal),
      '-c:a', 'aac',
      '-b:a', '128k',
      '-ar', '44100',
      '-f', 'flv',
      fullUrl
    ]);

    ffmpegProcess.on('error', (err) => {
      console.error('Failed to start FFmpeg:', err);
      if (win) win.webContents.send('stream-error', err.message);
      ffmpegProcess = null;
    });

    ffmpegProcess.stderr.on('data', (data) => {
      console.log('FFmpeg:', data.toString());
    });

    ffmpegProcess.on('close', (code) => {
      console.log(`FFmpeg process exited with code ${code}`);
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
