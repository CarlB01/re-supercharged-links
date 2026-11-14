import { CSSLink } from "../../types/css-link";

/**
 * Assembles human-readable configuration descriptive strings alongside dynamic inline markup.
 */
export function renderRuleSentence(
  nameEl: HTMLElement, 
  selector: CSSLink
): void {

  nameEl.createSpan({ 
    cls: "internal-link scl-preview-note",
    text: "Note"
  });
  
  const valText: string = selector.value.length > 0 ? selector.value : "empty";

  if (selector.type === "tag") {
    nameEl.appendText(" has tag ");
    
    const cleanDisplayTag: string = valText.trim().replace(/^#/, "");
    nameEl.createSpan({ cls: "tag", text: `#${cleanDisplayTag}` });
    return;
  }
  
  if (selector.type === "attribute") {
    const attrName: string = selector.name || "empty";
    nameEl.appendText(" has attribute ");
    nameEl.createEl("b", { text: attrName });
    nameEl.appendText(" with value ");
    nameEl.createEl("b", { text: valText });
    return;
  }

  nameEl.appendText(" path matches ");
  nameEl.createEl("b", { text: valText });
}

