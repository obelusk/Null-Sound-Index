// @ts-ignore - runtime ESM path; types come from the package's bare-specifier declarations
import WaveSurfer from '../../node_modules/wavesurfer.js/dist/wavesurfer.esm.js';

const pickFolderBtn = document.getElementById('pick-folder-btn') as HTMLButtonElement;
const currentFolderEl = document.getElementById('current-folder') as HTMLSpanElement;
const treePane = document.getElementById('tree-pane') as HTMLDivElement;
const fileListEl = document.getElementById('file-list') as HTMLUListElement;
const playBtn = document.getElementById('play-btn') as HTMLButtonElement;
const loopBtn = document.getElementById('loop-btn') as HTMLButtonElement;
const nowPlayingEl = document.getElementById('now-playing') as HTMLSpanElement;
const timeDisplayEl = document.getElementById('time-display') as HTMLSpanElement;
const waveformEl = document.getElementById('waveform') as HTMLDivElement;

const settingsOverlay = document.getElementById('settings-overlay') as HTMLDivElement;
const settingAccentColorInput = document.getElementById('setting-accent-color') as HTMLInputElement;
const settingDefaultFolderInput = document.getElementById('setting-default-folder') as HTMLInputElement;
const settingBrowseFolderBtn = document.getElementById('setting-browse-folder-btn') as HTMLButtonElement;
const settingClearFolderBtn = document.getElementById('setting-clear-folder-btn') as HTMLButtonElement;
const settingExpandAllInput = document.getElementById('setting-expand-all') as HTMLInputElement;
const settingHideEmptyFoldersInput = document.getElementById('setting-hide-empty-folders') as HTMLInputElement;
const shortcutsListEl = document.getElementById('shortcuts-list') as HTMLDivElement;
const settingsCancelBtn = document.getElementById('settings-cancel-btn') as HTMLButtonElement;
const settingsSaveBtn = document.getElementById('settings-save-btn') as HTMLButtonElement;

const loadingOverlay = document.getElementById('loading-overlay') as HTMLDivElement;
const firstRunOverlay = document.getElementById('first-run-overlay') as HTMLDivElement;
const firstRunSkipBtn = document.getElementById('first-run-skip-btn') as HTMLButtonElement;
const firstRunChooseBtn = document.getElementById('first-run-choose-btn') as HTMLButtonElement;
const firstRunDontShowAgainInput = document.getElementById('first-run-dont-show-again') as HTMLInputElement;

const licenseOverlay = document.getElementById('license-overlay') as HTMLDivElement;
const licenseCloseBtn = document.getElementById('license-close-btn') as HTMLButtonElement;

const appEl = document.getElementById('app') as HTMLDivElement;
const breadcrumbTextEl = document.getElementById('breadcrumb-text') as HTMLSpanElement;
const exitMinimalBtn = document.getElementById('exit-minimal-btn') as HTMLButtonElement;
const enterMinimalBtn = document.getElementById('enter-minimal-btn') as HTMLButtonElement;

let rootFolder: string | null = null;
let currentDir: string | null = null;
let currentFiles: DirEntry[] = [];
let currentFileIndex = -1;
let currentPlayingFilePath: string | null = null;
const DEFAULT_SHORTCUTS: Shortcuts = {
  playPause: 'Space',
  nextFile: 'ArrowDown',
  prevFile: 'ArrowUp',
  nextFolder: 'ArrowRight',
  prevFolder: 'ArrowLeft',
  toggleLoop: 'KeyL',
  toggleMinimal: 'KeyM',
};

const SHORTCUT_LABELS: { key: keyof Shortcuts; label: string }[] = [
  { key: 'playPause', label: 'Play / Pause' },
  { key: 'nextFile', label: 'Next file' },
  { key: 'prevFile', label: 'Previous file' },
  { key: 'nextFolder', label: 'Next folder' },
  { key: 'prevFolder', label: 'Previous folder' },
  { key: 'toggleLoop', label: 'Toggle loop' },
  { key: 'toggleMinimal', label: 'Toggle minimal mode' },
];

function describeKeyCode(code: string): string {
  if (code === 'Space') return 'Space';
  if (code.startsWith('Arrow')) return code.replace('Arrow', '') + ' Arrow';
  if (code.startsWith('Key')) return code.replace('Key', '');
  if (code.startsWith('Digit')) return code.replace('Digit', '');
  return code;
}

