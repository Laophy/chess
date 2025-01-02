/**
 * Imports
 */
const electron = require("electron");
const isDev = require("electron-is-dev");
const steamworks = require("steamworks.js");
const path = require("path");
const Store = require("electron-store");
const log = require("electron-log");

/**
 * Configuration
 */
const CONFIG = {
  STEAM_APP_ID: 2940220,
  WINDOW_DEFAULTS: {
    width: 1250,
    height: 700,
    minWidth: 800,
    minHeight: 600,
  },
  DEV_SERVER_URL: "http://localhost:3000",
};

/**
 * Global Variables
 */
let mainWindow = null;
let steamClient = null;
const store = new Store();
const { app, BrowserWindow, globalShortcut, ipcMain, screen } = electron;

/**
 * App Performance Settings
 */
const setupAppSettings = () => {
  const switches = [
    "in-process-gpu",
    "disable-direct-composition",
    "disable-renderer-backgrounding",
    "disable-background-timer-throttling",
    "disable-accelerated-2d-canvas",
    "disable-accelerated-mjpeg-decode",
    "disable-accelerated-video-decode",
    "disable-accelerated-video-encode",
  ];

  switches.forEach((switch_) => app.commandLine.appendSwitch(switch_));
};

/**
 * Steam Integration
 */
const initSteamworks = () => {
  try {
    steamClient = steamworks.init(CONFIG.STEAM_APP_ID);
    setupSteamIPC();
    log.info(`Steam initialized for app ${CONFIG.STEAM_APP_ID}`);
    return true;
  } catch (err) {
    log.error("Steam initialization failed:", err);
    return false;
  }
};

const setupSteamIPC = () => {
  ipcMain.on("trigger_achievement", (event, achievement_name) => {
    try {
      steamClient.achievement.activate(achievement_name);
      log.info(`Achievement triggered: ${achievement_name}`);
    } catch (err) {
      log.error(`Achievement activation failed: ${achievement_name}`, err);
    }
  });

  ipcMain.handle("check_achievement", async (event, achievement_name) => {
    try {
      return steamClient.achievement.isActivated(achievement_name);
    } catch (err) {
      log.error(`Achievement check failed: ${achievement_name}`, err);
      return false;
    }
  });
};

/**
 * Window Management
 */
const createWindow = () => {
  // Get screen dimensions
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;

  // Set window dimensions based on mode
  const windowConfig = isDev
    ? {
        x: 0,
        y: 0,
        width: Math.floor(width / 2),
        height: height,
      }
    : {
        width: 1250,
        height: 700,
        minWidth: 800,
        minHeight: 600,
        show: false,
        center: true,
      };

  const mainWindow = new BrowserWindow({
    ...windowConfig,
    icon: path.join(__dirname, "../build/favicon.ico"),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "electron-preload.js"),
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: false,
      allowRunningInsecureContent: true,
      enableRemoteModule: true,
      webAudio: true,
      fullscreen: true,
    },
  });

  // Always remove menu regardless of dev/prod mode
  mainWindow.removeMenu();

  if (isDev) {
    // Development mode: Open dev tools in a separate window
    mainWindow.webContents.openDevTools({
      mode: "detach", // This makes dev tools open in a separate window
    });
  } else {
    // Production mode: Show window when ready
    mainWindow.once("ready-to-show", () => {
      mainWindow.show();
      if (windowConfig.isMaximized) {
        mainWindow.maximize();
      }
    });
  }

  // Save window state on close
  ["resize", "move", "close"].forEach((event) => {
    mainWindow.on(event, () => {
      if (!mainWindow.isMaximized()) {
        store.set("windowState", mainWindow.getBounds());
      }
      store.set("windowState.isMaximized", mainWindow.isMaximized());
    });
  });

  // Load the app
  mainWindow.loadURL(
    isDev
      ? CONFIG.DEV_SERVER_URL
      : `file://${path.join(__dirname, "../build/index.html")}`
  );

  // Setup window events
  setupWindowEvents();

  // Prevent window from leaving fullscreen
  mainWindow.on("leave-full-screen", () => {
    mainWindow.setFullScreen(true);
  });

  return mainWindow;
};

const setupWindowEvents = () => {
  mainWindow.webContents.on("render-process-gone", (event, details) => {
    log.error("Render process crashed:", details);
    // Implement proper crash recovery here
    if (process.env.AUTO_RELOAD_ON_CRASH) {
      mainWindow.webContents.reload();
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
    app.quit();
  });
};

/**
 * IPC Handlers
 */
const setupIPC = () => {
  ipcMain.on("quit", () => app.quit());

  ipcMain.on("toggle_fullscreen", () => {
    if (!mainWindow) return;
    mainWindow.setFullScreen(!mainWindow.isFullScreen());
  });

  ipcMain.on("link", (event, link) => {
    // Validate URL before opening
    try {
      new URL(link);
      electron.shell.openExternal(link);
    } catch (err) {
      log.error("Invalid URL:", link);
    }
  });
};

/**
 * App Initialization
 */
const initialize = async () => {
  // Ensure single instance
  if (!app.requestSingleInstanceLock()) {
    app.quit();
    return;
  }

  setupAppSettings();

  app.whenReady().then(() => {
    if (!initSteamworks()) {
      log.warn("Application starting without Steam integration");
    }

    createWindow();
    setupIPC();
    setupProductionRestrictions();
    setupErrorHandling();
  });

  app.on("window-all-closed", () => app.quit());
  process.on("exit", () => app.quit());
};

/**
 * Production Restrictions
 */
const setupProductionRestrictions = () => {
  if (isDev) return;

  const disabledShortcuts = ["CommandOrControl+R", "F5", "Control+Shift+I"];

  app.on("browser-window-focus", () => {
    disabledShortcuts.forEach((shortcut) => {
      globalShortcut.register(shortcut, () => {
        log.info(`${shortcut} is disabled in production`);
      });
    });
  });

  app.on("browser-window-blur", () => {
    disabledShortcuts.forEach((shortcut) => {
      globalShortcut.unregister(shortcut);
    });
  });
};

/**
 * Error Handling
 */
const setupErrorHandling = () => {
  const errorEvents = ["uncaughtException", "unhandledRejection"];

  errorEvents.forEach((event) => {
    process.on(event, (err) => {
      log.error(`${event}:`, err);
    });

    app.on(event, (err) => {
      log.error(`${event}:`, err);
    });
  });
};

// Start the application
initialize();
