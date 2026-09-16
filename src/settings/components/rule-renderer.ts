import { CSSLink } from "../../types/css-link";
import { cleanAttributeKey } from "../../utils/string-utils";

/**
 * Renders the standalone preview link node inside the settings tab row framework.
 * 🔑 RUNTIME INDEX MATRIX: Uses the dynamic row sequence index (index) instead of selector.uid.
 */
export function renderPreviewNote(parent: HTMLElement, selector: CSSLink, index: number): void {
  // ⚡ FIX: Assign the lightweight runtime class index (scl-rule-0, scl-rule-1)
  const noteSpan = parent.createSpan({ 
    cls: `data-link-text scl-rule-${index}` 
  });

  const val: string = (selector.value || "").trim();

  if (selector.type === "tag") {
    noteSpan.setAttribute("data-link-tags", val);
  } else if (selector.type === "attribute") {
    const key: string = cleanAttributeKey(selector.name);
    if (key.length > 0) noteSpan.setAttribute(`data-link-${key}`, val);
  } else {
    noteSpan.setAttribute("data-link-path", val);
  }

  noteSpan.setText("Note");
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
