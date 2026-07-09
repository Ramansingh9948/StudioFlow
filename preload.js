const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('SF', {
  getServerUrl:   ()       => ipcRenderer.invoke('get-server-url'),
  getServerQr:    ()       => ipcRenderer.invoke('get-server-qr'),
  getSources:     ()       => ipcRenderer.invoke('get-sources'),
  saveRecording:  (d)      => ipcRenderer.invoke('save-recording', d),
  openFile:       (o)      => ipcRenderer.invoke('open-file', o),
  readFileB64:    (p)      => ipcRenderer.invoke('read-file-b64', p),
  openFinder:     (p)      => ipcRenderer.invoke('open-finder', p),
  getDirs:        ()       => ipcRenderer.invoke('get-dirs'),
  generateQr:     (t)      => ipcRenderer.invoke('generate-qr', t),

  // Window & Loom Widget controls
  setAlwaysOnTop: (f)      => ipcRenderer.invoke('set-always-on-top', f),
  setIgnoreMouse: (i, o)   => ipcRenderer.invoke('set-ignore-mouse-events', i, o),
  enterWidgetMode:()       => ipcRenderer.invoke('enter-widget-mode'),
  exitWidgetMode: ()       => ipcRenderer.invoke('exit-widget-mode'),
  minimizeApp:    ()       => ipcRenderer.invoke('minimize-app'),
  closeApp:       ()       => ipcRenderer.invoke('close-app'),

  // YouTube Live Streaming
  startYoutubeStream: (d)  => ipcRenderer.invoke('start-youtube-stream', d),
  writeStreamChunk:   (c)  => ipcRenderer.invoke('write-stream-chunk', c),
  stopYoutubeStream:  ()   => ipcRenderer.invoke('stop-youtube-stream'),
  onStreamError:      (cb) => ipcRenderer.on('stream-error', (e, ...args) => cb(...args)),
  onStreamStopped:    (cb) => ipcRenderer.on('stream-stopped', (e, ...args) => cb(...args)),

  // ── Authentication & Plan System ─────────────────────────────────────────
  auth: {
    signIn:        (email, pass)              => ipcRenderer.invoke('auth:sign-in', email, pass),
    signUp:        (email, pass, name, plan)  => ipcRenderer.invoke('auth:sign-up', email, pass, name, plan),
    signOut:       ()                         => ipcRenderer.invoke('auth:sign-out'),
    resetPassword: (email)                    => ipcRenderer.invoke('auth:reset-password', email),
    launchApp:     (authResult)               => ipcRenderer.invoke('auth:launch-app', authResult),
    openExternal:  (url)                      => ipcRenderer.invoke('auth:open-external', url),
  },

  plan: {
    getInfo:       ()           => ipcRenderer.invoke('plan:get-info'),       // { plan, user, offline }
    isAllowed:     (feature)    => ipcRenderer.invoke('plan:is-allowed', feature),
    getUsage:      ()           => ipcRenderer.invoke('plan:get-usage'),       // { used, limit, remaining }
    addUsage:      (minutes)    => ipcRenderer.invoke('plan:add-usage', minutes),
    openUpgrade:   ()           => ipcRenderer.invoke('plan:open-upgrade'),
    updatePlan:    (newPlan)    => ipcRenderer.invoke('plan:update-plan', newPlan),
  },
});
