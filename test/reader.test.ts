import { assert } from "chai";
import { config } from "../package.json";

// Smallest PDF pdf.js will render; it rebuilds the missing xref table
const PDF = `%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] >> endobj
trailer << /Root 1 0 R >>
%%EOF`;

/**
 * Cmd/Ctrl+G dispatched in `target`. Synthetic, since a trusted keypress only
 * reaches the focused frame and the test window runs in the background.
 */
function pressAccelG(target: Window) {
  const KeyboardEvent = (target as any).KeyboardEvent;
  // The PDF view is a less privileged frame: an init dict from this scope
  // would arrive empty unless cloned into it
  const init = Components.utils.cloneInto(
    {
      key: "g",
      code: "KeyG",
      metaKey: Zotero.isMac,
      ctrlKey: !Zotero.isMac,
      bubbles: true,
      cancelable: true,
    },
    target,
  );
  target.document.dispatchEvent(new KeyboardEvent("keydown", init));
}

describe("reader shortcut", function () {
  this.timeout(30000);

  it("should open the palette from a reader tab", async function () {
    const win = Zotero.getMainWindow();
    const backdrop = win.document.querySelector<HTMLElement>(
      `.${config.addonRef}-backdrop`,
    )!;
    const path = PathUtils.join(PathUtils.tempDir, "omnisearch-test.pdf");
    await IOUtils.writeUTF8(path, PDF);
    const attachment = await Zotero.Attachments.importFromFile({ file: path });
    try {
      const reader = (await Zotero.Reader.open(attachment.id)) as any;
      await reader._initPromise;
      const view = reader._internalReader._primaryView;
      await view.initializedPromise;
      // Listeners attach asynchronously after the toolbar renders
      await Zotero.Promise.delay(500);

      for (const [label, target] of [
        ["reader UI", reader._iframeWindow],
        ["document view", view._iframeWindow],
      ] as [string, Window][]) {
        backdrop.hidden = true;
        pressAccelG(target);
        assert.isFalse(backdrop.hidden, `Cmd+G in the ${label}`);
      }
      backdrop.hidden = true;
      win.Zotero_Tabs.close(reader.tabID);
    } finally {
      await attachment.eraseTx();
      await IOUtils.remove(path);
    }
  });
});
