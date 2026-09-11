import { CSSLink } from "../../types/css-link";
import { processKey } from "../../utils/string-utils";

/**
 * Dynamically provisions an inline document preview node mimicking live layout attribute configurations.
 */
export function renderPreviewNote(parent: HTMLElement, selector: CSSLink): void {
  const noteSpan = parent.createSpan({ cls: "data-link-text" });

  // Bind den unike regelen sin UID slik at compilePaneStyles fanger den opp
  noteSpan.setAttribute("data-uid", selector.uid);

  // Vask og normaliser verdien
  const val = (selector.value || "").trim();

  // 🔑 FIKSET: Vi lagrer verdien i BÅDE standard-feltet og data-link feltet 
  // for å garantere at findMatchingRule fanger den opp uansett visnings-kontekst!
  if (selector.type === "tag") {
    noteSpan.setAttribute("tags", val);
    noteSpan.setAttribute("data-link-tags", val);
  } else if (selector.type === "attribute") {
    const key = selector.name ? selector.name.trim().toLowerCase().replace(/\s+/g, "-") : "";
    if (key) {
      noteSpan.setAttribute(key, val);
      noteSpan.setAttribute(`data-link-${key}`, val);
    }
  } else {
    noteSpan.setAttribute("path", val);
    noteSpan.setAttribute("data-link-path", val);
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
