import { App, debounce, PluginSettingTab, SettingDefinitionItem, Setting, SettingGroupItem, setIcon } from "obsidian";
import ResuperchargedLinks from "../main";
import { updateVisibleLinks } from "../views/view-updaters";
import { CSSLink } from "../types/css-link";
import { sanitizeRule } from "../processors/rule-sanitizer";
import { clearColorHistory } from "./components/color-row-factory";
import { getRuleDetailItems } from "./components/detail-rows-factory"; // 🔑 Importerer den nye fabrikken

// Import layout micro-components
import { createColorCapsule } from "./components/color-capsule";
import { renderRuleSentence } from "./components/rule-renderer";
type MyGroupItems = SettingDefinitionItem | { render: (setting: Setting) => void };

export default class SCLSettingTab extends PluginSettingTab {
  plugin: ResuperchargedLinks;
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
      const target = e.target as HTMLElement;
      if (!target) return;
      
      const clickedRow = target.closest(".scl-clickable-row") as HTMLElement;
      if (!clickedRow || target.closest(".clickable-icon, button, input, select, .scl-bg-capsule, .scl-color-dot")) return;

      const selectors = this.plugin.settings.selectors || [];
      const filteredSelectors = this.getFilteredSelectors(selectors);
      const allRows = Array.from(this.containerEl.querySelectorAll(".vertical-tab-content-container .scl-clickable-row"));
      const index = allRows.indexOf(clickedRow);
      const selector = filteredSelectors[index];
      if (!selector) return;

      clearColorHistory();

