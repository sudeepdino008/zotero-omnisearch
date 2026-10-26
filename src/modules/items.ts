import type { ItemDoc } from "./searchIndex";

const IDENTIFIER_FIELDS = ["DOI", "ISBN", "ISSN"];

/** Books, papers etc. plus standalone files; not notes, child files or feeds. */
export function isSearchable(item: Zotero.Item) {
  if (item.deleted || item.isFeedItem) return false;
  return item.isRegularItem() || (item.isAttachment() && item.isTopLevelItem());
}

function field(item: Zotero.Item, name: string, unformatted = false) {
  try {
    return String(item.getField(name, unformatted, true) ?? "");
  } catch {
    // Field isn't valid for this item type
    return "";
  }
}

export function toDoc(item: Zotero.Item): ItemDoc {
  // Multipart dates look like "1997-00-00 1997"
  const year = field(item, "date", true).slice(0, 4);
  return {
    id: item.id,
    title: item.getDisplayTitle(),
    shortTitle: field(item, "shortTitle"),
    creators: item
      .getCreators()
      .map((c) => [c.firstName, c.lastName].filter(Boolean).join(" "))
      .join("; "),
    year: year === "0000" ? "" : year,
    publication: field(item, "publicationTitle"),
    tags: item
      .getTags()
      .map((t) => t.tag)
      .join("; "),
    identifiers: IDENTIFIER_FIELDS.map((f) => field(item, f))
      .filter(Boolean)
      .join(" "),
    firstCreator: field(item, "firstCreator"),
    itemType: Zotero.ItemTypes.getLocalizedString(item.itemTypeID),
  };
}

export async function loadAllDocs() {
  const docs: ItemDoc[] = [];
  for (const library of Zotero.Libraries.getAll()) {
    if (library.libraryType === "feed") continue;
    await library.waitForDataLoad("item");
    const items = await Zotero.Items.getAll(library.libraryID, true);
    for (const item of items) {
      if (!isSearchable(item)) continue;
      try {
        docs.push(toDoc(item));
      } catch (e) {
        Zotero.logError(e as Error);
      }
    }
  }
  return docs;
}

/** Latest read time per top-level item, in ms, from Zotero's own tracking. */
export async function loadLastRead() {
  const rows = ((await Zotero.DB.queryAsync(
    "SELECT COALESCE(parentItemID, itemID) AS id, MAX(lastRead) AS lastRead " +
      "FROM itemAttachments WHERE lastRead IS NOT NULL GROUP BY id",
  )) ?? []) as { id: number; lastRead: number }[];
  return rows.map((r) => ({ id: r.id, ms: r.lastRead * 1000 }));
}

/** The item a palette row should stand for when this item changes. */
export function topLevelID(item: Zotero.Item) {
  return item.parentItemID || item.id;
}
