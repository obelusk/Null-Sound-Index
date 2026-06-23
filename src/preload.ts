import { contextBridge, ipcRenderer } from 'electron';

export interface DirEntry {
  name: string;
  fullPath: string;
  isDirectory: boolean;
  isAudio: boolean;
  size: number;
}

export interface Shortcuts {
  playPause: string;
  nextFile: string;
  prevFile: string;
  nextFolder: string;
  prevFolder: string;
  toggleLoop: string;
  toggleMinimal: string;
}

export interface Settings {
  accentColor: string;
  defaultFolder: string | null;
  expandAllSubfolders: boolean;
  firstRunPromptDismissed: boolean;
  hideEmptyFolders: boolean;
  shortcuts: Shortcuts;
}

contextBridge.exposeInMainWorld('api', {
  pickFolder: (): Promise<string | null> => ipcRenderer.invoke('pick-folder'),
  readDir: (dirPath: string): Promise<{ entries: DirEntry[]; error?: string }> =>
    ipcRenderer.invoke('read-dir', dirPath),
  toFileUrl: (filePath: string): string => `soundfile://${encodeURIComponent(filePath)}`,
  getSettings: (): Promise<Settings> => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings: Settings): Promise<Settings> => ipcRenderer.invoke('save-settings', settings),
  onOpenSettings: (callback: () => void) => ipcRenderer.on('open-settings', callback),
  onOpenLicense: (callback: () => void) => ipcRenderer.on('open-license', callback),
  onSetLoop: (callback: (loop: boolean) => void) =>
    ipcRenderer.on('set-loop', (_event, loop: boolean) => callback(loop)),
  setLoop: (loop: boolean) => ipcRenderer.send('loop-changed', loop),
  startDrag: (filePath: string) => ipcRenderer.send('start-drag', filePath),
  onSetMinimalMode: (callback: (minimal: boolean) => void) =>
    ipcRenderer.on('set-minimal-mode', (_event, minimal: boolean) => callback(minimal)),
  setMinimalMode: (minimal: boolean) => ipcRenderer.send('minimal-mode-changed', minimal),
});
