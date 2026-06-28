const fs = require('node:fs/promises');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { app, BrowserWindow, globalShortcut, ipcMain, screen } = require('electron');

const MAPS = Object.freeze({
  shalulu: {
    id: 'shalulu',
    label: '夏露露村',
    filename: 'shalulu-worldmap.json'
  },
  xinaya: {
    id: 'xinaya',
    label: '新芽山谷',
    filename: 'xinaya-worldmap.json'
  },
  fulisi: {
    id: 'fulisi',
    label: '弗利斯',
    filename: 'fulisi-worldmap.json'
  }
});

let overlayWindow = null;
let isInteractive = false;
let visionProcess = null;
const runtimeDir = path.join(__dirname, 'runtime');
const logPath = path.join(runtimeDir, 'overlay.log');
const projectRoot = path.resolve(__dirname, '..');
const visionScriptPath = path.join(__dirname, 'vision', 'vision_server.py');
const visionRequirementsPath = path.join(__dirname, 'vision', 'requirements.txt');
const pythonCommand = process.env.PYTHON || 'python';

async function logOverlay(message) {
  try {
    await fs.mkdir(runtimeDir, { recursive: true });
    await fs.appendFile(logPath, `[${new Date().toISOString()}] ${message}\n`, 'utf8');
  } catch (_error) {
    // Logging must never break the overlay itself.
  }
}

function getDatasetPath(mapId) {
  const meta = MAPS[mapId];
  if (!meta) {
    throw new Error(`Unsupported map id: ${mapId}`);
  }
  return path.resolve(__dirname, '..', 'data', 'official', meta.filename);
}

function sendVisionEvent(payload) {
  if (!overlayWindow || overlayWindow.isDestroyed()) return;
  overlayWindow.webContents.send('vision:event', payload);
}

function splitLines(buffer, chunk, onLine) {
  let text = buffer + chunk.toString('utf8');
  const lines = text.split(/\r?\n/);
  const nextBuffer = lines.pop() || '';
  lines.forEach(line => {
    const trimmed = line.trim();
    if (trimmed) onLine(trimmed);
  });
  return nextBuffer;
}

function runVisionCommand(args, options = {}) {
  const timeoutMs = options.timeoutMs || 30000;
  return new Promise(resolve => {
    const child = spawn(pythonCommand, [
      visionScriptPath,
      '--project-root',
      projectRoot,
      ...args
    ], {
      cwd: __dirname,
      windowsHide: true
    });

    const events = [];
    const stderr = [];
    let stdoutBuffer = '';
    let stderrBuffer = '';
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill();
      resolve({ ok: false, events, error: `timeout after ${timeoutMs}ms`, stderr: stderr.join('\n') });
    }, timeoutMs);

    child.stdout.on('data', chunk => {
      stdoutBuffer = splitLines(stdoutBuffer, chunk, line => {
        try {
          events.push(JSON.parse(line));
        } catch (_error) {
          events.push({ type: 'log', line });
        }
      });
    });
    child.stderr.on('data', chunk => {
      stderrBuffer = splitLines(stderrBuffer, chunk, line => stderr.push(line));
    });
    child.on('error', error => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ ok: false, events, error: error.message, stderr: stderr.join('\n') });
    });
    child.on('close', code => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (stdoutBuffer.trim()) {
        try {
          events.push(JSON.parse(stdoutBuffer.trim()));
        } catch (_error) {
          events.push({ type: 'log', line: stdoutBuffer.trim() });
        }
      }
      if (stderrBuffer.trim()) stderr.push(stderrBuffer.trim());
      resolve({
        ok: code === 0,
        code,
        events,
        result: events[events.length - 1] || null,
        stderr: stderr.join('\n')
      });
    });
  });
}

async function stopVisionProcess() {
  if (!visionProcess) return { stopped: false };
  const processToStop = visionProcess;
  visionProcess = null;
  processToStop.kill();
  sendVisionEvent({ type: 'status', status: 'stopped', message: '自动校准已停止' });
  return { stopped: true };
}

