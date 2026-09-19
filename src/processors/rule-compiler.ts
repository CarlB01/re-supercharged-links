import { CSSLink } from "../types/css-link";
import { cleanAttributeKey, cleanRuleValue, parseSpaceSeparatedTokens } from "../utils/string-utils";

export type CompiledRuleType = "tag" | "path" | "attribute";

export interface CompiledRule {
  readonly index: number;
  readonly type: CompiledRuleType;
  readonly cleanValue: string;
  readonly cleanAttrKey: string; // only for attribute
  readonly match: (attrs: Readonly<Record<string, string>>) => boolean;

  // style payload (already normalized/default-safe)
  readonly lightColor: string;
  readonly darkColor: string;
  readonly lightBgColor: string;
  readonly darkBgColor: string;
  readonly fontWeight: "normal" | "lighter" | "bold";
  readonly fontStyle: "normal" | "italic" | "underline" | "line-through";
  readonly iconBefore: string;
  readonly iconAfter: string;
}

export function compileSelectors(selectors: readonly CSSLink[]): CompiledRule[] {
  const out: CompiledRule[] = [];

  for (let i = 0; i < selectors.length; i++) {
    const s: CSSLink | null = selectors[i] ?? null;
    if (s === null) continue;

    const type = s.type;
    const cleanValue = cleanRuleValue(s.value);
    if (cleanValue.length === 0) continue;

    const cleanAttrKey = type === "attribute" ? cleanAttributeKey(s.name) : "";

    const match = createMatcher(type, cleanValue, cleanAttrKey);

    out.push({
      index: i,
      type,
      cleanValue,
      cleanAttrKey,
      match,

      lightColor: s.lightColor ?? "",
      darkColor: s.darkColor ?? "",
      lightBgColor: s.lightBgColor ?? "",
      darkBgColor: s.darkBgColor ?? "",
      fontWeight: s.fontWeight ?? "normal",
      fontStyle: s.fontStyle ?? "normal",
      iconBefore: (s.iconBefore ?? "").trim(),
      iconAfter: (s.iconAfter ?? "").trim()
    });
  }

  return out;
}

function createMatcher(
  type: CompiledRuleType,
  cleanValue: string,
  cleanAttrKey: string
): (attrs: Readonly<Record<string, string>>) => boolean {
  if (type === "tag") {
    return (attrs): boolean => {
      const rawTags: string = attrs["tags"] ?? attrs["data-link-tags"] ?? "";
      const cleanTags: string[] = parseSpaceSeparatedTokens(rawTags);
      return cleanTags.includes(cleanValue);
    };
  }

  if (type === "path") {
    return (attrs): boolean => {
      const rawPath: string = attrs["path"] ?? attrs["data-link-path"] ?? "";
      const cleanPath: string = rawPath.toLowerCase().trim();
      return cleanPath.includes(cleanValue);
    };
  }

  // attribute
  return (attrs): boolean => {
    if (cleanAttrKey.length === 0) return false;
    const rawAttrVal: string = attrs[cleanAttrKey] ?? attrs[`data-link-${cleanAttrKey}`] ?? "";
    const cleanAttrVal: string = rawAttrVal.toLowerCase().trim();
    return cleanAttrVal === cleanValue;
  };
}