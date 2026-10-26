import { assert } from "chai";
import { ItemDoc, SearchIndex, foldTerm } from "../src/modules/searchIndex";

const doc = (id: number, title: string, creators = ""): ItemDoc => ({
  id,
  title,
  shortTitle: "",
  creators,
  year: "",
  publication: "",
  tags: "",
  identifiers: "",
  firstCreator: "",
  itemType: "Book",
});

describe("searchIndex", function () {
  it("folds diacritics and case", function () {
    assert.equal(foldTerm("Gödel"), "godel");
  });

  it("matches prefixes, typos and authors", function () {
    const index = new SearchIndex();
    index.addAll([
      doc(1, "The Art of Computer Programming", "Donald Knuth"),
      doc(2, "Gödel, Escher, Bach", "Douglas Hofstadter"),
    ]);
    assert.deepEqual(
      index.search("comp prog", 10).map((h) => h.id),
      [1],
    );
    assert.deepEqual(
      index.search("programing knuth", 10).map((h) => h.id),
      [1],
    );
    assert.deepEqual(
      index.search("godel", 10).map((h) => h.id),
      [2],
    );
  });

  it("updates and removes documents", function () {
    const index = new SearchIndex();
    index.upsert(doc(1, "Old title"));
    index.upsert(doc(1, "New title"));
    assert.lengthOf(index.search("old", 10), 0);
    assert.lengthOf(index.search("new", 10), 1);
    index.remove(1);
    assert.equal(index.size, 0);
  });

  it("lets the boost reorder equal matches", function () {
    const index = new SearchIndex((id) => (id === 2 ? 3 : 1));
    index.addAll([doc(1, "Linear Algebra"), doc(2, "Linear Algebra")]);
    assert.equal(index.search("linear", 10)[0].id, 2);
  });
});
