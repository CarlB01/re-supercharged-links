/**
 * Renders an isolated color capsule component representing light/dark theme property profiles.
 */
export function createColorCapsule(
  parent: HTMLElement,
  bgColor: string | undefined,
  textColor: string | undefined,
  modeName: string,
  fallbackText: string
): void {
  const capsule = parent.createSpan({
    cls: modeName.includes("Dark") ? "scl-bg-capsule is-dark" : "scl-bg-capsule"
  });

  capsule.setAttr("title", `${modeName} background: ${bgColor ?? "transparent"}`);

  if (bgColor && bgColor !== "transparent") {
    capsule.style.backgroundColor = bgColor;
  } else {
    capsule.addClass("is-transparent");
  }

  const dot = capsule.createSpan({ cls: "scl-color-dot" });
  dot.setAttr("title", `${modeName} text color: ${textColor ?? "default"}`);
  dot.style.setProperty("--scl-dot-color", textColor ?? fallbackText);
}
