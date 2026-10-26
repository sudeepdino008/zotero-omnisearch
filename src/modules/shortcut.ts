/**
 * Cmd/Ctrl+G from anywhere in a main window, reader tabs included. Reader tabs
 * render in their own iframes (the reader UI, and one per document view), and
 * key events don't cross iframe boundaries, so each of those windows gets its
 * own listener. The reader binds Cmd+G to "find next", but that only acts
 * while the find bar has a search, so the palette takes precedence.
 */
export class Shortcut {
  private hooked: {
    target: Window;
    mainWindow: Window;
    listener: (ev: KeyboardEvent) => void;
  }[] = [];

  constructor(private onPress: (mainWindow: Window) => void) {}

  static matches(ev: KeyboardEvent) {
    const accel = Zotero.isMac ? ev.metaKey : ev.ctrlKey;
    return accel && !ev.shiftKey && !ev.altKey && ev.key.toLowerCase() === "g";
  }

  /** Listen in `target`, opening the palette of `mainWindow`. */
  listen(target: Window | null | undefined, mainWindow: Window) {
    this.prune();
    if (!target || this.hooked.some((h) => h.target === target)) return;
    const listener = (ev: KeyboardEvent) => {
      if (!Shortcut.matches(ev)) return;
      ev.preventDefault();
      ev.stopPropagation();
      this.onPress(mainWindow);
    };
    target.addEventListener("keydown", listener, true);
    this.hooked.push({ target, mainWindow, listener });
  }

  /** Listen in a reader tab's UI and document view iframes. */
  async listenToReader(reader: any) {
    try {
      await reader._initPromise;
      // Readers opened in their own window have no palette
      const mainWindow = reader._window;
      if (!mainWindow?.Zotero_Tabs) return;
      this.listen(reader._iframeWindow, mainWindow);
      const view = reader._internalReader?._primaryView;
      await view?.initializedPromise;
      this.listen(view?._iframeWindow, mainWindow);
    } catch (e) {
      Zotero.logError(e as Error);
    }
  }

  /** Stop listening in `mainWindow` and every reader iframe inside it. */
  unlisten(mainWindow?: Window) {
    this.prune();
    this.hooked = this.hooked.filter((h) => {
      if (mainWindow && h.mainWindow !== mainWindow) return true;
      h.target.removeEventListener("keydown", h.listener, true);
      return false;
    });
  }

  // Closed reader tabs leave dead iframe windows behind
  private prune() {
    this.hooked = this.hooked.filter(
      ({ target }) => !Components.utils.isDeadWrapper(target),
    );
  }
}