let settings: Settings = {
  accentColor: '#389afc',
  defaultFolder: null,
  expandAllSubfolders: false,
  firstRunPromptDismissed: false,
  hideEmptyFolders: false,
  shortcuts: { ...DEFAULT_SHORTCUTS },
};

const PLAY_ICON =
  '<svg viewBox="0 0 16 16" width="14" height="14"><path d="M3 1.5 L14 8 L3 14.5 Z" fill="currentColor"/></svg>';
const PAUSE_ICON =
  '<svg viewBox="0 0 16 16" width="14" height="14"><rect x="3" y="2" width="3.5" height="12" fill="currentColor"/><rect x="9.5" y="2" width="3.5" height="12" fill="currentColor"/></svg>';

// Files above this size take too long to fully decode with the WebAudio backend
// (needed for sample-accurate waveform sync on short clips), so stream them instead.
const STREAMING_BACKEND_THRESHOLD_BYTES = 3 * 1024 * 1024;

let loopEnabled = false;
let isPlaying = false;
let hasPlayedOnce = false;
let minimalModeEnabled = false;
let wavesurfer: any;
let currentBackend: 'WebAudio' | 'MediaElement' = 'WebAudio';

function createWavesurfer(backend: 'WebAudio' | 'MediaElement') {
  currentBackend = backend;
  wavesurfer = WaveSurfer.create({
    container: waveformEl,
    waveColor: '#9a9a9a',
    progressColor: settings.accentColor,
    cursorColor: settings.accentColor,
    height: minimalModeEnabled ? 70 : 100,
    barWidth: 2,
    barGap: 1,
    backend,
  });

  wavesurfer.on('play', () => {
    isPlaying = true;
    playBtn.innerHTML = PAUSE_ICON;
  });
  wavesurfer.on('pause', () => {
    isPlaying = false;
    playBtn.innerHTML = PLAY_ICON;
  });
  wavesurfer.on('finish', () => {
    if (loopEnabled) {
      wavesurfer.seekTo(0);
      wavesurfer.play();
    } else {
      isPlaying = false;
      playBtn.innerHTML = PLAY_ICON;
    }
  });
  wavesurfer.on('audioprocess', updateTimeDisplay);
  wavesurfer.on('ready', updateTimeDisplay);
}

createWavesurfer('WebAudio');
playBtn.innerHTML = PLAY_ICON;

nowPlayingEl.draggable = true;
nowPlayingEl.addEventListener('dragstart', (e) => {
  e.preventDefault();
  if (currentPlayingFilePath) window.api.startDrag(currentPlayingFilePath);
});

function setLoopEnabled(loop: boolean) {
  loopEnabled = loop;
  loopBtn.classList.toggle('active', loop);
}

window.api.onSetLoop(setLoopEnabled);

loopBtn.addEventListener('click', () => {
  setLoopEnabled(!loopEnabled);
  window.api.setLoop(loopEnabled);
});

function setMinimalModeEnabled(enabled: boolean) {
  minimalModeEnabled = enabled;
  appEl.classList.toggle('minimal', enabled);
  if (enabled) updateBreadcrumb();
  updateTimeDisplay();
  wavesurfer.setOptions({ height: enabled ? 70 : 100 });
}

window.api.onSetMinimalMode(setMinimalModeEnabled);

exitMinimalBtn.addEventListener('click', () => {
  setMinimalModeEnabled(false);
  window.api.setMinimalMode(false);
});

enterMinimalBtn.addEventListener('click', () => {
  setMinimalModeEnabled(true);
  window.api.setMinimalMode(true);
});

