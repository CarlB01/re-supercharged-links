import { CSSLink } from "../../types/css-link";
import { cleanRuleValue, cleanAttributeKey } from "../../utils/shared-utils";

/**
 * Renders the preview link node as an authentic framework link.
 * This allows the core observer and layout engines to catch and style it automatically.
 */
export function renderPreviewNote(parent: HTMLElement, selector: CSSLink, index: number): void {
  // ⚡ DELT RUTINE: Bruker din standardiserte verdi-vasker
  const val: string = cleanRuleValue(selector.value); 

  const noteAnchor = parent.createEl("a", { 
    cls: `internal-link data-link-text scl-rule-${index}`,
    text: "Note"
  });

  noteAnchor.setAttribute("href", val);
  noteAnchor.setAttribute("data-href", val);

  if (selector.type === "tag") {
    // ⚡ DELT RUTINE: Garanterer nøyaktig ett #-tegn i datagrunnlaget for tagger
    noteAnchor.setAttribute("data-link-tags", val.length > 0 ? `#${val}` : "");
    noteAnchor.setAttribute("data-tag", val);
  } else if (selector.type === "attribute") {
    // ⚡ DELT RUTINE: Konverterer frontmatter-navn til lower-hyphen delimitation
    const key: string = cleanAttributeKey(selector.name);
    if (key.length > 0) {
      noteAnchor.setAttribute(`data-link-${key}`, val);
    }
  } else if (selector.type === "path") {
    noteAnchor.setAttribute("data-link-path", val);
  }
}

/**
 * Assembles human-readable configuration descriptive strings alongside dynamic inline markup.
 * 🔑 CONTEXTUAL HASH ENFORCER: Guarantees exactly one '#' character is rendered for visual tags.
 */
export function renderRuleSentence(nameEl: HTMLElement, selector: CSSLink, index: number): void {
  const valText: string = selector.value || "empty";

  if (selector.type === "tag") {
    renderPreviewNote(nameEl, selector, index);
    nameEl.appendText(" has tag ");
    
    // Clean any legacy double hash artifacts during real-time visual assembly
    const cleanDisplayTag: string = valText.trim().replace(/^#/, "");
    nameEl.createEl("a", { cls: "tag", text: `#${cleanDisplayTag}` });
    return;
  }

  if (selector.type === "attribute") {
    const attrName: string = selector.name || "empty";
    renderPreviewNote(nameEl, selector, index);
    nameEl.appendText(" has attribute ");
    nameEl.createEl("b", { text: attrName });
    nameEl.appendText(" with value ");
    nameEl.createEl("b", { text: valText });
    return;
  }

  renderPreviewNote(nameEl, selector, index);
  nameEl.appendText(" path matches ");
  nameEl.createEl("b", { text: valText });
}