function startVisionProcess({ mapId, windowId, mode }) {
  stopVisionProcess();
  const interval = mode === 'real-time' ? '0.12' : '0.25';
  const child = spawn(pythonCommand, [
    visionScriptPath,
    '--project-root',
    projectRoot,
    'track',
    '--map-id',
    mapId,
    '--window-id',
    String(windowId),
    '--interval',
    interval
  ], {
    cwd: __dirname,
    windowsHide: true
  });

  visionProcess = child;
  let stdoutBuffer = '';
  let stderrBuffer = '';
  sendVisionEvent({ type: 'status', status: 'starting', mapId, message: '正在启动自动校准' });

  child.stdout.on('data', chunk => {
    stdoutBuffer = splitLines(stdoutBuffer, chunk, line => {
      try {
        sendVisionEvent(JSON.parse(line));
      } catch (_error) {
        sendVisionEvent({ type: 'log', line });
      }
    });
  });
  child.stderr.on('data', chunk => {
    stderrBuffer = splitLines(stderrBuffer, chunk, line => {
      logOverlay(`vision stderr ${line}`);
      sendVisionEvent({ type: 'log', level: 'stderr', line });
    });
  });
  child.on('error', error => {
    if (visionProcess === child) visionProcess = null;
    sendVisionEvent({ type: 'status', status: 'error', mapId, message: error.message });
  });
  child.on('close', code => {
    if (stdoutBuffer.trim()) {
      try {
        sendVisionEvent(JSON.parse(stdoutBuffer.trim()));
      } catch (_error) {
        sendVisionEvent({ type: 'log', line: stdoutBuffer.trim() });
      }
    }
    if (stderrBuffer.trim()) {
      logOverlay(`vision stderr ${stderrBuffer.trim()}`);
    }
    if (visionProcess === child) visionProcess = null;
    sendVisionEvent({ type: 'status', status: code === 0 ? 'stopped' : 'error', mapId, message: `自动校准进程已退出 (${code})` });
  });

  return { started: true, pid: child.pid, interval: Number(interval) };
}

function sendInteractionState() {
  if (!overlayWindow || overlayWindow.isDestroyed()) return;
  overlayWindow.webContents.send('overlay:interaction-changed', { interactive: isInteractive });
}

function setInteractionMode(nextInteractive) {
  isInteractive = Boolean(nextInteractive);
  if (!overlayWindow || overlayWindow.isDestroyed()) return;

  overlayWindow.setIgnoreMouseEvents(!isInteractive, { forward: true });
  overlayWindow.setAlwaysOnTop(true, 'screen-saver');
  logOverlay(`interaction=${isInteractive ? 'interactive' : 'passthrough'}`);
  sendInteractionState();
}

function toggleInteractionMode() {
  setInteractionMode(!isInteractive);
}

function createOverlayWindow() {
  const display = screen.getPrimaryDisplay();
  const { x, y, width, height } = display.bounds;

  overlayWindow = new BrowserWindow({
    x,
    y,
    width,
    height,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  overlayWindow.setMenuBarVisibility(false);
  overlayWindow.setAlwaysOnTop(true, 'screen-saver');
  overlayWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  overlayWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    logOverlay(`renderer console level=${level} ${sourceId}:${line} ${message}`);
  });
  overlayWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    logOverlay(`did-fail-load code=${errorCode} desc=${errorDescription} url=${validatedURL}`);
  });
  overlayWindow.webContents.on('render-process-gone', (_event, details) => {
    logOverlay(`render-process-gone reason=${details.reason} exitCode=${details.exitCode}`);
  });

  overlayWindow.once('ready-to-show', () => {
    overlayWindow.show();
    setInteractionMode(true);
    if (process.argv.includes('--devtools')) {
      overlayWindow.webContents.openDevTools({ mode: 'detach' });
    }
  });

  overlayWindow.on('closed', () => {
    overlayWindow = null;
  });
}

ipcMain.handle('overlay:list-maps', () => Object.values(MAPS));

ipcMain.handle('overlay:load-dataset', async (_event, mapId) => {
  const datasetPath = getDatasetPath(mapId);
  const raw = await fs.readFile(datasetPath, 'utf8');
  return JSON.parse(raw);
});

ipcMain.handle('overlay:get-interaction', () => ({ interactive: isInteractive }));
ipcMain.handle('overlay:set-interaction', (_event, interactive) => {
  setInteractionMode(interactive);
  return { interactive: isInteractive };
});
ipcMain.handle('overlay:toggle-interaction', () => {
  toggleInteractionMode();
  return { interactive: isInteractive };
});
ipcMain.handle('overlay:quit', () => {
  app.quit();
});

ipcMain.handle('vision:check-deps', async () => {
  const result = await runVisionCommand(['check-deps']);
  return result.result || { type: 'deps', ok: false, missing: [], error: result.error || result.stderr || '检查失败' };
});

