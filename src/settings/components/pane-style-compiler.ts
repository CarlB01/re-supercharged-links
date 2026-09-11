import { CSSLink } from "../../types/css-link";

/**
 * High-performance UI style injector.
 * Compiles a localized in-memory `<style>` sheet specifically targeting setting tab preview caps.
 */
export function compilePaneStyles(containerEl: HTMLElement, selectors: CSSLink[]): HTMLStyleElement {
	let styleEl = containerEl.querySelector("#scl-setting-runtime-styles") as HTMLStyleElement | null;
	if (!styleEl) {
		styleEl = document.createElement("style");
		styleEl.id = "scl-setting-runtime-styles";
		containerEl.appendChild(styleEl);
	}

	const cssLines: string[] = [];
	const isDark = document.body.classList.contains("theme-dark");

	for (let i = 0; i < selectors.length; i++) {
		const rule = selectors[i];
		if (!rule) continue;

		const activeColor = isDark ? rule.darkColor : rule.lightColor;
		const activeBg = isDark ? rule.darkBgColor : rule.lightBgColor;
		const baseSelector = `.vertical-tab-content-container [data-uid="${rule.uid}"] .data-link-text`;

		cssLines.push(`${baseSelector} {`);
		if (activeColor) cssLines.push(`  color: ${activeColor};`);
		if (activeBg && activeBg !== "transparent") cssLines.push(`  background-color: ${activeBg};`);
		if (rule.fontWeight && rule.fontWeight !== "normal") cssLines.push(`  font-weight: ${rule.fontWeight};`);
		
		if (rule.fontStyle === "italic") cssLines.push(`  font-style: italic;`);
		else if (rule.fontStyle === "underline") cssLines.push(`  text-decoration: underline;`);
		else if (rule.fontStyle === "line-through") cssLines.push(`  text-decoration: line-through;`);
		cssLines.push(`}`);
	}

	styleEl.textContent = cssLines.join("\n");
	return styleEl;
}
