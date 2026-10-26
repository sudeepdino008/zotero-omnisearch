import { getPref, setPref } from "../utils/prefs";
import {
  isSearchable,
  loadAllDocs,
  loadLastRead,
  toDoc,
  topLevelID,
} from "./items";
import { Recency } from "./recency";
import { Hit, SearchIndex } from "./searchIndex";

const MAX_RESULTS = 50;
const MAX_RECENT = 20;
// Boost is 1 + WEIGHT * min(score, CAP): at most 3x for heavily used items,
// enough to reorder close matches without burying a clearly better one
const RECENCY_WEIGHT = 0.5;
const RECENCY_CAP = 4;

const recency = new Recency();
const index = new SearchIndex(
  (id) => 1 + RECENCY_WEIGHT * Math.min(recency.score(id), RECENCY_CAP),
);
let observerID: string | undefined;

export async function startEngine() {
  try {
    recency.loadPicks(getPref("picks"));
  } catch (e) {
    Zotero.logError(e as Error);
  }

  // Register before the initial load so changes made meanwhile aren't lost
  observerID = Zotero.Notifier.registerObserver(
    { notify: (event, type, ids) => void onNotify(event, type, ids) },
    ["item"],
    addon.data.config.addonRef,
  );

  const started = Date.now();
  const [docs, lastRead] = await Promise.all([loadAllDocs(), loadLastRead()]);
  for (const doc of docs) index.upsert(doc);
  for (const { id, ms } of lastRead) recency.setLastRead(id, ms);
  ztoolkit.log(`indexed ${index.size} items in ${Date.now() - started}ms`);
}

export function stopEngine() {
  if (observerID) Zotero.Notifier.unregisterObserver(observerID);
  observerID = undefined;
}

async function onNotify(event: string, type: string, ids: (number | string)[]) {
  if (type !== "item") return;
  for (const id of ids as number[]) {
    if (event === "delete") {
      index.remove(id);
      recency.forget(id);
      continue;
    }
    const item = Zotero.Items.get(id);
    if (!item) continue;
    try {
      if (isSearchable(item)) index.upsert(toDoc(item));
      else index.remove(id);
      // Zotero bumps lastRead and saves the attachment on open/page turns
      // (attachmentLastRead is newer than zotero-types)
      const lastRead = (item as { attachmentLastRead?: number })
        .attachmentLastRead;
      if (item.isAttachment() && lastRead) {
        recency.setLastRead(topLevelID(item), lastRead * 1000);
      }
    } catch (e) {
      Zotero.logError(e as Error);
    }
  }
}

export function search(query: string): Hit[] {
  if (query.trim()) return index.search(query, MAX_RESULTS);
  // Empty query lists recently used items
  return recency
    .top(MAX_RECENT * 2)
    .flatMap((id) => {
      const doc = index.stored(id);
      return doc ? [{ id, ...doc }] : [];
    })
    .slice(0, MAX_RECENT);
}

function recordPick(id: number) {
  if (recency.pick(id)) setPref("picks", recency.serializePicks());
}

export async function selectItem(win: _ZoteroTypes.MainWindow, id: number) {
  recordPick(id);
  await win.ZoteroPane.selectItem(id);
}

/** Opens the item the way double-clicking it in the item list would. */
export async function openItem(win: _ZoteroTypes.MainWindow, id: number) {
  recordPick(id);
  const item = Zotero.Items.get(id);
  if (item) await win.ZoteroPane.viewItems([item]);
}