ipcMain.handle('vision:install-deps', async () => {
  sendVisionEvent({ type: 'install', state: 'starting', message: '正在安装视觉依赖' });
  const child = spawn(pythonCommand, ['-m', 'pip', 'install', '-r', visionRequirementsPath], {
    cwd: __dirname,
    windowsHide: true
  });
  const logs = [];
  let stdoutBuffer = '';
  let stderrBuffer = '';
  return new Promise(resolve => {
    child.stdout.on('data', chunk => {
      stdoutBuffer = splitLines(stdoutBuffer, chunk, line => {
        logs.push(line);
        sendVisionEvent({ type: 'install-log', stream: 'stdout', line });
      });
    });
    child.stderr.on('data', chunk => {
      stderrBuffer = splitLines(stderrBuffer, chunk, line => {
        logs.push(line);
        sendVisionEvent({ type: 'install-log', stream: 'stderr', line });
      });
    });
    child.on('error', error => {
      sendVisionEvent({ type: 'install', state: 'error', message: error.message });
      resolve({ ok: false, error: error.message, logs });
    });
    child.on('close', async code => {
      if (stdoutBuffer.trim()) logs.push(stdoutBuffer.trim());
      if (stderrBuffer.trim()) logs.push(stderrBuffer.trim());
      const deps = await runVisionCommand(['check-deps']);
      const payload = {
        ok: code === 0 && Boolean(deps.result && deps.result.ok),
        code,
        logs,
        deps: deps.result || null
      };
      sendVisionEvent({ type: 'install', state: payload.ok ? 'ready' : 'error', message: payload.ok ? '视觉依赖已安装' : '视觉依赖安装失败', payload });
      resolve(payload);
    });
  });
});

ipcMain.handle('vision:list-windows', async () => {
  const result = await runVisionCommand(['list-windows']);
  const event = result.events.find(item => item.type === 'windows');
  if (event) {
    const windows = event.windows.filter(item => item.title !== '蓝色星原点位覆盖层');
    return { ok: true, windows };
  }
  return { ok: false, windows: [], error: result.error || result.stderr || result.result?.message || '窗口列表读取失败' };
});

ipcMain.handle('vision:build-cache', async (_event, mapId) => {
  sendVisionEvent({ type: 'cache-progress', mapId, state: 'starting', message: '开始构建地图缓存' });
  const child = spawn(pythonCommand, [
    visionScriptPath,
    '--project-root',
    projectRoot,
    'build-cache',
    '--map-id',
    mapId
  ], {
    cwd: __dirname,
    windowsHide: true
  });
  const events = [];
  let stdoutBuffer = '';
  let stderrBuffer = '';

  return new Promise(resolve => {
    child.stdout.on('data', chunk => {
      stdoutBuffer = splitLines(stdoutBuffer, chunk, line => {
        let payload;
        try {
          payload = JSON.parse(line);
        } catch (_error) {
          payload = { type: 'log', line };
        }
        events.push(payload);
        sendVisionEvent(payload);
      });
    });
    child.stderr.on('data', chunk => {
      stderrBuffer = splitLines(stderrBuffer, chunk, line => {
        logOverlay(`cache stderr ${line}`);
        sendVisionEvent({ type: 'log', level: 'stderr', line });
      });
    });
    child.on('error', error => {
      sendVisionEvent({ type: 'cache-progress', mapId, state: 'error', message: error.message });
      resolve({ ok: false, error: error.message, events });
    });
    child.on('close', code => {
      if (stdoutBuffer.trim()) {
        try {
          const payload = JSON.parse(stdoutBuffer.trim());
          events.push(payload);
          sendVisionEvent(payload);
        } catch (_error) {
          events.push({ type: 'log', line: stdoutBuffer.trim() });
        }
      }
      if (stderrBuffer.trim()) logOverlay(`cache stderr ${stderrBuffer.trim()}`);
      const finalEvent = events.findLast ? events.findLast(item => item.type === 'cache') : [...events].reverse().find(item => item.type === 'cache');
      resolve({ ok: code === 0 && Boolean(finalEvent?.ok), code, event: finalEvent || null, events });
    });
  });
});

ipcMain.handle('vision:start', async (_event, options) => {
  if (!options || !options.mapId || !options.windowId) {
    return { started: false, error: 'mapId and windowId are required' };
  }
  return startVisionProcess(options);
});

ipcMain.handle('vision:stop', async () => stopVisionProcess());

app.whenReady().then(() => {
  createOverlayWindow();
  globalShortcut.register('CommandOrControl+Shift+O', toggleInteractionMode);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createOverlayWindow();
    }
  });
});

app.on('will-quit', () => {
  if (visionProcess) {
    visionProcess.kill();
    visionProcess = null;
  }
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  app.quit();
});