      this.activeEditUid = this.activeEditUid === selector.uid ? null : selector.uid;
      this.refreshUI();
    });
  }

  hide(): void {
    clearColorHistory();
    if (this.paneStyleEl) {
      this.paneStyleEl.remove();
      this.paneStyleEl = null;
    }
    super.hide();
  }

  public refreshUI(): void { 
    this.update(); 
  }

  private getFilteredSelectors(selectors: CSSLink[]): CSSLink[] {
    const q = this.rulesSearchQuery.trim().toLowerCase();
    if (!q) return selectors;
    return selectors.filter((s) => {
      return [s.type??"", s.name??"", s.value??"", s.iconBefore??"", s.iconAfter??""].join(" ").toLowerCase().includes(q);
    });
  }

  private renderRuleBadges(setting: Setting, selector: CSSLink): void {
    const badgeContainer = setting.controlEl.createSpan({ cls: "scl-badge-container" });
    createColorCapsule(badgeContainer, selector.lightBgColor, selector.lightColor, "Light mode", "var(--text-normal)");
    createColorCapsule(badgeContainer, selector.darkBgColor, selector.darkColor, "Dark mode", "var(--text-muted)");
  }

  private renderReorderGrip(setting: Setting, index: number, selectors: CSSLink[]): void {
    const wrap = setting.controlEl.createDiv({ cls: "scl-reorder-inline" });
    const grip = wrap.createEl("button", {
      cls: "clickable-icon extra-setting-button mod-drag-handle scl-grip-btn",
      attr: { "aria-label": "Reorder (tap: down, long-press/Shift: up)", type: "button" }
    });

    setIcon(grip, "grip-vertical");
    let longPressTriggered = false;

    const moveBy = (direction: number) => {
      const targetIndex = index + direction;
      if (targetIndex >= 0 && targetIndex < selectors.length) void this.moveRule(index, direction, selectors);
    };

    const onLongPress = debounce(() => { longPressTriggered = true; moveBy(-1); }, 380, true);
    const cancelLongPress = () => onLongPress.cancel();

    this.plugin.registerDomEvent(grip, "pointerup", cancelLongPress);
    this.plugin.registerDomEvent(grip, "pointercancel", cancelLongPress);
    this.plugin.registerDomEvent(grip, "pointerleave", cancelLongPress);
    this.plugin.registerDomEvent(grip, "pointerdown", (e) => { if (e.pointerType === "touch") { longPressTriggered = false; onLongPress(); } });
    this.plugin.registerDomEvent(grip, "click", (e) => { e.preventDefault(); e.stopPropagation(); if (longPressTriggered) { longPressTriggered = false; return; } moveBy(e.shiftKey ? -1 : 1); });
  }

  private _generateSnippet() {
    updateVisibleLinks(this.app, this.plugin);
    this.plugin.refreshEditorThemes();
    window.requestAnimationFrame(() => {
      this.compilePaneStyles();
    });
  }

  override getControlValue(key: string): unknown {
    if (key === "scl_rules_search") return this.rulesSearchQuery;
    const settings = this.plugin.settings;
    const coreKeys = ["targetTags", "enableTagChips", "getFromInlineField", "activateSnippet", "enableEditor", "enableTabHeader", "enableFileList", "enableBacklinks", "enableQuickSwitcher", "enableSuggestor", "enableBases"];
    if (coreKeys.includes(key)) return (settings as unknown as Record<string, unknown>)[key];

    if (key.startsWith("scl_")) {
      const parts = key.split("_");
      const prop = parts[1] ?? "";
      const uid = parts[2] ?? "";
      
      const selector = settings.selectors.find((s) => s.uid === uid);
      const editableProps = ["type", "name", "value", "iconBefore", "iconAfter", "lightColor", "darkColor", "lightBgColor", "darkBgColor", "fontWeight", "fontStyle"];
      if (selector && prop && editableProps.includes(prop)) {
        return (selector as unknown as Record<string, unknown>)[prop];
      }
    }
    return undefined;
  }

  override getSettingDefinitions(): SettingDefinitionItem[] {
    const definitions: SettingDefinitionItem[] = [];
    const selectors = this.plugin.settings.selectors || [];
    const filteredSelectors = this.getFilteredSelectors(selectors);
    const existingRuleItems: MyGroupItems[] = [];

    filteredSelectors.forEach((selector) => {
      const index = selectors.indexOf(selector);
      const isEditing = this.activeEditUid === selector.uid;
      existingRuleItems.push({ render: (setting: Setting) => this.renderRuleRow(setting, selector, index, selectors, isEditing) });
      
      // 🔑 KALLER EKSTERN FABRIKK: Henter alle detaljradene typesikkert og ferdig renset!
      if (isEditing) {
        // 🔑 REKTIG & ELEGANT: Vi pakker hele tab-instansen inn i en typesikker kontrakt
        const detailItems = getRuleDetailItems(this, selector, index, selectors);
        existingRuleItems.push(...(detailItems as MyGroupItems[]));
      }
    });

    const ruleItems: MyGroupItems[] = [
      {
        render: (setting: Setting) => {
          setting.setName("Search").setDesc("Filter style rules.").settingEl.addClass("scl-search-row");
          setting.addSearch((cb) => { cb.setPlaceholder("Search style rules...").setValue(this.rulesSearchQuery).onChange((value) => { this.rulesSearchQuery = value ?? ""; this.refreshUI(); }); });
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
        render: (setting: Setting) => {
          setting.addButton((btn) => btn.setButtonText("Create").onClick(() => {
            const newSelector = new CSSLink();
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
          }));
        }
      }]
    });

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
            heading: "General",
            items: [
              { name: "Parse all tags in file", desc: "Read tags from frontmatter and inline.", control: { type: "toggle", key: "targetTags" } },
              { name: "Style tag chips (a.tag)", desc: "Apply Supercharged styles to tag chips in supported views.", control: { type: "toggle", key: "enableTagChips" } },
              { name: "Automatically activate CSS snippet", desc: "Enable generated snippet.", control: { type: "toggle", key: "activateSnippet" } }
            ]
          },
          {
            type: "group",
            heading: "Where to Supercharge",
            items: [
              { name: "Enable in Editor", desc: "Live Preview support.", control: { type: "toggle", key: "enableEditor" } },
              { name: "Enable in Tab Headers", desc: "Apply styling in tab titles.", control: { type: "toggle", key: "enableTabHeader" } },
              { name: "Enable in Plugins & Panels", desc: "Apply styling in backlinks/panels.", control: { type: "toggle", key: "enableBacklinks" } }
            ]
          },
          {
            type: "group",
            heading: "Display Panels",
            items: [
              { name: "Activate in File Browser", desc: "Apply styling in file explorer.", control: { type: "toggle", key: "enableFileList" } },
              { name: "Activate in Quick Switcher", desc: "Apply styling in quick switcher.", control: { type: "toggle", key: "enableQuickSwitcher" } },
              { name: "Activate in Link Autocompleter", desc: "Apply styling in [[ suggestions.", control: { type: "toggle", key: "enableSuggestor" } },
              { name: "Activate in Bases", desc: "Apply styling to internal links in Bases tables/views.", control: { type: "toggle", key: "enableBases" } }
            ]
          },
          {
            type: "group",
            heading: "Experimental Data Sources",
            items: [
              { name: "Read inline fields", desc: "Enable Dataview inline field parsing.", control: { type: "toggle", key: "getFromInlineField" } }
            ]
          }
        ]
      }]
    });

    return definitions;
  }

  private renderRuleRow(setting: Setting, selector: CSSLink, index: number, selectors: CSSLink[], isEditing: boolean) {
    setting.settingEl.className = "setting-item scl-clickable-row scl-main-rule-row";
    setting.settingEl.addClass("markdown-rendered");
    if (isEditing) setting.settingEl.addClass("is-active");
    
    setting.settingEl.setAttribute("data-uid", selector.uid);

    setting.nameEl.empty();
    renderRuleSentence(setting.nameEl, selector);
    this.renderRuleBadges(setting, selector);
    this.renderReorderGrip(setting, index, selectors);

    window.requestAnimationFrame(() => {
      this.compilePaneStyles();
    });
  }

  private async moveRule(index: number, direction: number, selectors: CSSLink[]) {
    const targetIndex = index + direction;
    const currentSelector = selectors[index];
    const targetSelector = selectors[targetIndex];
    if (!currentSelector || !targetSelector) return;

    const allRowsBefore = Array.from(document.querySelectorAll(".vertical-tab-content-container .scl-clickable-row"));
    const currentRowBefore = allRowsBefore[index];
    const targetRowBefore = allRowsBefore[targetIndex];
    const currentRect = currentRowBefore?.getBoundingClientRect();
    const targetRect = targetRowBefore?.getBoundingClientRect();

    selectors[targetIndex] = currentSelector;
    selectors[index] = targetSelector;

    this.plugin.compileActiveAttributes();
    await this.plugin.saveSettings();
    this._generateSnippet();
    this.refreshUI();

    if (currentRect && targetRect) {
      window.setTimeout(() => {
        const allRowsAfter = document.querySelectorAll(".vertical-tab-content-container .scl-clickable-row");
        const movedRow = allRowsAfter[targetIndex] as HTMLElement;
        const swappedRow = allRowsAfter[index] as HTMLElement;
        if (movedRow && swappedRow) {
          movedRow.animate([{ transform: `translateY(${currentRect.top - targetRect.top}px)` }, { transform: "translateY(0)" }], { duration: 250, easing: "ease-in-out" });
          swappedRow.animate([{ transform: `translateY(${targetRect.top - currentRect.top}px)` }, { transform: "translateY(0)" }], { duration: 250, easing: "ease-in-out" });
        }
      }, 0);
    }
  }

  private generateUniqueColors(): { light: string; dark: string } {
    const hue = Math.floor(Math.random() * 360);
    const hslToHex = (h: number, s: number, l: number): string => {
      l /= 100;
      const a = (s * Math.min(l, 1 - l)) / 100;
      const f = (n: number) => {
        const k = (n + h / 30) % 12;
        const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
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
    const parts = key.split("_");
    const prop = parts[1];
    const uid = parts[2];
    const selector = this.plugin.settings.selectors.find((s) => s.uid === uid);
    const editableProps = ["type", "name", "value", "iconBefore", "iconAfter", "lightColor", "darkColor", "lightBgColor", "darkBgColor", "fontWeight", "fontStyle"];

    if (selector && typeof prop === "string" && editableProps.includes(prop)) {
      // 🔑 FIKSET: Vi tildeler verdien via en ren, linter-godkjent Record-proxy.
      // Dette fjerner "unnecessary assertion" permanent!
      const ruleProxy: Record<string, unknown> = selector as any;
      ruleProxy[prop] = value;

      const sanitized = sanitizeRule(selector);
      selector.match = sanitized.match;
      selector.value = sanitized.value;
    }
  }


  private handleGlobalSettingUpdate(key: string, value: unknown): void {
    (this.plugin.settings as unknown as Record<string, unknown>)[key] = value;
  }

    public compilePaneStyles(): void {
    const selectors = this.plugin.settings?.selectors || [];
    const isDark = document.body.classList.contains("theme-dark");

    for (let i = 0; i < selectors.length; i++) {
      const rule = selectors[i];
      if (!rule) continue;

      const activeColor = isDark ? rule.darkColor : rule.lightColor;
      const activeBg = isDark ? rule.darkBgColor : rule.lightBgColor;

      // Finn Note-kapselen direkte i kontrollpanelet via den unike klassen
      const noteEl = this.containerEl.querySelector(`.data-link-text.scl-rule-${rule.uid}`) as HTMLElement | null;
      
      if (noteEl) {
        // 1. STYLING: Bygg opp et lovlig stil-objekt fullstendig uten undefined-verdier
        const targetStyles: Partial<CSSStyleDeclaration> = {
          color: activeColor || "var(--text-normal)",
          backgroundColor: (activeBg && activeBg !== "transparent") ? activeBg : "transparent",
          fontWeight: (rule.fontWeight && rule.fontWeight !== "normal") ? rule.fontWeight : "normal",
          fontStyle: "normal",
          textDecoration: "none"
        };
        
        // Håndter tekstdekorasjoner trygt
        if (rule.fontStyle === "italic") {
          targetStyles.fontStyle = "italic";
        } else if (rule.fontStyle === "underline") {
          targetStyles.textDecoration = "underline";
        } else if (rule.fontStyle === "line-through") {
          targetStyles.textDecoration = "line-through";
        }

        // Appliker stilene 100 % Obsidian-lovlig!
        noteEl.setCssStyles(targetStyles);

        // 2. 🚀 LIVE IKON-GENERERING: Fjern gamle ikoner fra forrige rendering først
        const oldIcons = noteEl.querySelectorAll(".scl-inline-icon-before, .scl-inline-icon-after");
        oldIcons.forEach(icon => icon.remove());

        const iconBefore = (rule.iconBefore || "").trim();
        const iconAfter = (rule.iconAfter || "").trim();

        // Sett inn Prepend Ikon fysisk i minnet hvis det er definert
        if (iconBefore) {
          const spanBefore = noteEl.doc.createElement("span");
          spanBefore.addClass("scl-inline-icon-before");
          spanBefore.setText(iconBefore);
          spanBefore.setCssStyles({ marginRight: "3px", display: "inline-block" });
          noteEl.insertBefore(spanBefore, noteEl.firstChild);
        }

        // Sett inn Append Ikon fysisk i minnet hvis det er definert
        if (iconAfter) {
          const spanAfter = noteEl.doc.createElement("span");
          spanAfter.addClass("scl-inline-icon-after");
          spanAfter.setText(iconAfter);
          spanAfter.setCssStyles({ marginLeft: "3px", display: "inline-block" });
          noteEl.appendChild(spanAfter);
        }
      }
    }
  }

}
