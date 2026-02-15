import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import fs from 'node:fs';

import {
  app,
  BrowserWindow,
  nativeImage,
  nativeTheme,
  protocol,
  net,
  Menu,
  type MenuItemConstructorOptions
} from 'electron';

import type { StudioConfigPublic, StudioMenuCommand } from '../shared/types.js';
import { ConfigStore } from './studio/config.js';
import { StudioDatabase } from './studio/db.js';
import { GeminiClient } from './studio/gemini-client.js';
import { ImageStore } from './studio/image-store.js';
import { registerStudioIpcHandlers } from './studio/ipc.js';
import { ensureStudioDirectories, isAbsoluteStudioPath, STUDIO_PATHS } from './studio/paths.js';
import { GenerationQueue } from './studio/queue.js';

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'studio',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true
    }
  }
]);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow: BrowserWindow | null = null;
let database: StudioDatabase | null = null;
let liquidGlassSupport: boolean | null = null;
let currentConfig: StudioConfigPublic | null = null;

async function createMainWindow(): Promise<BrowserWindow> {
  const isMac = process.platform === 'darwin';
  const isWindows = process.platform === 'win32';
  const isLiquidGlassSupported = isMac ? await getLiquidGlassSupport() : false;

  const windowIconPath = resolveAppIconPath(
    process.platform === 'win32'
      ? ['app-icon.ico', 'app-icon.png', 'app-icon.jpg', 'app-icon.jpeg']
      : ['app-icon.png', 'app-icon.jpg', 'app-icon.jpeg']
  );

  const window = new BrowserWindow({
    width: 1480,
    height: 920,
    minWidth: 1180,
    minHeight: 720,
    backgroundColor: isMac ? '#00000000' : '#0A0A0B',
    titleBarStyle: isMac ? 'hiddenInset' : 'default',
    ...(isMac
      ? {
          // Keep mac windows alpha-capable even when liquid glass is unavailable.
          transparent: true,
          ...(isLiquidGlassSupported
            ? {}
            : {
                vibrancy: 'menu' as const,
                visualEffectState: 'active' as const
              })
        }
      : {}),
    ...(isWindows
      ? {
          backgroundMaterial: 'mica' as const
        }
      : {}),
    ...(windowIconPath
      ? {
          icon: windowIconPath
        }
      : {}),
    ...(isMac
      ? {
          trafficLightPosition: {
            x: 15,
            y: 15
          }
        }
      : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  if (isMac) {
    window.setWindowButtonVisibility(true);
    window.setBackgroundColor('#00000000');
    applyDockIcon();
    if (isLiquidGlassSupported) {
      installLiquidGlass(window);
    } else {
      window.setVibrancy('menu');
    }
  }

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    void window.loadURL(devServerUrl);
  } else {
    void window.loadFile(path.join(__dirname, '../../dist-renderer/index.html'));
  }

  if (process.env.NODE_ENV === 'development') {
    window.webContents.openDevTools({ mode: 'detach' });
  }

  window.on('closed', () => {
    mainWindow = null;
  });

  return window;
}

function resolveAppIconPath(fileNames: string[]): string | null {
  for (const fileName of fileNames) {
    const resolved = resolveAppIconPathSingle(fileName);
    if (resolved) {
      return resolved;
    }
  }

  return null;
}

function resolveAppIconPathSingle(fileName: string): string | null {
  const candidates = [
    path.join(__dirname, 'assets', 'icons', fileName),
    path.join(__dirname, '../../electron/assets/icons', fileName),
    path.join(app.getAppPath(), 'electron', 'assets', 'icons', fileName),
    path.join(process.cwd(), 'electron', 'assets', 'icons', fileName)
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

function applyDockIcon(): void {
  if (process.platform !== 'darwin') {
    return;
  }

  const dockIconPath = resolveAppIconPath(['app-icon.png', 'app-icon.jpg', 'app-icon.jpeg']);
  if (!dockIconPath) {
    return;
  }

  const icon = nativeImage.createFromPath(dockIconPath);
  if (icon.isEmpty()) {
    return;
  }

  if (!app.dock) {
    return;
  }

  app.dock.setIcon(icon);
}

async function getLiquidGlassSupport(): Promise<boolean> {
  if (process.platform !== 'darwin') {
    return false;
  }

  if (liquidGlassSupport !== null) {
    return liquidGlassSupport;
  }

  try {
    const module = (await import('electron-liquid-glass')).default as {
      isGlassSupported?: () => boolean;
    };
    liquidGlassSupport = module.isGlassSupported?.() ?? false;
    return liquidGlassSupport;
  } catch {
    liquidGlassSupport = false;
    return false;
  }
}

function installLiquidGlass(window: BrowserWindow): void {
  if (process.platform !== 'darwin') {
    return;
  }

  const fallback = () => {
    if (window.isDestroyed()) {
      return;
    }
    window.setVibrancy('menu');
  };

  let applied = false;

  const applyGlass = async (): Promise<boolean> => {
    if (window.isDestroyed()) {
      return false;
    }

    try {
      const module = (await import('electron-liquid-glass')).default as {
        addView: (nativeWindowHandle: Buffer, options?: Record<string, unknown>) => number;
      };
      const result = module.addView(window.getNativeWindowHandle(), {});
      if (result < 0) {
        return false;
      }
      applied = true;
      return true;
    } catch {
      return false;
    }
  };

  void applyGlass().then((success) => {
    if (success || window.isDestroyed()) {
      return;
    }

    window.webContents.once('did-finish-load', () => {
      void applyGlass().then((didApply) => {
        if (!didApply && !applied) {
          fallback();
        }
      });
    });

    if (!window.webContents.isLoadingMainFrame()) {
      void applyGlass().then((didApply) => {
        if (!didApply && !applied) {
          fallback();
        }
      });
    }
  });
}

function canUseStudioWorkspace(config: StudioConfigPublic | null): boolean {
  if (!config) {
    return false;
  }

  return config.onboardingCompleted && config.hasApiKey;
}

function sendMenuCommand(command: StudioMenuCommand): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (window.isDestroyed()) {
      continue;
    }

    window.webContents.send('studio:menu-command', command);
  }
}

function installApplicationMenu(config: StudioConfigPublic | null): void {
  const isMac = process.platform === 'darwin';
  const studioReady = canUseStudioWorkspace(config);

  if (isMac && !studioReady) {
    Menu.setApplicationMenu(null);
    return;
  }

  const template: MenuItemConstructorOptions[] = isMac
    ? [
        {
          label: app.name,
          submenu: [
            { role: 'about' },
            { type: 'separator' },
            { role: 'services' },
            { type: 'separator' },
            { role: 'hide' },
            { role: 'hideOthers' },
            { role: 'unhide' },
            { type: 'separator' },
            { role: 'quit' }
          ]
        },
        {
          label: 'Ablage',
          submenu: [
            {
              label: 'Neues Bild',
              accelerator: 'CmdOrCtrl+N',
              click: () => sendMenuCommand('new-image')
            },
            {
              label: 'Neues Projekt',
              accelerator: 'CmdOrCtrl+Shift+N',
              click: () => sendMenuCommand('new-project')
            },
            { type: 'separator' },
            { role: 'close' }
          ]
        },
        {
          label: 'Bearbeiten',
          submenu: [
            { role: 'undo' },
            { role: 'redo' },
            { type: 'separator' },
            { role: 'cut' },
            { role: 'copy' },
            { role: 'paste' },
            { role: 'pasteAndMatchStyle' },
            { role: 'delete' },
            { role: 'selectAll' }
          ]
        },
        {
          label: 'Bereiche',
          submenu: [
            {
              label: 'Galerie',
              accelerator: 'CmdOrCtrl+1',
              click: () => sendMenuCommand('open-gallery')
            },
            {
              label: 'Warteschlange',
              accelerator: 'CmdOrCtrl+2',
              click: () => sendMenuCommand('open-queue')
            },
            {
              label: 'Prompt-Bibliothek',
              accelerator: 'CmdOrCtrl+3',
              click: () => sendMenuCommand('open-prompts')
            },
            {
              label: 'Projekte',
              accelerator: 'CmdOrCtrl+4',
              click: () => sendMenuCommand('open-projects')
            },
            { type: 'separator' },
            {
              label: 'Einstellungen',
              accelerator: 'CmdOrCtrl+,',
              click: () => sendMenuCommand('open-settings')
            }
          ]
        },
        {
          label: 'Ansicht',
          submenu: [
            {
              label: 'Befehlspalette',
              accelerator: 'CmdOrCtrl+K',
              click: () => sendMenuCommand('open-command-palette')
            },
            { type: 'separator' },
            {
              label: 'Seitenleiste umschalten',
              accelerator: 'CmdOrCtrl+B',
              click: () => sendMenuCommand('toggle-sidebar')
            },
            {
              label: 'Inspektor umschalten',
              accelerator: 'CmdOrCtrl+I',
              click: () => sendMenuCommand('toggle-inspector')
            },
            { type: 'separator' },
            { role: 'reload' },
            { role: 'forceReload' },
            { role: 'toggleDevTools' },
            { type: 'separator' },
            { role: 'resetZoom' },
            { role: 'zoomIn' },
            { role: 'zoomOut' },
            { type: 'separator' },
            { role: 'togglefullscreen' }
          ]
        },
        {
          label: 'Fenster',
          submenu: [{ role: 'minimize' }, { role: 'zoom' }, { type: 'separator' }, { role: 'front' }]
        }
      ]
    : [
        {
          label: 'File',
          submenu: [
            { label: 'New Image', accelerator: 'CmdOrCtrl+N', click: () => sendMenuCommand('new-image') },
            {
              label: 'New Project',
              accelerator: 'CmdOrCtrl+Shift+N',
              click: () => sendMenuCommand('new-project')
            },
            { type: 'separator' },
            { role: 'quit' }
          ]
        },
        {
          label: 'Navigate',
          submenu: [
            { label: 'Gallery', accelerator: 'CmdOrCtrl+1', click: () => sendMenuCommand('open-gallery') },
            { label: 'Queue', accelerator: 'CmdOrCtrl+2', click: () => sendMenuCommand('open-queue') },
            { label: 'Prompts', accelerator: 'CmdOrCtrl+3', click: () => sendMenuCommand('open-prompts') },
            { label: 'Projects', accelerator: 'CmdOrCtrl+4', click: () => sendMenuCommand('open-projects') },
            { type: 'separator' },
            { label: 'Settings', accelerator: 'CmdOrCtrl+,', click: () => sendMenuCommand('open-settings') }
          ]
        },
        {
          label: 'View',
          submenu: [
            {
              label: 'Command Palette',
              accelerator: 'CmdOrCtrl+K',
              click: () => sendMenuCommand('open-command-palette')
            },
            { type: 'separator' },
            {
              label: 'Toggle Sidebar',
              accelerator: 'CmdOrCtrl+B',
              click: () => sendMenuCommand('toggle-sidebar')
            },
            {
              label: 'Toggle Inspector',
              accelerator: 'CmdOrCtrl+I',
              click: () => sendMenuCommand('toggle-inspector')
            },
            { type: 'separator' },
            { role: 'reload' },
            { role: 'forceReload' },
            { role: 'toggleDevTools' }
          ]
        }
      ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function registerStudioProtocol(): void {
  protocol.handle('studio', async (request) => {
    try {
      const url = new URL(request.url);
      const rawPath = url.pathname.replace(/^\/+/, '');
      if (!rawPath) {
        return new Response('Invalid path.', { status: 400 });
      }

      if (rawPath.startsWith('abs/')) {
        const encodedAbsolutePath = rawPath.slice(4);
        if (!encodedAbsolutePath) {
          return new Response('Invalid path.', { status: 400 });
        }

        const decodedAbsolutePath = decodeAbsolutePathToken(encodedAbsolutePath);
        if (!decodedAbsolutePath || !isAbsoluteStudioPath(decodedAbsolutePath)) {
          return new Response('Invalid path.', { status: 400 });
        }

        const absolutePath = path.resolve(decodedAbsolutePath);
        if (!isPathInsideAnyRoot(absolutePath, collectStudioImageRoots())) {
          return new Response('Forbidden.', { status: 403 });
        }

        return net.fetch(pathToFileURL(absolutePath).toString());
      }

      const relativePath = decodeURIComponent(rawPath);
      if (relativePath.includes('..')) {
        return new Response('Invalid path.', { status: 400 });
      }

      const absolutePath = path.join(STUDIO_PATHS.root, relativePath);
      if (!isPathInsideRoot(absolutePath, STUDIO_PATHS.root)) {
        return new Response('Forbidden.', { status: 403 });
      }

      return net.fetch(pathToFileURL(absolutePath).toString());
    } catch {
      return new Response('Not found.', { status: 404 });
    }
  });
}

function collectStudioImageRoots(): string[] {
  const roots = new Set<string>([path.resolve(STUDIO_PATHS.root)]);
  if (!database) {
    return Array.from(roots);
  }

  for (const project of database.listProjects()) {
    const outputDir = project.imageOutputDir?.trim();
    if (!outputDir || !isAbsoluteStudioPath(outputDir)) {
      continue;
    }

    roots.add(path.resolve(outputDir));
  }

  return Array.from(roots);
}

function isPathInsideAnyRoot(targetPath: string, rootPaths: string[]): boolean {
  return rootPaths.some((rootPath) => isPathInsideRoot(targetPath, rootPath));
}

function decodeAbsolutePathToken(token: string): string | null {
  try {
    return Buffer.from(token, 'base64url').toString('utf8');
  } catch {
    return null;
  }
}

function isPathInsideRoot(targetPath: string, rootPath: string): boolean {
  const resolvedTarget = path.resolve(targetPath);
  const resolvedRoot = path.resolve(rootPath);
  const relative = path.relative(resolvedRoot, resolvedTarget);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

void app.whenReady()
  .then(async () => {
    ensureStudioDirectories(STUDIO_PATHS);
    registerStudioProtocol();

    const configStore = new ConfigStore();
    currentConfig = configStore.getPublicConfig();
    installApplicationMenu(currentConfig);
    database = new StudioDatabase(STUDIO_PATHS.database);
    const geminiClient = new GeminiClient();
    const imageStore = new ImageStore(database, STUDIO_PATHS);
    const queue = new GenerationQueue(
      database,
      configStore,
      geminiClient,
      imageStore,
      configStore.getPublicConfig().queueConcurrency
    );

    registerStudioIpcHandlers({
      database,
      configStore,
      queue,
      geminiClient,
      onConfigChanged: (updatedConfig) => {
        currentConfig = updatedConfig;
        installApplicationMenu(updatedConfig);
      }
    });

    queue.on('queue-changed', () => {
      if (!mainWindow || mainWindow.isDestroyed()) {
        return;
      }

      mainWindow.webContents.send('studio:queue-updated');
    });

    queue.on('job-completed', () => {
      if (!mainWindow || mainWindow.isDestroyed()) {
        return;
      }

      mainWindow.webContents.send('studio:images-updated');
      mainWindow.webContents.send('studio:queue-updated');
    });

    mainWindow = await createMainWindow();

    const theme = configStore.getPublicConfig().theme;
    if (theme === 'dark' || theme === 'light') {
      nativeTheme.themeSource = theme;
    }

    app.on('activate', () => {
      installApplicationMenu(currentConfig);
      if (BrowserWindow.getAllWindows().length === 0) {
        void createMainWindow().then((window) => {
          mainWindow = window;
        });
      }
    });
  })
  .catch((error) => {
    // Crash early with actionable logs if startup initialization fails.
    console.error('Failed to initialize Benana:', error);
    app.quit();
  });

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  database?.close();
});
