const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('SF', {
  getSources:     ()       => ipcRenderer.invoke('get-sources'),
  saveRecording:  (d)      => ipcRenderer.invoke('save-recording', d),
  openFile:       (o)      => ipcRenderer.invoke('open-file', o),
  readFileB64:    (p)      => ipcRenderer.invoke('read-file-b64', p),
  openFinder:     (p)      => ipcRenderer.invoke('open-finder', p),
  getDirs:        ()       => ipcRenderer.invoke('get-dirs'),
  
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
});
