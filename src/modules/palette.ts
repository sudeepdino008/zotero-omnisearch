import { config } from "../../package.json";
import { getString } from "../utils/locale";
import type { Hit } from "./searchIndex";

const HTML_NS = "http://www.w3.org/1999/xhtml";
const PREFIX = config.addonRef;

export interface PaletteActions {
  search(query: string): Hit[];
  select(id: number): void;
  open(id: number): void;
}

function el<K extends keyof HTMLElementTagNameMap>(
  doc: Document,
  tag: K,
  className: string,
  children: (Node | string)[] = [],
) {
  const node = doc.createElementNS(HTML_NS, tag) as HTMLElementTagNameMap[K];
  node.className = className;
  node.append(...children);
  return node;
}

/** Wrap word-initial matches of the query words in <mark>. */
function highlight(doc: Document, text: string, query: string) {
  const words = query
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (!words.length) return [text];
  const re = new RegExp(`(?<![\\p{L}\\p{N}])(?:${words.join("|")})`, "giu");
  const parts: (Node | string)[] = [];
  let last = 0;
  for (const m of text.matchAll(re)) {
    if (!m[0]) continue;
    parts.push(text.slice(last, m.index));
    parts.push(el(doc, "mark", "", [m[0]]));
    last = m.index! + m[0].length;
  }
  parts.push(text.slice(last));
  return parts;
}

/** Command-palette overlay for one main window. */
export class Palette {
  private root: HTMLDivElement;
  private input: HTMLInputElement;
  private list: HTMLUListElement;
  private hits: Hit[] = [];
  private active = 0;
  // Where focus was before opening, e.g. inside a reader tab
  private returnFocus: Element | null = null;

  constructor(
    private win: Window,
    private actions: PaletteActions,
  ) {
    const doc = win.document;
    this.input = el(doc, "input", `${PREFIX}-input`);
    this.input.type = "search";
    this.input.placeholder = getString("palette-placeholder");
    this.list = el(doc, "ul", `${PREFIX}-list`);

    const accel = Zotero.isMac ? "⌘" : "Ctrl+";
    const hint = (key: string, label: string) =>
      el(doc, "span", "", [el(doc, "kbd", "", [key]), ` ${label}`]);
    const footer = el(doc, "div", `${PREFIX}-footer`, [
      hint("↵", getString("palette-hint-select")),
      hint(`${accel}↵`, getString("palette-hint-open")),
      hint("esc", getString("palette-hint-close")),
    ]);

    const panel = el(doc, "div", `${PREFIX}-panel`, [
      this.input,
      this.list,
      footer,
    ]);
    this.root = el(doc, "div", `${PREFIX}-backdrop`, [panel]);
    this.root.hidden = true;

    this.input.addEventListener("input", () => this.update());
    this.input.addEventListener("keydown", (ev) =>
      this.onKeyDown(ev as KeyboardEvent),
    );
    this.root.addEventListener("mousedown", (ev) => {
      if (ev.target === this.root) this.hide();
    });

    doc.documentElement!.append(this.root);
  }

  get isOpen() {
    return !this.root.hidden;
  }

  show() {
    this.returnFocus = Services.focus.focusedElement;
    this.root.hidden = false;
    this.input.value = "";
    this.update();
    this.input.focus();
  }

  hide(restoreFocus = true) {
    this.root.hidden = true;
    const target = this.returnFocus as HTMLElement | null;
    this.returnFocus = null;
    if (restoreFocus && target && !Components.utils.isDeadWrapper(target)) {
      target.focus();
    }
  }

  toggle() {
    if (this.isOpen) this.hide();
    else this.show();
  }

  destroy() {
    this.root.remove();
  }

  private update() {
    this.hits = this.actions.search(this.input.value);
    this.active = 0;
    this.render();
  }

  private render() {
    const doc = this.win.document;
    const query = this.input.value;
    if (!this.hits.length) {
      const message = query.trim()
        ? getString("palette-no-results")
        : getString("palette-recent-empty");
      this.list.replaceChildren(el(doc, "li", `${PREFIX}-empty`, [message]));
      return;
    }
    this.list.replaceChildren(
      ...this.hits.map((hit, i) => {
        const meta = [hit.firstCreator, hit.year, hit.itemType]
          .filter(Boolean)
          .join(" · ");
        const row = el(doc, "li", `${PREFIX}-row`, [
          el(doc, "div", `${PREFIX}-title`, highlight(doc, hit.title, query)),
          el(doc, "div", `${PREFIX}-meta`, highlight(doc, meta, query)),
        ]);
        row.classList.toggle("active", i === this.active);
        row.addEventListener("mousemove", () => this.setActive(i));
        row.addEventListener("click", (ev) => {
          const { metaKey, ctrlKey } = ev as MouseEvent;
          this.choose(i, Zotero.isMac ? metaKey : ctrlKey);
        });
        return row;
      }),
    );
  }

  private setActive(index: number) {
    if (index === this.active || !this.hits.length) return;
    const rows = this.list.children;
    rows[this.active]?.classList.remove("active");
    this.active = (index + this.hits.length) % this.hits.length;
    const row = rows[this.active];
    row?.classList.add("active");
    row?.scrollIntoView({ block: "nearest" });
  }

  private choose(index: number, open: boolean) {
    const hit = this.hits[index];
    if (!hit) return;
    this.hide(false);
    if (open) this.actions.open(hit.id);
    else this.actions.select(hit.id);
  }

  private onKeyDown(ev: KeyboardEvent) {
    const accel = Zotero.isMac ? ev.metaKey : ev.ctrlKey;
    switch (ev.key) {
      case "ArrowDown":
        this.setActive(this.active + 1);
        break;
      case "ArrowUp":
        this.setActive(this.active - 1);
        break;
      case "n":
      case "p":
        // Emacs-style Ctrl+N / Ctrl+P
        if (!ev.ctrlKey) return;
        this.setActive(this.active + (ev.key === "n" ? 1 : -1));
        break;
      case "Enter":
        this.choose(this.active, accel);
        break;
      case "Escape":
        this.hide();
        break;
      default:
        return;
    }
    ev.preventDefault();
    ev.stopPropagation();
  }
}
