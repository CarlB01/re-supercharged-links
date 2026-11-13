import ResuperchargedLinks from "../../core/main";
import { CSSLink } from "../../types/css-link";
import { cleanRuleValue, cleanAttributeKey } from "../../utils/shared-utils";
import { applyStylesAndAttributesToLink } from "../../rendering/dom-writer";

/**
 * Assembles human-readable configuration descriptive strings alongside dynamic inline markup.
 */
export function renderRuleSentence(
  nameEl: HTMLElement, 
  selector: CSSLink
): void {

  const noteAnchor = nameEl.createEl("a", { 
    cls: "internal-link",
    text: "Note",
    href: "Note"
  });
  noteAnchor.setAttribute("data-href", "Note");
  
  const valText: string = selector.value.length > 0 ? selector.value : "empty";

  if (selector.type === "tag") {
    nameEl.appendText(" has tag ");
    
    const cleanDisplayTag: string = valText.trim().replace(/^#/, "");
    nameEl.createEl("a", { cls: "tag", text: `#${cleanDisplayTag}` });
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

export function renderCleanPreviewNote(containerEl: HTMLElement, rule: CSSLink, masterIndex: number, plugin: ResuperchargedLinks): void {
    containerEl.empty();

    const noteEl = containerEl.createDiv({
        cls: "internal-link",
        text: "Note"
    });

    const rawValue = cleanRuleValue(rule.value);

    const mockProps: Record<string, string> = {};

    if (rule.type === "tag" && rawValue.length > 0) {
        mockProps["tags"] = rawValue;
    } else if (rule.type === "attribute" && rule.name) {
        const cleanKey = cleanAttributeKey(rule.name);
        if (cleanKey.length > 0) {
            mockProps[cleanKey] = rawValue;
        }
    } else if (rule.type === "path" && rawValue.length > 0) {
        mockProps["path"] = rawValue;
    }

    applyStylesAndAttributesToLink(noteEl, mockProps, plugin);
}