function formatTime(seconds: number): string {
  if (!isFinite(seconds)) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function updateTimeDisplay() {
  const duration = wavesurfer.getDuration();
  if (minimalModeEnabled) {
    timeDisplayEl.textContent = formatTime(duration);
  } else {
    const current = wavesurfer.getCurrentTime();
    timeDisplayEl.textContent = `${formatTime(current)} / ${formatTime(duration)}`;
  }
}

interface FolderNode {
  name: string;
  fullPath: string;
  files: DirEntry[];
  children: FolderNode[];
  hasAudio: boolean;
}

let folderTreeRoot: FolderNode | null = null;

async function scanFolderTree(dirPath: string, name: string): Promise<FolderNode> {
  const { entries } = await window.api.readDir(dirPath);
  const files = entries.filter((e) => e.isAudio);
  const subfolderEntries = entries.filter((e) => e.isDirectory);
  const children: FolderNode[] = [];
  let hasAudio = files.length > 0;
  for (const sub of subfolderEntries) {
    const childNode = await scanFolderTree(sub.fullPath, sub.name);
    children.push(childNode);
    if (childNode.hasAudio) hasAudio = true;
  }
  return { name, fullPath: dirPath, files, children, hasAudio };
}

function findNode(node: FolderNode, fullPath: string): FolderNode | null {
  if (node.fullPath === fullPath) return node;
  for (const child of node.children) {
    const found = findNode(child, fullPath);
    if (found) return found;
  }
  return null;
}

function flattenVisibleFolders(node: FolderNode, hideEmpty: boolean): FolderNode[] {
  const result: FolderNode[] = [node];
  for (const child of node.children) {
    if (hideEmpty && !child.hasAudio) continue;
    result.push(...flattenVisibleFolders(child, hideEmpty));
  }
  return result;
}

function renderTreeChildren(node: FolderNode, container: HTMLElement, depth: number, autoExpand: boolean) {
  for (const child of node.children) {
    if (settings.hideEmptyFolders && !child.hasAudio) continue;

    const row = document.createElement('div');
    row.className = 'tree-row';
    row.style.paddingLeft = `${depth * 14 + 4}px`;

    const toggle = document.createElement('span');
    toggle.className = 'tree-toggle';
    toggle.textContent = '▶';

    const label = document.createElement('span');
    label.className = 'tree-label';
    label.textContent = child.name;

    row.appendChild(toggle);
    row.appendChild(label);
    row.dataset.path = child.fullPath;
    container.appendChild(row);

    const childContainer = document.createElement('div');
    childContainer.className = 'tree-children';
    childContainer.style.display = 'none';
    container.appendChild(childContainer);

    let expanded = false;
    let built = false;

    const setExpanded = (value: boolean) => {
      expanded = value;
      toggle.textContent = expanded ? '▼' : '▶';
      toggle.classList.toggle('expanded', expanded);
      childContainer.style.display = expanded ? 'block' : 'none';
      if (expanded && !built) {
        built = true;
        renderTreeChildren(child, childContainer, depth + 1, false);
      }
    };

    toggle.addEventListener('click', (e) => {
      e.stopPropagation();
      setExpanded(!expanded);
    });

    label.addEventListener('click', () => selectDirectory(child.fullPath, row));

    if (autoExpand) setExpanded(true);
  }
}

function renderTree() {
  if (!folderTreeRoot) return;
  treePane.innerHTML = '';
  renderTreeChildren(folderTreeRoot, treePane, 0, settings.expandAllSubfolders);
}

async function openFolder(folder: string) {
  rootFolder = folder;
  currentFolderEl.textContent = folder;
  folderTreeRoot = await scanFolderTree(folder, getFolderName(folder));
  renderTree();
  await selectDirectory(folder);
}

function clearActiveTreeItem() {
  treePane.querySelectorAll('.tree-row.active').forEach((el) => el.classList.remove('active'));
}

async function selectDirectory(dirPath: string, treeItem?: HTMLElement) {
  currentDir = dirPath;
  clearActiveTreeItem();
  if (treeItem) treeItem.classList.add('active');
  updateBreadcrumb();
  const node = folderTreeRoot ? findNode(folderTreeRoot, dirPath) : null;
  currentFiles = node ? node.files : [];
  currentFileIndex = -1;
  renderFileList();
}

function getFolderName(dirPath: string): string {
  const segments = dirPath.split(/[\\/]/).filter(Boolean);
  return segments[segments.length - 1] ?? dirPath;
}

function updateBreadcrumb() {
  breadcrumbTextEl.textContent = currentDir ? getFolderName(currentDir) : '';
}

function renderFileList() {
  fileListEl.innerHTML = '';
  if (currentFiles.length === 0) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = 'No audio files in this folder';
    fileListEl.appendChild(li);
    return;
  }
  currentFiles.forEach((file, index) => {
    const li = document.createElement('li');
    li.textContent = file.name;
    li.dataset.index = String(index);
    li.draggable = true;
    li.addEventListener('click', () => playFile(index));
    li.addEventListener('dragstart', (e) => {
      e.preventDefault();
      window.api.startDrag(file.fullPath);
    });
    fileListEl.appendChild(li);
  });
}

function highlightCurrentFile() {
  fileListEl.querySelectorAll('li').forEach((li) => {
    li.classList.toggle('active', Number((li as HTMLElement).dataset.index) === currentFileIndex);
  });
}

