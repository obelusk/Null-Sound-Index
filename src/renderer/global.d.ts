declare global {
  interface DirEntry {
    name: string;
    fullPath: string;
    isDirectory: boolean;
    isAudio: boolean;
    size: number;
  }

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

  interface SoundIndexApi {
    pickFolder(): Promise<string | null>;
    readDir(dirPath: string): Promise<{ entries: DirEntry[]; error?: string }>;
    toFileUrl(filePath: string): string;
    getSettings(): Promise<Settings>;
    saveSettings(settings: Settings): Promise<Settings>;
    onOpenSettings(callback: () => void): void;
    onOpenLicense(callback: () => void): void;
    onSetLoop(callback: (loop: boolean) => void): void;
    setLoop(loop: boolean): void;
    startDrag(filePath: string): void;
    onSetMinimalMode(callback: (minimal: boolean) => void): void;
    setMinimalMode(minimal: boolean): void;
  }

  interface Window {
    api: SoundIndexApi;
  }
}

export {};
