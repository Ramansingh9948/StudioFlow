const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');

let httpServer = null;
let wss = null;
let desktopSocket = null;

// [M1] Generate a fresh random session token on every server start.
// The token is embedded into the iPad URL (via QR code) so only devices
// that scanned the code can connect to the WebSocket.
let sessionToken = '';

// [M3] Maximum allowed WebSocket message size: 50 MB
const MAX_MESSAGE_BYTES = 50 * 1024 * 1024;

// [M3] Allowed file types from remote-import messages
const ALLOWED_FILE_TYPES = new Set(['pdf', 'image', 'video']);

// Get local IP Address
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const devName in interfaces) {
    const iface = interfaces[devName];
    for (let i = 0; i < iface.length; i++) {
      const alias = iface[i];
      // Skip loopback and internal addresses, check for IPv4
      if (alias.family === 'IPv4' && alias.address !== '127.0.0.1' && !alias.internal) {
        return alias.address;
      }
    }
  }
  return 'localhost';
}

function startServer(port = 3030) {
  // [M1] Generate a fresh token each time the server starts (each app launch)
  sessionToken = crypto.randomBytes(16).toString('hex');

  return new Promise((resolve, reject) => {
    httpServer = http.createServer((req, res) => {
      // Serve client.html (iPad Draw Board WebApp)
      if (req.url === '/' || req.url.startsWith('/client')) {
        const filePath = path.join(__dirname, 'renderer', 'client.html');
        fs.readFile(filePath, (err, content) => {
          if (err) {
            res.writeHead(500);
            res.end('Error loading client.html');
          } else {
            // Security headers for the web client
            res.writeHead(200, {
              'Content-Type': 'text/html',
              'X-Content-Type-Options': 'nosniff',
              'X-Frame-Options': 'DENY',
            });
            res.end(content, 'utf-8');
          }
        });
      } else {
        res.writeHead(404);
        res.end('Not Found');
      }
    });

    wss = new WebSocketServer({ server: httpServer });

    wss.on('connection', (ws, req) => {
      // req.url can be like "/ws?type=desktop&token=..." or "/ws?type=ipad&token=..."
      const urlObj = new URL(req.url, 'http://localhost');
      const clientType = urlObj.searchParams.get('type') || 'ipad';
      const providedToken = urlObj.searchParams.get('token') || '';

      // [M1] Validate session token — reject any connection without a matching token.
      if (providedToken !== sessionToken) {
        console.warn(`[Security] WebSocket connection rejected: invalid token from ${req.socket.remoteAddress}`);
        ws.close(1008, 'Unauthorized'); // 1008 = Policy Violation
        return;
      }

      if (clientType === 'desktop') {
        desktopSocket = ws;
        console.log('StudioFlow desktop client registered successfully');
      } else {
        console.log('iPad client connected to WebSocket server');
        if (desktopSocket && desktopSocket.readyState === 1) {
          desktopSocket.send(JSON.stringify({ type: 'status', status: 'connected' }));
        }
      }

      ws.on('message', (message) => {
        try {
          // [M3] Enforce maximum message size to prevent memory exhaustion
          if (message.length > MAX_MESSAGE_BYTES) {
            console.warn(`[Security] Oversized WebSocket message rejected (${message.length} bytes) from ${clientType}`);
            ws.send(JSON.stringify({ type: 'error', message: 'Message too large (max 50 MB)' }));
            return;
          }

          const dataStr = message.toString();

          // [M3] Validate remote-import messages from iPad before relaying
          if (clientType !== 'desktop') {
            let parsed;
            try { parsed = JSON.parse(dataStr); } catch(_) { parsed = null; }
            if (parsed && parsed.type === 'remote-import') {
              if (!ALLOWED_FILE_TYPES.has(parsed.fileType)) {
                console.warn('[Security] remote-import rejected: invalid fileType:', parsed.fileType);
                return;
              }
              // Ensure data field is a proper data URI, not a javascript: or other URI
              if (typeof parsed.data !== 'string' || !parsed.data.startsWith('data:')) {
                console.warn('[Security] remote-import rejected: data is not a valid data URI');
                return;
              }
            }
          }

          if (clientType === 'desktop') {
            // Relay from Desktop to all connected iPad slates
            wss.clients.forEach((client) => {
              if (client !== ws && client.readyState === 1) {
                client.send(dataStr);
              }
            });
          } else {
            // Relay from iPad directly to the Desktop client
            if (desktopSocket && desktopSocket.readyState === 1) {
              desktopSocket.send(dataStr);
            }
          }
        } catch(e) {
          console.error('Error handling WebSocket message:', e);
        }
      });

      ws.on('close', () => {
        if (clientType === 'desktop') {
          desktopSocket = null;
        } else {
          console.log('iPad client disconnected');
          if (desktopSocket && desktopSocket.readyState === 1) {
            desktopSocket.send(JSON.stringify({ type: 'status', status: 'disconnected' }));
          }
        }
      });
    });

    httpServer.listen(port, '0.0.0.0', () => {
      const localIP = getLocalIP();
      const localUrl = `http://${localIP}:${port}`;
      // [M1] Embed the session token in the client URL so the QR code encodes it
      const clientUrl = `${localUrl}/client?token=${sessionToken}`;
      console.log(`StudioFlow server running at ${localUrl}`);
      resolve({ port, ip: localIP, url: localUrl, clientUrl, token: sessionToken });
    });

    httpServer.on('error', (err) => {
      reject(err);
    });
  });
}

function stopServer() {
  if (wss) {
    wss.close();
    wss = null;
  }
  if (httpServer) {
    httpServer.close();
    httpServer = null;
  }
  desktopSocket = null;
}

module.exports = {
  startServer,
  stopServer,
  getLocalIP,
};