async function playFile(index: number) {
  const file = currentFiles[index];
  if (!file) return;
  const shouldAutoplay = !hasPlayedOnce || isPlaying;
  hasPlayedOnce = true;
  currentFileIndex = index;
  currentPlayingFilePath = file.fullPath;
  highlightCurrentFile();
  nowPlayingEl.textContent = file.name;
  const url = window.api.toFileUrl(file.fullPath);
  const desiredBackend: 'WebAudio' | 'MediaElement' =
    file.size > STREAMING_BACKEND_THRESHOLD_BYTES ? 'MediaElement' : 'WebAudio';
  if (desiredBackend !== currentBackend) {
    wavesurfer.pause();
    wavesurfer.destroy();
    createWavesurfer(desiredBackend);
  } else {
    wavesurfer.stop();
  }
  console.log('Loading audio URL:', url);
  try {
    await wavesurfer.load(url);
    wavesurfer.seekTo(0);
    if (shouldAutoplay) {
      await wavesurfer.play();
    } else {
      isPlaying = false;
      playBtn.innerHTML = PLAY_ICON;
    }
  } catch (err) {
    console.error('Failed to load/play audio:', err);
  }
}

function playNext() {
  if (currentFiles.length === 0) return;
  const next = (currentFileIndex + 1) % currentFiles.length;
  playFile(next);
}

function playPrevious() {
  if (currentFiles.length === 0) return;
  const prev = (currentFileIndex - 1 + currentFiles.length) % currentFiles.length;
  playFile(prev);
}

async function navigateFolder(direction: 1 | -1) {
  if (!currentDir || !folderTreeRoot) return;
  const flatFolders = flattenVisibleFolders(folderTreeRoot, settings.hideEmptyFolders);
  const startIndex = flatFolders.findIndex((n) => n.fullPath === currentDir);
  if (startIndex === -1 || flatFolders.length === 0) return;

  let index = startIndex;
  let target: FolderNode | null = null;
  for (let i = 0; i < flatFolders.length; i++) {
    index = (index + direction + flatFolders.length) % flatFolders.length;
    if (flatFolders[index].files.length > 0) {
      target = flatFolders[index];
      break;
    }
  }
  if (!target) return;

  const matchingRow = treePane.querySelector<HTMLElement>(`.tree-row[data-path="${CSS.escape(target.fullPath)}"]`);
  await selectDirectory(target.fullPath, matchingRow ?? undefined);
  if (currentFiles.length > 0) {
    await playFile(0);
  }
}

playBtn.addEventListener('click', () => {
  if (currentFileIndex === -1 && currentFiles.length > 0) {
    playFile(0);
  } else {
    wavesurfer.playPause();
  }
});

pickFolderBtn.addEventListener('click', async () => {
  const folder = await window.api.pickFolder();
  if (!folder) return;
  await openFolder(folder);
});

document.addEventListener('keydown', (e) => {
  const target = e.target as HTMLElement;
  if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
  if (!settingsOverlay.classList.contains('hidden')) return;
  if (!licenseOverlay.classList.contains('hidden')) return;

  const code = e.code;
  const shortcuts = settings.shortcuts;

  if (code === 'Escape' && minimalModeEnabled) {
    e.preventDefault();
    setMinimalModeEnabled(false);
    window.api.setMinimalMode(false);
  } else if (code === shortcuts.playPause) {
    e.preventDefault();
    if (currentFileIndex === -1 && currentFiles.length > 0) {
      playFile(0);
    } else {
      wavesurfer.playPause();
    }
  } else if (code === shortcuts.nextFile) {
    e.preventDefault();
    playNext();
  } else if (code === shortcuts.prevFile) {
    e.preventDefault();
    playPrevious();
  } else if (code === shortcuts.nextFolder) {
    e.preventDefault();
    navigateFolder(1);
  } else if (code === shortcuts.prevFolder) {
    e.preventDefault();
    navigateFolder(-1);
  } else if (code === shortcuts.toggleLoop) {
    e.preventDefault();
    setLoopEnabled(!loopEnabled);
    window.api.setLoop(loopEnabled);
  } else if (code === shortcuts.toggleMinimal) {
    e.preventDefault();
    setMinimalModeEnabled(!minimalModeEnabled);
    window.api.setMinimalMode(minimalModeEnabled);
  }
});

function applyAccentColor(color: string) {
  document.documentElement.style.setProperty('--accent-color', color);
  wavesurfer.setOptions({ progressColor: color, cursorColor: color });
}

let pendingShortcuts: Shortcuts = { ...settings.shortcuts };
let cancelShortcutCapture: (() => void) | null = null;

