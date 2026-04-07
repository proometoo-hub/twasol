const { app, BrowserWindow, Tray, Menu, shell, ipcMain, Notification } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow = null;
let tray = null;
const FRONTEND_PORT = Number(process.env.FRONTEND_PORT || 4000);
const FRONTEND_HOST = process.env.FRONTEND_HOST || '11.0.0.103';
const FRONTEND_SCHEME = process.env.FRONTEND_SCHEME || 'https';

function resolveFrontendTarget() {
  const bundledIndex = path.join(__dirname, '..', 'frontend', 'build', 'index.html');
  if (fs.existsSync(bundledIndex)) return { type: 'file', value: bundledIndex };
  return { type: 'url', value: `${FRONTEND_SCHEME}://${FRONTEND_HOST}:${FRONTEND_PORT}` };
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    title: 'تواصل برو',
    icon: path.join(__dirname, 'icon.png'),
    autoHideMenuBar: true,
    backgroundColor: '#111b21',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  const target = resolveFrontendTarget();
  const tryLoad = () => {
    if (!mainWindow) return;
    const loader = target.type === 'file' ? mainWindow.loadFile(target.value) : mainWindow.loadURL(target.value);
    loader.catch(() => setTimeout(tryLoad, 1500));
  };
  setTimeout(tryLoad, 1200);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http')) shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.on('close', (e) => {
    if (tray && !app.isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });
  mainWindow.on('closed', () => { mainWindow = null; });
}

function createTray() {
  tray = new Tray(path.join(__dirname, 'icon.png'));
  const menu = Menu.buildFromTemplate([
    { label: 'فتح تواصل برو', click: () => mainWindow && mainWindow.show() },
    { type: 'separator' },
    { label: 'خروج', click: () => { app.isQuitting = true; app.quit(); } },
  ]);
  tray.setToolTip('تواصل برو');
  tray.setContextMenu(menu);
  tray.on('double-click', () => mainWindow && mainWindow.show());
}

ipcMain.on('window-minimize', () => mainWindow && mainWindow.minimize());
ipcMain.on('window-maximize', () => { if (!mainWindow) return; if (mainWindow.isMaximized()) mainWindow.unmaximize(); else mainWindow.maximize(); });
ipcMain.on('window-close', () => mainWindow && mainWindow.close());
ipcMain.on('show-notification', (_e, payload) => {
  if (!Notification.isSupported()) return;
  const notification = new Notification({ title: payload?.title || 'تواصل برو', body: payload?.body || '' });
  notification.show();
});

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();
else {
  app.whenReady().then(() => { createWindow(); createTray(); });
  app.on('second-instance', () => { if (!mainWindow) return; if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.show(); mainWindow.focus(); });
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  app.on('before-quit', () => { app.isQuitting = true; });
}
