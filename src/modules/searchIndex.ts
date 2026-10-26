import MiniSearch from "minisearch";

export interface ItemDoc {
  id: number;
  title: string;
  shortTitle: string;
  creators: string;
  year: string;
  publication: string;
  tags: string;
  identifiers: string;
  // Display only
  firstCreator: string;
  itemType: string;
}

export type StoredDoc = Pick<
  ItemDoc,
  "title" | "firstCreator" | "year" | "itemType"
>;

export interface Hit extends StoredDoc {
  id: number;
}

const SEARCH_FIELDS: (keyof ItemDoc)[] = [
  "title",
  "shortTitle",
  "creators",
  "year",
  "publication",
  "tags",
  "identifiers",
];
const STORE_FIELDS: (keyof StoredDoc)[] = [
  "title",
  "firstCreator",
  "year",
  "itemType",
];

/** Lowercase and strip diacritics, so "godel" finds "Gödel". */
export function foldTerm(term: string) {
  return term.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

/**
 * In-memory full-text index over item metadata. `boost` multiplies an item's
 * relevance score, which is how recency feeds into ranking.
 */
export class SearchIndex {
  private mini = new MiniSearch<ItemDoc>({
    fields: SEARCH_FIELDS,
    storeFields: STORE_FIELDS,
    processTerm: foldTerm,
    searchOptions: {
      boost: { title: 3, shortTitle: 2, creators: 2 },
      prefix: true,
      // Typo tolerance only on longer terms, short ones would match too much
      fuzzy: (term) => (term.length > 3 ? 0.2 : false),
      combineWith: "AND",
    },
  });

  constructor(private boost: (id: number) => number = () => 1) {}

  get size() {
    return this.mini.documentCount;
  }

  addAll(docs: ItemDoc[]) {
    this.mini.addAll(docs);
  }

  upsert(doc: ItemDoc) {
    if (this.mini.has(doc.id)) this.mini.replace(doc);
    else this.mini.add(doc);
  }

  remove(id: number) {
    if (this.mini.has(id)) this.mini.discard(id);
  }

  has(id: number) {
    return this.mini.has(id);
  }

  stored(id: number) {
    return this.mini.getStoredFields(id) as StoredDoc | undefined;
  }

  search(query: string, limit: number): Hit[] {
    return this.mini
      .search(query, { boostDocument: (id) => this.boost(id as number) })
      .slice(0, limit)
      .map((r) => ({
        id: r.id as number,
        title: r.title,
        firstCreator: r.firstCreator,
        year: r.year,
        itemType: r.itemType,
      }));
  }
}
