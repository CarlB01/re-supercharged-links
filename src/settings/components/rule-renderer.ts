import { CSSLink } from "../../types/css-link";

export function renderPreviewNote(parent: HTMLElement, selector: CSSLink): void {
  // Vi oppretter spanet med nøyaktig de samme klassene som en live lenke bruker!
  const noteSpan = parent.createSpan({ 
    cls: `data-link-text scl-rule-${selector.uid}` 
  });

  // Valider verdien
  const val = (selector.value || "").trim();

  // Lagre attributter for å simulere en ekte lenke i DOM-en
  if (selector.type === "tag") {
    noteSpan.setAttribute("data-link-tags", val);
  } else if (selector.type === "attribute") {
    const key = selector.name ? selector.name.trim().toLowerCase().replace(/\s+/g, "-") : "";
    if (key) noteSpan.setAttribute(`data-link-${key}`, val);
  } else {
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