function renderShortcutsList() {
  if (cancelShortcutCapture) {
    cancelShortcutCapture();
    cancelShortcutCapture = null;
  }
  shortcutsListEl.innerHTML = '';
  for (const { key, label } of SHORTCUT_LABELS) {
    const row = document.createElement('div');
    row.className = 'shortcut-row';

    const labelEl = document.createElement('span');
    labelEl.textContent = label;

    const keyBtn = document.createElement('button');
    keyBtn.type = 'button';
    keyBtn.className = 'shortcut-key-btn';
    keyBtn.textContent = describeKeyCode(pendingShortcuts[key]);

    keyBtn.addEventListener('click', () => {
      if (cancelShortcutCapture) cancelShortcutCapture();

      keyBtn.classList.add('listening');
      keyBtn.textContent = 'Press a key…';

      const captureKey = (e: KeyboardEvent) => {
        e.preventDefault();
        if (e.code === 'Escape') {
          keyBtn.textContent = describeKeyCode(pendingShortcuts[key]);
        } else {
          pendingShortcuts[key] = e.code;
          keyBtn.textContent = describeKeyCode(e.code);
        }
        keyBtn.classList.remove('listening');
        window.removeEventListener('keydown', captureKey, true);
        cancelShortcutCapture = null;
      };

      cancelShortcutCapture = () => {
        keyBtn.classList.remove('listening');
        keyBtn.textContent = describeKeyCode(pendingShortcuts[key]);
        window.removeEventListener('keydown', captureKey, true);
      };

      window.addEventListener('keydown', captureKey, true);
    });

    row.appendChild(labelEl);
    row.appendChild(keyBtn);
    shortcutsListEl.appendChild(row);
  }
}

function openSettingsModal() {
  settingAccentColorInput.value = settings.accentColor;
  settingDefaultFolderInput.value = settings.defaultFolder ?? '';
  settingExpandAllInput.checked = settings.expandAllSubfolders;
  settingHideEmptyFoldersInput.checked = settings.hideEmptyFolders;
  pendingShortcuts = { ...settings.shortcuts };
  renderShortcutsList();
  settingsOverlay.classList.remove('hidden');
}

function closeSettingsModal() {
  if (cancelShortcutCapture) {
    cancelShortcutCapture();
    cancelShortcutCapture = null;
  }
  settingsOverlay.classList.add('hidden');
}

settingBrowseFolderBtn.addEventListener('click', async () => {
  const folder = await window.api.pickFolder();
  if (folder) settingDefaultFolderInput.value = folder;
});

settingClearFolderBtn.addEventListener('click', () => {
  settingDefaultFolderInput.value = '';
});

settingsCancelBtn.addEventListener('click', closeSettingsModal);

settingsSaveBtn.addEventListener('click', async () => {
  settings = await window.api.saveSettings({
    ...settings,
    accentColor: settingAccentColorInput.value,
    defaultFolder: settingDefaultFolderInput.value || null,
    expandAllSubfolders: settingExpandAllInput.checked,
    hideEmptyFolders: settingHideEmptyFoldersInput.checked,
    shortcuts: pendingShortcuts,
  });
  applyAccentColor(settings.accentColor);
  renderTree();
  closeSettingsModal();
});

window.api.onOpenSettings(openSettingsModal);

window.api.onOpenLicense(() => {
  licenseOverlay.classList.remove('hidden');
});

licenseCloseBtn.addEventListener('click', () => {
  licenseOverlay.classList.add('hidden');
});

async function dismissFirstRunPrompt() {
  firstRunOverlay.classList.add('hidden');
  if (firstRunDontShowAgainInput.checked) {
    settings = await window.api.saveSettings({ ...settings, firstRunPromptDismissed: true });
  }
}

firstRunSkipBtn.addEventListener('click', dismissFirstRunPrompt);

firstRunChooseBtn.addEventListener('click', async () => {
  const folder = await window.api.pickFolder();
  if (folder) {
    settings = await window.api.saveSettings({ ...settings, defaultFolder: folder });
    await openFolder(folder);
  }
  await dismissFirstRunPrompt();
});

(async function init() {
  settings = await window.api.getSettings();
  applyAccentColor(settings.accentColor);
  if (settings.defaultFolder) {
    await openFolder(settings.defaultFolder);
  }
  loadingOverlay.classList.add('hidden');
  if (!settings.defaultFolder && !settings.firstRunPromptDismissed) {
    firstRunOverlay.classList.remove('hidden');
  }
})();
