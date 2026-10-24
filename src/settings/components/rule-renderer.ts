import ResuperchargedLinks from "../../core/main";
import { CSSLink } from "../../types/css-link";
import { cleanRuleValue, cleanAttributeKey } from "../../utils/shared-utils";
import { applyStylesAndAttributesToLink } from "../../views/dom-mutator";

/**
 * Renders the preview link node as an authentic framework link.
 * This allows the core observer and layout engines to catch and style it automatically.
 */
export function renderPreviewNote(parent: HTMLElement, selector: CSSLink, index: number): void {
  const val: string = cleanRuleValue(selector.value); 

  const noteAnchor = parent.createEl("a", { 
    cls: `internal-link data-link-text scl-rule-${index}`,
    text: "Note"
  });

  noteAnchor.setAttribute("href", "Note");
  noteAnchor.setAttribute("data-href", "Note");

  if (selector.type === "tag") {
    noteAnchor.setAttribute("data-link-tags", val.length > 0 ? `#${val}` : "");
    noteAnchor.setAttribute("data-tag", val);
  } else if (selector.type === "attribute") {
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

