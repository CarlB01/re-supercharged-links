import { CSSLink } from "../../types/css-link";
import { processKey } from "../../utils/string-utils";

/**
 * Dynamically provisions an inline document preview node mimicking live layout attribute configurations.
 */
export function renderPreviewNote(parent: HTMLElement, selector: CSSLink): void {
  const noteSpan = parent.createSpan({ cls: "data-link-text" });

  if (selector.type === "tag") {
    noteSpan.setAttr("data-link-tags", selector.value || "");
  } else if (selector.type === "attribute") {
    const key = processKey(selector.name || "");
    if (key) noteSpan.setAttr(`data-link-${key}`, selector.value || "");
  } else {
    noteSpan.setAttr("data-link-path", selector.value || "");
  }

  noteSpan.setText("Note");
}

/**
 * Assembles human-readable configuration descriptive strings alongside dynamic inline markup.
 */
export function renderRuleSentence(nameEl: HTMLElement, selector: CSSLink): void {
  const valText = selector.value || "empty";

  if (selector.type === "tag") {
    renderPreviewNote(nameEl, selector);
    nameEl.appendText(" has tag ");
    nameEl.createEl("a", { cls: "tag", text: `#${valText}` });
    return;
  }

  if (selector.type === "attribute") {
    const attrName = selector.name || "empty";
    renderPreviewNote(nameEl, selector);
    nameEl.appendText(" has attribute ");
    nameEl.createEl("b", { text: attrName });
    nameEl.appendText(" with value ");
    nameEl.createEl("b", { text: valText });
    return;
  }

  renderPreviewNote(nameEl, selector);
  nameEl.appendText(" path matches ");
  nameEl.createEl("b", { text: valText });
}
