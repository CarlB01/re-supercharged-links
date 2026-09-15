import { App, debounce, PluginSettingTab, SettingDefinitionItem, Setting, SettingGroupItem, setIcon } from "obsidian";
import ResuperchargedLinks from "../main";
import { updateVisibleLinks } from "../views/view-updaters";
import { CSSLink } from "../types/css-link";
import { sanitizeRule } from "../processors/rule-sanitizer";
import { clearColorHistory } from "./components/color-row-factory";
import { getRuleDetailItems } from "./components/detail-rows-factory";
import { createColorCapsule } from "./components/color-capsule";
import { renderRuleSentence } from "./components/rule-renderer";
import { cleanSearchQuery, parseControlValueKey } from "../utils/string-utils";

type MyGroupItems = SettingDefinitionItem | { render: (setting: Setting) => void };

export default class SCLSettingTab extends PluginSettingTab {
  public plugin: ResuperchargedLinks;
  private readonly debouncedGenerate: () => void;
  private rulesSearchQuery = "";
  public activeEditUid: string | null = null;
  private paneStyleEl: HTMLStyleElement | null = null;

  constructor(app: App, plugin: ResuperchargedLinks) {
    super(app, plugin);
    this.plugin = plugin;
    this.debouncedGenerate = debounce(() => { void this._generateSnippet(); }, 300, true);
    void this._generateSnippet();

    this.plugin.registerDomEvent(this.containerEl, "click", (e: MouseEvent) => {
      const target: HTMLElement | null = (e.target as HTMLElement) ?? null;
      if (target === null) return;
      
      const clickedRow: HTMLElement | null = target.closest(".scl-clickable-row") ?? null;
      if (clickedRow === null || target.closest(".clickable-icon, button, input, select, .scl-bg-capsule, .scl-color-dot")) return;

      const selectors: CSSLink[] = this.plugin.settings.selectors ?? [];
      const filteredSelectors: CSSLink[] = this.getFilteredSelectors(selectors);
      const allRows: Element[] = Array.from(this.containerEl.querySelectorAll(".vertical-tab-content-container .scl-clickable-row"));
      const index: number = allRows.indexOf(clickedRow);
      const selector: CSSLink | null = filteredSelectors[index] ?? null;
      if (selector === null) return;

      clearColorHistory();

      this.activeEditUid = this.activeEditUid === selector.uid ? null : selector.uid;
      this.refreshUI();
    });
  }

  public hide(): void {
    clearColorHistory();
    const styleEl: HTMLStyleElement | null = this.paneStyleEl;
    if (styleEl !== null) {
      styleEl.remove();
      this.paneStyleEl = null;
    }
    super.hide();
  }

  public refreshUI(): void { 
    this.update(); 
  }

