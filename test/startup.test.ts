import { assert } from "chai";
import { config } from "../package.json";

describe("startup", function () {
  it("should have plugin instance defined", function () {
    assert.isNotEmpty(Zotero[config.addonInstance]);
  });

  it("should toggle the palette with accel+G in the library", function () {
    const win = Zotero.getMainWindow();
    const backdrop = win.document.querySelector<HTMLElement>(
      `.${config.addonRef}-backdrop`,
    )!;
    assert.isTrue(backdrop.hidden);
    const press = () =>
      win.dispatchEvent(
        new win.KeyboardEvent("keydown", {
          key: "g",
          code: "KeyG",
          metaKey: Zotero.isMac,
          ctrlKey: !Zotero.isMac,
          bubbles: true,
          cancelable: true,
        }),
      );
    press();
    assert.isFalse(backdrop.hidden);
    press();
    assert.isTrue(backdrop.hidden);
  });

  it("should find a newly added item", async function () {
    const item = new Zotero.Item("book");
    item.setField("title", "Omnisearch Startup Probe");
    item.setCreators([
      { firstName: "Ada", lastName: "Lovelace", creatorType: "author" },
    ]);
    await item.saveTx();
    try {
      // @ts-expect-error - Plugin instance is not typed
      const hits = Zotero[config.addonInstance].api.search("lovel probe");
      assert.include(
        hits.map((h: { id: number }) => h.id),
        item.id,
      );
    } finally {
      await item.eraseTx();
    }
  });
});
