import { getLocaleID, initLocale } from "./utils/locale";
import { createZToolkit } from "./utils/ztoolkit";
import {
  openItem,
  search,
  selectItem,
  startEngine,
  stopEngine,
} from "./modules/engine";
import { Palette } from "./modules/palette";
import { Shortcut } from "./modules/shortcut";

const palettes = new Map<Window, Palette>();
const shortcut = new Shortcut((win) => palettes.get(win)?.toggle());

async function onStartup() {
  await Promise.all([
    Zotero.initializationPromise,
    Zotero.unlockPromise,
    Zotero.uiReadyPromise,
  ]);

  initLocale();

  await startEngine();

  registerMenus();

  // Reader tabs opened later; Zotero drops the listener on plugin shutdown
  Zotero.Reader.registerEventListener(
    "renderToolbar",
    ({ reader }) => void shortcut.listenToReader(reader),
    addon.data.config.addonID,
  );
  for (const reader of Zotero.Reader._readers) {
    void shortcut.listenToReader(reader);
  }

  await Promise.all(
    Zotero.getMainWindows().map((win) => onMainWindowLoad(win)),
  );

  // Mark initialized as true to confirm plugin loading status
  // outside of the plugin (e.g. scaffold testing process)
  addon.data.initialized = true;
}

function registerMenus() {
  const toolsMenu = Zotero.MenuManager.registerMenu({
    menuID: `${addon.data.config.addonRef}-tools-menu`,
    pluginID: addon.data.config.addonID,
    target: "main/menubar/tools",
    menus: [
      {
        menuType: "menuitem",
        l10nID: getLocaleID("menu-open-palette"),
        onCommand: () => {
          const win = Zotero.getMainWindow();
          if (win) palettes.get(win)?.show();
        },
      },
    ],
  });
  // A rejected menu is only reported in the debug log, so fail startup instead
  if (!toolsMenu) throw new Error("Failed to register Omnisearch menu");
}

async function onMainWindowLoad(win: _ZoteroTypes.MainWindow): Promise<void> {
  // Create ztoolkit for every window
  addon.data.ztoolkit = createZToolkit();

  win.MozXULElement.insertFTLIfNeeded(
    `${addon.data.config.addonRef}-mainWindow.ftl`,
  );

  const styles = ztoolkit.UI.createElement(win.document, "link", {
    id: `${addon.data.config.addonRef}-styles`,
    properties: {
      type: "text/css",
      rel: "stylesheet",
      href: `chrome://${addon.data.config.addonRef}/content/palette.css`,
    },
  });
  win.document.documentElement?.appendChild(styles);

  const palette = new Palette(win, {
    search,
    select: (id) => void selectItem(win, id),
    open: (id) => void openItem(win, id),
  });
  palettes.set(win, palette);
  shortcut.listen(win, win);
}

async function onMainWindowUnload(win: Window): Promise<void> {
  palettes.get(win)?.destroy();
  palettes.delete(win);
  shortcut.unlisten(win);
  win.document.getElementById(`${addon.data.config.addonRef}-styles`)?.remove();
}

async function onShutdown(): Promise<void> {
  for (const win of [...palettes.keys()]) await onMainWindowUnload(win);
  stopEngine();
  ztoolkit.unregisterAll();
  // Remove addon object
  addon.data.alive = false;
  // @ts-expect-error - Plugin instance is not typed
  delete Zotero[addon.data.config.addonInstance];
}

export default {
  onStartup,
  onShutdown,
  onMainWindowLoad,
  onMainWindowUnload,
};