  private getFilteredSelectors(selectors: CSSLink[]): CSSLink[] {
    const q: string = cleanSearchQuery(this.rulesSearchQuery);
    if (q.length === 0) return selectors;
    return selectors.filter((s: CSSLink): boolean => {
      return [s.type ?? "", s.name ?? "", s.value ?? "", s.iconBefore ?? "", s.iconAfter ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }

  private renderRuleBadges(setting: Setting, selector: CSSLink): void {
    const badgeContainer: HTMLElement = setting.controlEl.createSpan({ cls: "scl-badge-container" });
    createColorCapsule(badgeContainer, selector.lightBgColor ?? "transparent", selector.lightColor ?? "", "Light mode", "var(--text-normal)");
    createColorCapsule(badgeContainer, selector.darkBgColor ?? "transparent", selector.darkColor ?? "", "Dark mode", "var(--text-muted)");
  }

  private renderReorderGrip(setting: Setting, index: number, selectors: CSSLink[]): void {
    const wrap: HTMLElement = setting.controlEl.createDiv({ cls: "scl-reorder-inline" });
    const grip: HTMLElement = wrap.createEl("button", {
      cls: "clickable-icon extra-setting-button mod-drag-handle scl-grip-btn",
      attr: { "aria-label": "Reorder (tap: down, long-press/Shift: up)", type: "button" }
    });

    setIcon(grip, "grip-vertical");
    let longPressTriggered: boolean = false;

    const moveBy = (direction: number): void => {
      const targetIndex: number = index + direction;
      if (targetIndex >= 0 && targetIndex < selectors.length) {
        void this.moveRule(index, direction, selectors);
      }
    };

    const onLongPress = debounce((): void => { longPressTriggered = true; moveBy(-1); }, 380, true);
    const cancelLongPress = (): void => { onLongPress.cancel(); };

    this.plugin.registerDomEvent(grip, "pointerup", cancelLongPress);
    this.plugin.registerDomEvent(grip, "pointercancel", cancelLongPress);
    this.plugin.registerDomEvent(grip, "pointerleave", cancelLongPress);
    this.plugin.registerDomEvent(grip, "pointerdown", (e: PointerEvent): void => { if (e.pointerType === "touch") { longPressTriggered = false; onLongPress(); } });
    this.plugin.registerDomEvent(grip, "click", (e: MouseEvent): void => { e.preventDefault(); e.stopPropagation(); if (longPressTriggered) { longPressTriggered = false; return; } moveBy(e.shiftKey ? -1 : 1); });
  }

  private _generateSnippet(): void {
    updateVisibleLinks(this.app, this.plugin);
    this.plugin.refreshEditorThemes();
    window.requestAnimationFrame((): void => {
      this.compilePaneStyles();
    });
  }

  override getControlValue(key: string): unknown {
    if (key === "scl_rules_search") return this.rulesSearchQuery;
    const settings: ResuperchargedLinks["settings"] = this.plugin.settings;
    
    // ⚡ STRIPPED CORE KEYS: Retained only the actual functional toggles
    const coreKeys: string[] = ["enableTagChips", "getFromInlineField"];
    if (coreKeys.includes(key)) return (settings as unknown as Record<string, unknown>)[key];

    if (key.startsWith("scl_")) {
      const { prop, uid } = parseControlValueKey(key);
      const selectors: CSSLink[] = settings.selectors ?? [];
      const selector: CSSLink | null = selectors.find((s: CSSLink): boolean => s.uid === uid) ?? null;
      const editableProps: string[] = ["type", "name", "value", "iconBefore", "iconAfter", "lightColor", "darkColor", "lightBgColor", "darkBgColor", "fontWeight", "fontStyle"];
      
      if (selector !== null && prop.length > 0 && editableProps.includes(prop)) {
        return (selector as unknown as Record<string, unknown>)[prop];
      }
    }
    return undefined;
  }

  override getSettingDefinitions(): SettingDefinitionItem[] {
    const definitions: SettingDefinitionItem[] = [];
    const selectors: CSSLink[] = this.plugin.settings.selectors ?? [];
    const filteredSelectors: CSSLink[] = this.getFilteredSelectors(selectors);
    const existingRuleItems: MyGroupItems[] = [];

    filteredSelectors.forEach((selector: CSSLink): void => {
      const index: number = selectors.indexOf(selector);
      const isEditing: boolean = this.activeEditUid === selector.uid;
      existingRuleItems.push({ render: (setting: Setting) => this.renderRuleRow(setting, selector, index, selectors, isEditing) });
      
      if (isEditing) {
        const detailItems: unknown = getRuleDetailItems(this, selector, index, selectors);
        existingRuleItems.push(...(detailItems as MyGroupItems[]));
      }
    });

    const ruleItems: MyGroupItems[] = [
      {
        render: (setting: Setting): void => {
          setting.setName("Search").setDesc("Filter style rules.").settingEl.addClass("scl-search-row");
          setting.addSearch((cb): void => { cb.setPlaceholder("Search style rules...").setValue(this.rulesSearchQuery).onChange((value: string | null): void => { this.rulesSearchQuery = value ?? ""; this.refreshUI(); }); });
        }
      },
      ...(existingRuleItems.length > 0 ? existingRuleItems : [{ name: "No matching rules", desc: "Try another search term." }])
    ];

    definitions.push({ type: "group", heading: "Link Styling Rules", items: ruleItems as unknown as SettingGroupItem<string>[] });
    
    definitions.push({
      type: "group",
      heading: "NEW rules",
      items: [{
        name: "Create a new style rule",
        desc: "Add a new template selector with preconfigured colors.",
        render: (setting: Setting): void => {
          setting.addButton((btn): void => { btn.setButtonText("Create").onClick((): void => {
            const newSelector: CSSLink = new CSSLink();
            newSelector.type = "tag";
            newSelector.value = "new-tag";
            const generatedColors = this.generateUniqueColors();
            newSelector.lightColor = generatedColors.light;
            newSelector.darkColor = generatedColors.dark;
            newSelector.lightBgColor = "transparent";
            newSelector.darkBgColor = "transparent";
            selectors.push(newSelector);
            this.plugin.compileActiveAttributes();
            void this.plugin.saveSettings();
            void this._generateSnippet();
            this.activeEditUid = newSelector.uid;
            this.refreshUI();
          }); });
        }
      }]
    });

    // ⚡ CONSOLIDATED GENERAL CONFIGURATION: Pure data source triggers remaining
    definitions.push({
      type: "group",
      heading: "Advanced Settings Overview",
      items: [{
        type: "page",
        name: "Advanced Settings",
        desc: "Configure global panels and triggers.",
        items: [
          {
            type: "group",
            heading: "General Configurations",
            items: [
              { name: "Style tag chips (a.tag)", desc: "Apply Supercharged styles to tag chips in supported views.", control: { type: "toggle", key: "enableTagChips" } },
              { name: "Read inline fields", desc: "Enable Dataview inline field parsing.", control: { type: "toggle", key: "getFromInlineField" } }
            ]
          }
        ]
      }]
    });

    return definitions;
  }

  private renderRuleRow(setting: Setting, selector: CSSLink, index: number, selectors: CSSLink[], isEditing: boolean): void {
    setting.settingEl.className = "setting-item scl-clickable-row scl-main-rule-row";
    setting.settingEl.addClass("markdown-rendered");
    if (isEditing) setting.settingEl.addClass("is-active");
    
    setting.settingEl.setAttribute("data-uid", selector.uid);

    setting.nameEl.empty();
    renderRuleSentence(setting.nameEl, selector);
    this.renderRuleBadges(setting, selector);
    this.renderReorderGrip(setting, index, selectors);

    window.requestAnimationFrame((): void => {
      this.compilePaneStyles();
    });
  }

  private async moveRule(index: number, direction: number, selectors: CSSLink[]): Promise<void> {
    const targetIndex: number = index + direction;
    const currentSelector: CSSLink | null = selectors[index] ?? null;
    const targetSelector: CSSLink | null = selectors[targetIndex] ?? null;
    if (currentSelector === null || targetSelector === null) return;

    const allRowsBefore: Element[] = Array.from(document.querySelectorAll(".vertical-tab-content-container .scl-clickable-row"));
    const currentRowBefore: Element | null = allRowsBefore[index] ?? null;
    const targetRowBefore: Element | null = allRowsBefore[targetIndex] ?? null;
    const currentRect: DOMRect | null = currentRowBefore !== null ? currentRowBefore.getBoundingClientRect() : null;
    const targetRect: DOMRect | null = targetRowBefore !== null ? targetRowBefore.getBoundingClientRect() : null;

    selectors[targetIndex] = currentSelector;
    selectors[index] = targetSelector;

    this.plugin.compileActiveAttributes();
    await this.plugin.saveSettings();
    this._generateSnippet();
    this.refreshUI();

    if (currentRect !== null && targetRect !== null) {
      window.setTimeout((): void => {
        const allRowsAfter: NodeListOf<Element> = document.querySelectorAll(".vertical-tab-content-container .scl-clickable-row");
        const movedRow: HTMLElement | null = (allRowsAfter[targetIndex] as HTMLElement) ?? null;
        const swappedRow: HTMLElement | null = (allRowsAfter[index] as HTMLElement) ?? null;
        if (movedRow !== null && swappedRow !== null) {
          movedRow.animate([{ transform: `translateY(${currentRect.top - targetRect.top}px)` }, { transform: "translateY(0)" }], { duration: 250, easing: "ease-in-out" });
          swappedRow.animate([{ transform: `translateY(${targetRect.top - currentRect.top}px)` }, { transform: "translateY(0)" }], { duration: 250, easing: "ease-in-out" });
        }
      }, 0);
    }
  }

  private generateUniqueColors(): { light: string; dark: string } {
    const hue: number = Math.floor(Math.random() * 360);
    const hslToHex = (h: number, s: number, l: number): string => {
      l /= 100;
      const a = (s * Math.min(l, 1 - l)) / 100;
      const f = (n: number): string => {
        const k: number = (n + h / 30) % 12;
        const color: number = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
        return Math.round(255 * color).toString(16).padStart(2, "0");
      };
      return `#${f(0)}${f(8)}${f(4)}`;
    };
    return { light: hslToHex(hue, 65, 35), dark: hslToHex(hue, 80, 75) };
  }

  override async setControlValue(key: string, value: unknown, silent = false): Promise<void> {
    if (key === "scl_rules_search") { this.handleSearchQuery(value); return; }
    if (key.startsWith("scl_")) this.handleRuleFieldUpdate(key, value); else this.handleGlobalSettingUpdate(key, value);

    this.plugin.compileActiveAttributes();
    await this.plugin.saveSettings();
    this.debouncedGenerate();
    if (!silent) this.refreshUI();
  }

  private handleSearchQuery(value: unknown): void { this.rulesSearchQuery = String(value ?? ""); this.refreshUI(); }

  private handleRuleFieldUpdate(key: string, value: unknown): void {
    const { prop, uid } = parseControlValueKey(key);
    const selectors: CSSLink[] = this.plugin.settings.selectors ?? [];
    const selector: CSSLink | null = selectors.find((s: CSSLink): boolean => s.uid === uid) ?? null;
    const editableProps: string[] = ["type", "name", "value", "iconBefore", "iconAfter", "lightColor", "darkColor", "lightBgColor", "darkBgColor", "fontWeight", "fontStyle"];

    if (selector !== null && prop.length > 0 && editableProps.includes(prop)) {
      const ruleProxy: Record<string, unknown> = selector as unknown as Record<string, unknown>;
      
      // 🔑 CLEAN INPUT GUARD: Strip any accidental leading '#' from tag rules in the UI layer
      let cleanValue = value;
      if (prop === "value" && typeof value === "string" && selector.type === "tag") {
        cleanValue = value.trim().replace(/^#/, "");
      }
      
      ruleProxy[prop] = cleanValue;

      const sanitized: CSSLink = sanitizeRule(selector);
      selector.match = sanitized.match;
      selector.value = sanitized.value;
    }
  }

  private handleGlobalSettingUpdate(key: string, value: unknown): void {
    (this.plugin.settings as unknown as Record<string, unknown>)[key] = value;
  }

  public compilePaneStyles(): void {
    const selectors: CSSLink[] = this.plugin.settings?.selectors ?? [];
    const isDark: boolean = document.body.classList.contains("theme-dark");

    for (let i: number = 0; i < selectors.length; i++) {
      const rule: CSSLink | null = selectors[i] ?? null;
      if (rule === null) continue;

      const activeColor: string = isDark ? (rule.darkColor ?? "") : (rule.lightColor ?? "");
      const activeBg: string = isDark ? (rule.darkBgColor ?? "") : (rule.lightBgColor ?? "");

      // Locate the physical preview link anchor inside the settings tab DOM tree
      const noteEl: HTMLElement | null = this.containerEl.querySelector<HTMLElement>(`.data-link-text.scl-rule-${rule.uid}`) ?? null;
      
      if (noteEl !== null) {
        const targetStyles: Partial<CSSStyleDeclaration> = {
          color: activeColor.length > 0 ? activeColor : "var(--text-normal)",
          backgroundColor: (activeBg.length > 0 && activeBg !== "transparent") ? activeBg : "transparent",
          fontWeight: (rule.fontWeight && rule.fontWeight !== "normal") ? rule.fontWeight : "normal",
          fontStyle: "normal",
          textDecoration: "none"
        };
        
        if (rule.fontStyle === "italic") {
          targetStyles.fontStyle = "italic";
        } else if (rule.fontStyle === "underline") {
          targetStyles.textDecoration = "underline";
        } else if (rule.fontStyle === "line-through") {
          targetStyles.textDecoration = "line-through";
        }

        noteEl.setCssStyles(targetStyles);

        // 🔑 ATTRIBUTE INTEROPERABILITY HARMONIZATION: Re-inject the standardized '#' prefix 
        // exclusively onto the DOM data-attributes of the preview container.
        // This ensures the preview node context mirrors the exact footprint required by CSS sheets.
        const val: string = (rule.value || "").trim();
        if (rule.type === "tag" && val.length > 0) {
          const cleanTag = val.replace(/^#/, "");
          noteEl.setAttribute("data-link-tags", `#${cleanTag}`);
        }

        // Wipe any stale background legacy icon nodes before re-rendering widgets
        const oldIcons: NodeListOf<Element> = noteEl.querySelectorAll(".scl-inline-icon");
        oldIcons.forEach((icon: Element): void => icon.remove());

        const iconBefore: string = (rule.iconBefore ?? "").trim();
        const iconAfter: string = (rule.iconAfter ?? "").trim();

        if (iconBefore.length > 0) {
          // Leverage the root window layout instance context to generate stable elements safely
          const spanBefore: HTMLElement = noteEl.win.createEl("span", {
            cls: "scl-inline-icon scl-inline-icon-before",
            text: iconBefore
          });
          spanBefore.setCssStyles({ display: "inline-block" });
          noteEl.insertBefore(spanBefore, noteEl.firstChild);
        }

        if (iconAfter.length > 0) {
          // Leverage the root window layout instance context to generate stable elements safely
          const spanAfter: HTMLElement = noteEl.win.createEl("span", {
            cls: "scl-inline-icon scl-inline-icon-after",
            text: iconAfter
          });
          spanAfter.setCssStyles({ display: "inline-block" });
          noteEl.appendChild(spanAfter);
        }
      }
    }
  }
}
