import { app, BrowserWindow, ipcMain, dialog, protocol, net, Menu, nativeImage } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { pathToFileURL } from 'url';
import { autoUpdater } from 'electron-updater';

const AUDIO_EXTENSIONS = new Set(['.mp3', '.wav', '.ogg', '.flac', '.m4a', '.aac', '.wma', '.aiff', '.opus']);

interface Shortcuts {
  playPause: string;
  nextFile: string;
  prevFile: string;
  nextFolder: string;
  prevFolder: string;
  toggleLoop: string;
  toggleMinimal: string;
}

interface Settings {
  accentColor: string;
  defaultFolder: string | null;
  expandAllSubfolders: boolean;
  firstRunPromptDismissed: boolean;
  hideEmptyFolders: boolean;
  shortcuts: Shortcuts;
}

const DEFAULT_SHORTCUTS: Shortcuts = {
  playPause: 'Space',
  nextFile: 'ArrowDown',
  prevFile: 'ArrowUp',
  nextFolder: 'ArrowRight',
  prevFolder: 'ArrowLeft',
  toggleLoop: 'KeyL',
  toggleMinimal: 'KeyM',
};

const DEFAULT_SETTINGS: Settings = {
  accentColor: '#389afc',
  defaultFolder: null,
  expandAllSubfolders: false,
  firstRunPromptDismissed: false,
  hideEmptyFolders: false,
  shortcuts: DEFAULT_SHORTCUTS,
};

const settingsPath = path.join(app.getPath('userData'), 'settings.json');

function loadSettings(): Settings {
  try {
    const raw = fs.readFileSync(settingsPath, 'utf-8');
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      shortcuts: { ...DEFAULT_SHORTCUTS, ...parsed.shortcuts },
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings(settings: Settings) {
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
}

let mainWindow: BrowserWindow | null = null;
let normalBounds: { x: number; y: number; width: number; height: number } | null = null;

const MINIMAL_MODE_WIDTH = 380;
const MINIMAL_MODE_HEIGHT = 390;

function applyMinimalMode(minimal: boolean) {
  if (!mainWindow) return;
  if (minimal) {
    if (!normalBounds) normalBounds = mainWindow.getBounds();
    mainWindow.setResizable(true);
    mainWindow.setBounds({
      x: normalBounds.x,
      y: normalBounds.y,
      width: MINIMAL_MODE_WIDTH,
      height: MINIMAL_MODE_HEIGHT,
    });
    mainWindow.setResizable(false);
  } else {
    mainWindow.setResizable(true);
    if (normalBounds) {
      mainWindow.setBounds(normalBounds);
      normalBounds = null;
    }
  }
}

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'soundfile',
    privileges: { secure: true, supportFetchAPI: true, stream: true, corsEnabled: true },
  },
]);

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    title: 'Null Sound Index',
    backgroundColor: '#1e1e1e',
    show: false,
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow?.show());

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  mainWindow.webContents.on('console-message', (_event, _level, message) => {
    console.log('[renderer]', message);
  });

  if (process.env.OPEN_DEVTOOLS) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  const menu = Menu.buildFromTemplate([
    {
      label: 'File',
      submenu: [
        {
          label: 'User Settings',
          click: () => mainWindow?.webContents.send('open-settings'),
        },
        {
          label: 'License',
          click: () => mainWindow?.webContents.send('open-license'),
        },
        { type: 'separator' },
        {
          label: 'Check for Updates…',
          click: () => checkForUpdates(true),
        },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'Playback',
      submenu: [
        {
          label: 'Loop',
          type: 'checkbox',
          checked: false,
          id: 'loop-menu-item',
          click: (menuItem) => mainWindow?.webContents.send('set-loop', menuItem.checked),
        },
      ],
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Minimal Mode',
          type: 'checkbox',
          checked: false,
          id: 'minimal-mode-menu-item',
          click: (menuItem) => {
            applyMinimalMode(menuItem.checked);
            mainWindow?.webContents.send('set-minimal-mode', menuItem.checked);
          },
        },
      ],
    },
  ]);
  Menu.setApplicationMenu(menu);

  ipcMain.on('loop-changed', (_event, loop: boolean) => {
    const loopMenuItem = menu.getMenuItemById('loop-menu-item');
    if (loopMenuItem) loopMenuItem.checked = loop;
  });

  ipcMain.on('minimal-mode-changed', (_event, minimal: boolean) => {
    const minimalModeMenuItem = menu.getMenuItemById('minimal-mode-menu-item');
    if (minimalModeMenuItem) minimalModeMenuItem.checked = minimal;
    applyMinimalMode(minimal);
  });
}

autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = false;

autoUpdater.on('update-available', (info) => {
  if (!mainWindow) return;
  dialog
    .showMessageBox(mainWindow, {
      type: 'info',
      title: 'Update Available',
      message: `A new version of Null Sound Index is available (${info.version}).`,
      detail: 'Would you like to download and install it now?',
      buttons: ['Download & Install', 'Not Now'],
      defaultId: 0,
      cancelId: 1,
    })
    .then((result) => {
      if (result.response === 0) autoUpdater.downloadUpdate();
    });
});

autoUpdater.on('update-not-available', () => {
  if (checkingForUpdatesManually && mainWindow) {
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'No Updates Available',
      message: "You're running the latest version of Null Sound Index.",
    });
  }
  checkingForUpdatesManually = false;
});

autoUpdater.on('error', (err) => {
  console.error('[autoUpdater]', err);
  if (checkingForUpdatesManually && mainWindow) {
    dialog.showMessageBox(mainWindow, {
      type: 'error',
      title: 'Update Check Failed',
      message: 'Could not check for updates.',
      detail: String(err?.message ?? err),
    });
  }
  checkingForUpdatesManually = false;
});

autoUpdater.on('update-downloaded', (info) => {
  if (!mainWindow) return;
  dialog
    .showMessageBox(mainWindow, {
      type: 'info',
      title: 'Update Ready',
      message: `Version ${info.version} has been downloaded.`,
      detail: 'Restart Null Sound Index now to apply the update?',
      buttons: ['Restart Now', 'Later'],
      defaultId: 0,
      cancelId: 1,
    })
    .then((result) => {
      if (result.response === 0) autoUpdater.quitAndInstall();
    });
});

let checkingForUpdatesManually = false;

function checkForUpdates(manual: boolean) {
  checkingForUpdatesManually = manual;
  autoUpdater.checkForUpdates().catch((err) => {
    console.error('[autoUpdater] checkForUpdates failed', err);
    checkingForUpdatesManually = false;
  });
}

app.whenReady().then(() => {
  protocol.handle('soundfile', (request) => {
    const encodedPath = request.url.slice('soundfile://'.length).replace(/\/$/, '');
    const filePath = decodeURIComponent(encodedPath);
    return net.fetch(pathToFileURL(filePath).toString());
  });
  createWindow();
  if (app.isPackaged) {
    checkForUpdates(false);
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

interface DirEntry {
  name: string;
  fullPath: string;
  isDirectory: boolean;
  isAudio: boolean;
  size: number;
}

function readDir(dirPath: string): DirEntry[] {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  return entries
    .map((entry) => {
      const fullPath = path.join(dirPath, entry.name);
      const isDirectory = entry.isDirectory();
      const ext = path.extname(entry.name).toLowerCase();
      const isAudio = !isDirectory && AUDIO_EXTENSIONS.has(ext);
      const size = isAudio ? fs.statSync(fullPath).size : 0;
      return {
        name: entry.name,
        fullPath,
        isDirectory,
        isAudio,
        size,
      };
    })
    .filter((e) => e.isDirectory || e.isAudio)
    .sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
}

ipcMain.handle('pick-folder', async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

ipcMain.handle('read-dir', (_event, dirPath: string) => {
  try {
    return { entries: readDir(dirPath) };
  } catch (err: any) {
    return { entries: [], error: err.message };
  }
});

const dragIcon = nativeImage.createFromPath(path.join(__dirname, '..', 'build', 'icon.png')).resize({
  width: 48,
  height: 48,
});

ipcMain.on('start-drag', (event, filePath: string) => {
  event.sender.startDrag({
    file: filePath,
    icon: dragIcon,
  });
});

ipcMain.handle('get-settings', () => loadSettings());

ipcMain.handle('save-settings', (_event, settings: Settings) => {
  saveSettings(settings);
  return settings;
});
