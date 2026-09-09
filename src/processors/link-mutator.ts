import { processKey, processValue, startsWithToken, endsWithToken, norm } from "../utils/string-utils";
import { findMatchingIcon } from "./rule-sanitizer";
import ResuperchargedLinks from "../main"; // 🔑 Importer hovedklassen din for typesikkerhet

export function clearExtraAttributes(link: HTMLElement): void {
  const attrs = link.attributes;
  for (let i = attrs.length - 1; i >= 0; i--) {
    const attr = attrs[i];
    if (attr && attr.name.includes("data-link")) {
      link.removeAttribute(attr.name);
    }
  }
}

export function extractTagTokensFromElement(el: HTMLElement): string[] {
  const candidates = [
    el.getAttribute("data-tag"),
    el.getAttribute("data-tags"),
    el.getAttribute("href"),
    el.textContent
  ].filter((v): v is string => !!v);

  const out: string[] = [];
  for (const raw of candidates) {
    const parts = raw.trim().split(/\s+/).map(p => p.trim()).filter(Boolean);
    for (let token of parts) {
      token = (() => {
        try {
          return decodeURIComponent(token);
        } catch {
          return token;
        }
      })();
      const hashIdx = token.lastIndexOf("#");
      if (hashIdx > 0 && (token.startsWith("http") || token.startsWith("/"))) {
        token = token.slice(hashIdx);
      }
      const normalized = norm(token);
      if (normalized) out.push(normalized ? `#${normalized.replace(/^#/, "")}` : "");
    }
  }
  return Array.from(new Set(out));
}

export function tagChipStyles(container: HTMLElement, plugin: ResuperchargedLinks): void {
  if (!plugin.settings.enableTagChips) return;

  const tagNodes = container.querySelectorAll("a.tag");
  for (let i = 0; i < tagNodes.length; i++) {
    const n = tagNodes[i];
    if (typeof n === "object" && n !== null && (n as Node).nodeType === 1) {
      const htmlEl = n as HTMLElement;
      const tokens = extractTagTokensFromElement(htmlEl);
      if (!tokens || tokens.length === 0) continue;

      let tagString = "";
      for (const t of tokens) {
        if (!t) continue;
        tagString += (tagString ? " " : "") + t;
        if (t.startsWith("#") && t.length > 1) {
          tagString += " " + t.slice(1);
        }
      }

      if (htmlEl.getAttribute("data-link-tags") !== tagString) {
        htmlEl.setAttribute("data-link-tags", tagString);
      }
      if (!htmlEl.classList.contains("data-link-text")) {
        htmlEl.classList.add("data-link-text");
      }
    }
  }
}

// 🔑 FIKSET: Erstattet plugin: any med plugin: ResuperchargedLinks
export function setLinkNewProps(link: HTMLElement, newProps: Record<string, string>, plugin: ResuperchargedLinks): void {
  let shouldHideBefore = false;
  let shouldHideAfter = false;

  const attrs = link.attributes;
  for (let i = attrs.length - 1; i >= 0; i--) {
    const attr = attrs[i];
    if (!attr) continue; 

    if (attr.name.includes("data-link")) {
      const rawKey = attr.name.replace("data-link-", "");
      if (!Object.prototype.hasOwnProperty.call(newProps, rawKey)) {
        link.removeAttribute(attr.name);
      }
    }
  }

  const visibleText = (link.textContent || "").trim();

  // 🔑 FIKSET: Ingen unsafe-member-access, fordi plugin.settings er fullt definert!
  const { iconBefore, iconAfter } = findMatchingIcon(plugin.settings?.selectors, newProps);

  if (iconBefore && startsWithToken(visibleText, iconBefore)) {
    shouldHideBefore = true;
  }
  if (iconAfter && endsWithToken(visibleText, iconAfter)) {
    shouldHideAfter = true;
  }

  if (!shouldHideAfter && visibleText.length > 1) {
    const cleanedLabel = norm(visibleText);
    const endsWithEmojiSymbol = /[\u2695\u26aa\u26ab\ud83d\udc65\ud83d\udc64\u2600-\u27bf]$/u.test(cleanedLabel); // 🔑 Lagt til 'u' flagg
    if (endsWithEmojiSymbol) {
      shouldHideAfter = true;
    }
  }

  const cssProperties: Record<string, string> = {};

  for (const [key, propValue] of Object.entries(newProps)) {
    const domKey = processKey(key);
    const attributeName = `data-link-${domKey}`;
    const curValue = link.getAttribute(attributeName);
    const newValue = processValue(key, propValue);

    if (!newValue) {
      if (curValue !== null) link.removeAttribute(attributeName);
      continue;
    }

    if (curValue !== newValue) {
      link.setAttribute(attributeName, newValue);
    }

    const variableKey = `--data-link-${domKey}`;
    cssProperties[variableKey] = (newValue.startsWith("http") || newValue.startsWith("data:"))
      ? `url(${newValue})`
      : newValue;
  }

  if (Object.keys(cssProperties).length > 0) {
    link.setCssProps(cssProperties);
  }

  if (shouldHideBefore) {
    if (!link.classList.contains("scl-hide-before")) link.classList.add("scl-hide-before");
  } else {
    if (link.classList.contains("scl-hide-before")) link.classList.remove("scl-hide-before");
  }

  if (shouldHideAfter) {
    if (!link.classList.contains("scl-hide-after")) link.classList.add("scl-hide-after");
  } else {
    if (link.classList.contains("scl-hide-after")) link.classList.remove("scl-hide-after");
  }

  if (!link.classList.contains("data-link-text")) {
    link.classList.add("data-link-text");
  }
}
