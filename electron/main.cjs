const { app, BrowserWindow, dialog, session, shell, utilityProcess } = require("electron");
const { createWriteStream, existsSync, mkdirSync } = require("node:fs");
const net = require("node:net");
const path = require("node:path");

app.setName("Cantera");
if (process.env.CANTERA_USER_DATA_DIR) {
  const profile = path.resolve(process.env.CANTERA_USER_DATA_DIR);
  mkdirSync(profile, { recursive: true });
  app.setPath("userData", profile);
}
let window;
let server;
let log;
let quitting = false;

function freePort() {
  return new Promise((resolve, reject) => {
    const socket = net.createServer();
    socket.once("error", reject);
    socket.listen(0, "127.0.0.1", () => {
      const port = socket.address().port;
      socket.close(() => resolve(port));
    });
  });
}

function externalUrl(value) {
  try {
    if (/[\u0000-\u001f\u007f]/.test(value)) return null;
    const url = new URL(value);
    if (url.username || url.password) return null;
    if (["https:", "http:"].includes(url.protocol)) return url.href;
    if (url.protocol === "tel:") {
      return /^\+?\d{3,20}$/.test(url.pathname) && !url.search && !url.hash ? url.href : null;
    }
    if (url.protocol === "mailto:") {
      const recipient = decodeURIComponent(url.pathname);
      if (
        !/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(recipient) ||
        url.hash
      )
        return null;
      for (const [key, text] of url.searchParams) {
        if (!["subject", "body"].includes(key)) return null;
        if (key === "subject" && /[\u0000-\u001f\u007f]/.test(text)) return null;
        // Los saltos del cuerpo son parte del borrador; no se aceptan otros controles.
        if (key === "body" && /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text))
          return null;
      }
      return url.href;
    }
    return null;
  } catch {
    return null;
  }
}

async function waitForServer(origin) {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline && server && !quitting) {
    try {
      const response = await fetch(`${origin}/login`, { signal: AbortSignal.timeout(1500) });
      if (response.ok) return;
    } catch {
      /* El servidor todavía se inicia. */
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(
    "El servidor local no respondió. Cierra Cantera y vuelve a abrirla. Si persiste, consulta server.log en la carpeta de datos de la aplicación.",
  );
}

async function start() {
  const userData = app.getPath("userData");
  const data = path.join(userData, "data");
  mkdirSync(data, { recursive: true });
  const serverRoot = app.isPackaged
    ? path.join(process.resourcesPath, "server")
    : path.join(__dirname, "..", ".desktop", "server");
  const entry = path.join(serverRoot, "server.js");
  if (!existsSync(entry))
    throw new Error(
      "Falta el servidor incluido en Cantera. En desarrollo ejecuta npm run desktop; si instalaste la aplicación, vuelve a instalarla.",
    );

  const port = await freePort();
  const origin = `http://127.0.0.1:${port}`;
  log = createWriteStream(path.join(userData, "server.log"), { flags: "w", mode: 0o600 });
  log.on("error", () => {});
  server = utilityProcess.fork(entry, [], {
    cwd: serverRoot,
    serviceName: "Cantera Server",
    stdio: "pipe",
    env: {
      ...process.env,
      NODE_ENV: "production",
      HOSTNAME: "127.0.0.1",
      PORT: String(port),
      CANTERA_MODE: "local",
      CANTERA_DESKTOP: "1",
      CANTERA_DATA_DIR: data,
      NEXT_TELEMETRY_DISABLED: "1",
    },
  });
  server.stdout?.pipe(log, { end: false });
  server.stderr?.pipe(log, { end: false });
  server.once("exit", (code) => {
    server = undefined;
    if (!quitting && window) {
      dialog.showErrorBox(
        "Cantera se detuvo",
        `El servidor local terminó (código ${code}). Tus datos siguen en la carpeta de la aplicación. Vuelve a abrir Cantera.`,
      );
      app.quit();
    }
  });
  await waitForServer(origin);

  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(permission === "clipboard-sanitized-write");
  });
  window = new BrowserWindow({
    title: "Cantera",
    width: 1280,
    height: 880,
    minWidth: 390,
    minHeight: 600,
    backgroundColor: "#12151b",
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
    },
  });
  window.webContents.setWindowOpenHandler(({ url }) => {
    const safe = externalUrl(url);
    if (safe) void shell.openExternal(safe).catch(() => {});
    return { action: "deny" };
  });
  const restrictNavigation = (event, value) => {
    try {
      if (new URL(value).origin === origin) return;
    } catch {
      /* Bloquea URLs inválidas. */
    }
    event.preventDefault();
    const safe = externalUrl(value);
    if (safe) void shell.openExternal(safe).catch(() => {});
  };
  window.webContents.on("will-navigate", restrictNavigation);
  window.webContents.on("will-redirect", restrictNavigation);
  window.webContents.on("will-attach-webview", (event) => event.preventDefault());
  window.once("ready-to-show", () => window.show());
  window.once("closed", () => {
    window = undefined;
  });
  await window.loadURL(origin);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (window) {
      if (window.isMinimized()) window.restore();
      window.show();
      window.focus();
    }
  });
  app.on("window-all-closed", () => app.quit());
  app.on("before-quit", () => {
    quitting = true;
    server?.kill();
    log?.end();
  });
  app
    .whenReady()
    .then(start)
    .catch((error) => {
      if (process.env.CANTERA_SMOKE_TEST === "1") console.error(error);
      else dialog.showErrorBox("No se pudo abrir Cantera", error.message);
      app.quit();
    });
}
