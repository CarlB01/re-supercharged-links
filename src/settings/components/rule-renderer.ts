import ResuperchargedLinks from "../../core/main";
import { populatePresentationPool } from "../../engine/flyweight-style-pool";
import { CSSLink } from "../../types/css-link";
import { cleanRuleValue, cleanAttributeKey } from "../../metadata/shared-utils";
import { applyStylesAndAttributesToLink } from "../../rendering/dom-writer";

/**
 * Renders the preview link node as an authentic framework link.
 * This allows the core observer and layout engines to catch and style it automatically.
 */
export function renderPreviewNote(parent: HTMLElement, selector: CSSLink, index: number, plugin: ResuperchargedLinks): void {

  const noteAnchor = parent.createEl("a", { 
    cls: `internal-link data-link-text`,
    text: "Note"
  });

  noteAnchor.setAttribute("href", "Note");
  noteAnchor.setAttribute("data-href", "Note");

  const virtualPath = `virtual://preview/${index}`;
	const resolution = plugin.flyweightEngine.getResolution(virtualPath, "Note");

	// 3. Populer poolen og påfør klasser/stiler på nøyaktig samme måte som i resten av appen
	const presentation = populatePresentationPool(resolution);
  
	if (presentation.hasMatch) {
		const inlineStyle = noteAnchor.style;
		const stylesCount = presentation.stylesCount;
		for (let i = 0; i < stylesCount; i++) {
			const key = presentation.styleKeys[i];
			const val = presentation.styleValues[i];
			if (key && val) {
				inlineStyle.setProperty(key, val);
			}
		}

		const classesCount = presentation.classesCount;
		for (let i = 0; i < classesCount; i++) {
			const cls = presentation.classes[i];
			if (cls) {
				noteAnchor.classList.add(cls);
			}
		}
	}
  
}

/**
 * Assembles human-readable configuration descriptive strings alongside dynamic inline markup.
 */
export function renderRuleSentence(
  nameEl: HTMLElement, 
  selector: CSSLink, 
  index: number, 
  plugin: ResuperchargedLinks
): void {
  const valText: string = selector.value || "empty";

  renderPreviewNote(nameEl, selector, index, plugin);

  if (selector.type === "tag") {
    nameEl.appendText(" has tag ");
    
    // Clean any legacy double hash artifacts during real-time visual assembly
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

