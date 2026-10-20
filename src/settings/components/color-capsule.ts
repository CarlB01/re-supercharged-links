import { setIcon } from "obsidian";

/**
 * Renders an isolated color capsule component representing light/dark theme property profiles.
 * Compliance Edition: Zero inline styles, fully driven by CSS variables and classes.
 */
export function createColorCapsule(
  parent: HTMLElement,
  bgColor: string,
  textColor: string,
  modeName: string,
  fallbackText: string
): void {
  const isDark: boolean = modeName.includes("Dark");
  
  const capsule: HTMLSpanElement = parent.createSpan({
    cls: isDark ? "scl-bg-capsule is-dark" : "scl-bg-capsule"
  });

  const safeBgColor: string = bgColor.length > 0 ? bgColor : "transparent";
  capsule.setAttr("title", `${modeName} background: ${safeBgColor}`);

  if (safeBgColor !== "transparent") {
    capsule.style.setProperty("--scl-capsule-bg", safeBgColor);
  } else {
    capsule.addClass("is-transparent");
  }

  const iconName: string = isDark ? "moon" : "sun";

  const iconEl: HTMLSpanElement = capsule.createSpan({ cls: "scl-color-icon" });
  
  const safeTextColor: string = textColor.length > 0 ? textColor : fallbackText;
  iconEl.setAttr("title", `${modeName} text color: ${safeTextColor}`);
  
  iconEl.style.setProperty("--scl-capsule-color", safeTextColor);

  setIcon(iconEl, iconName);
}
