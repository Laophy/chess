const { ipcRenderer, contextBridge } = require("electron");

// Keep the existing API methods separate
contextBridge.exposeInMainWorld("electronAPI", {
  link: (link) => {
    let event = ipcRenderer.send("link", link);
    return () => event.removeListener("link");
  },
  toggle_fullscreen: () => {
    let event = ipcRenderer.send("toggle_fullscreen");
    return () => event.removeListener("toggle_fullscreen");
  },
  quit: () => {
    let event = ipcRenderer.send("quit");
    return () => event.removeListener("quit");
  },
});
// Simplify the electron context bridge
contextBridge.exposeInMainWorld("electron", {});
