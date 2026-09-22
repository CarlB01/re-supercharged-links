import { App, debounce, PluginSettingTab, SettingDefinitionItem, Setting, SettingGroupItem, setIcon } from "obsidian";
import ResuperchargedLinks from "../main";
import { updateVisibleLinks } from "../views/view-invalidator";
import { CSSLink } from "../types/css-link";
import { sanitizeRule } from "../processors/rule-sanitizer";
import { clearColorHistory } from "./components/color-row-factory";
import { getRuleDetailItems } from "./components/detail-rows-factory";
import { renderRuleSentence } from "./components/rule-renderer";
import { moveRule } from "./components/rule-order-engine";
import { cleanSearchQuery, parseControlValueKey } from "../utils/shared-utils";
import { createColorCapsule } from "./components/color-capsule";


type MyGroupItems = SettingDefinitionItem | { render: (setting: Setting) => void };

export default class SCLSettingTab extends PluginSettingTab {
  public plugin: ResuperchargedLinks;
  private readonly debouncedGenerate: () => void;
  private readonly debouncedSaveSettings: () => void;
  private rulesSearchQuery = "";
  
  // 🔑 RUNTIME TRACKING INDEX: Track active row open boundaries using memory integer offsets cleanly
  public activeEditIndex: number | null = null;
  private paneStyleEl: HTMLStyleElement | null = null;

  private _generateSnippet(): void {
    updateVisibleLinks(this.app, this.plugin);
    this.plugin.refreshEditorThemes();

    window.requestAnimationFrame((): void => {
      this.compilePaneStyles();
    });
  }

  override async setControlValue(key: string, value: unknown, silent = false): Promise<void> {
    if (key === "scl_rules_search") {
      this.handleSearchQuery(value);
    } else if (key.startsWith("scl_")) {
      this.handleRuleFieldUpdate(key, value);
      this.plugin.bumpRuleConfigVersion();
    } else {
      this.handleGlobalSettingUpdate(key, value);
      if (key === "enableTagChips" || key === "getFromInlineField") {
        this.plugin.bumpRuleConfigVersion();
      }
    }

    this.plugin.compileActiveAttributes();

    if (silent) {
      this.debouncedSaveSettings();
    } else {
      await this.plugin.saveSettings();
    }

    this.compilePaneStyles();
    this.debouncedGenerate();

    if (!silent) this.refreshUI();
  }

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

      const actualIndex: number = selectors.indexOf(selector);
      clearColorHistory();

      this.activeEditIndex = this.activeEditIndex === actualIndex ? null : actualIndex;
      this.refreshUI();
    });

    this.debouncedSaveSettings = debounce((): void => {
      void this.plugin.saveSettings();
    }, 180, true);
  }

  public hide(): void {
    clearColorHistory();

    // fallback: ensure latest state is persisted when pane closes
    void this.plugin.saveSettings();

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
      if (targetIndex < 0 || targetIndex >= selectors.length) return;

      void moveRule(this.plugin, selectors, index, direction, {
        activeEditIndex: this.activeEditIndex,
        setActiveEditIndex: (next: number | null): void => {
          this.activeEditIndex = next;
        },
        onAfterMove: (): void => {
          this._generateSnippet();
          this.refreshUI();
        },
        onAnimate: null
      });
    };

    const onLongPress = debounce((): void => {
      longPressTriggered = true;
      moveBy(-1);
    }, 380, true);

    const cancelLongPress = (): void => {
      onLongPress.cancel();
    };

    this.plugin.registerDomEvent(grip, "pointerup", cancelLongPress);
    this.plugin.registerDomEvent(grip, "pointercancel", cancelLongPress);
    this.plugin.registerDomEvent(grip, "pointerleave", cancelLongPress);

    this.plugin.registerDomEvent(grip, "pointerdown", (e: PointerEvent): void => {
      if (e.pointerType === "touch") {
        longPressTriggered = false;
        onLongPress();
      }
    });

    this.plugin.registerDomEvent(grip, "click", (e: MouseEvent): void => {
      e.preventDefault();
      e.stopPropagation();

      if (longPressTriggered) {
        longPressTriggered = false;
        return;
      }

      moveBy(e.shiftKey ? -1 : 1);
    });
  }

    override getControlValue(key: string): unknown {
    if (key === "scl_rules_search") return this.rulesSearchQuery;
    const settings: ResuperchargedLinks["settings"] = this.plugin.settings;
    
    const coreKeys: string[] = ["enableTagChips", "getFromInlineField"];
    if (coreKeys.includes(key)) return (settings as unknown as Record<string, unknown>)[key];

    if (key.startsWith("scl_")) {
      const { prop, uid: runtimeUid } = parseControlValueKey(key);
      const targetIdx: number = parseInt(runtimeUid, 10);
      
      // 🔑 INDEX CONSOLIDATION: Read directly from the integer position channel
      if (!isNaN(targetIdx)) {
        const selectors: CSSLink[] = settings.selectors ?? [];
        const selector: CSSLink | null = selectors[targetIdx] ?? null;
        const editableProps: string[] = ["type", "name", "value", "iconBefore", "iconAfter", "lightColor", "darkColor", "lightBgColor", "darkBgColor", "fontWeight", "fontStyle"];
        
        if (selector !== null && prop.length > 0 && editableProps.includes(prop)) {
          return (selector as unknown as Record<string, unknown>)[prop];
        }
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
      const isEditing: boolean = this.activeEditIndex === index;
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
            this.plugin.bumpRuleConfigVersion();
            this.plugin.compileActiveAttributes();
            void this.plugin.saveSettings();
            void this._generateSnippet();
            
            this.activeEditIndex = selectors.length - 1;
            this.refreshUI();
          }); });
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
    
    setting.settingEl.setAttribute("data-index", String(index));

    setting.nameEl.empty();
    // 🔑 THE RE-COUPLING CRITICAL FIX: Pass the runtime index integer straight to the sentence assembler
    renderRuleSentence(setting.nameEl, selector, index);

    this.renderRuleBadges(setting, selector);
    this.renderReorderGrip(setting, index, selectors);

    window.requestAnimationFrame((): void => {
      this.compilePaneStyles();
    });
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

  private handleSearchQuery(value: unknown): void { this.rulesSearchQuery = String(value ?? ""); this.refreshUI(); }

  private handleRuleFieldUpdate(key: string, value: unknown): void {
    const { prop, uid: runtimeUid } = parseControlValueKey(key);
    const targetIdx: number = parseInt(runtimeUid, 10);

    if (isNaN(targetIdx)) return;

    const selectors: CSSLink[] = this.plugin.settings.selectors ?? [];
    const selector: CSSLink | null = selectors[targetIdx] ?? null;
    const editableProps: string[] = ["type", "name", "value", "iconBefore", "iconAfter", "lightColor", "darkColor", "lightBgColor", "darkBgColor", "fontWeight", "fontStyle"];

    if (selector !== null && prop.length > 0 && editableProps.includes(prop)) {
      const ruleProxy: Record<string, unknown> = selector as unknown as Record<string, unknown>;

      let cleanValue = value;
      if (prop === "value" && typeof value === "string" && selector.type === "tag") {
        cleanValue = value.trim().replace(/^#/, "");
      }

      // ✅ Guard: korte alfanumeriske contains-tokens blokkeres, symboler tillates
      if (
        prop === "value" &&
        selector.match === "contains" &&
        typeof cleanValue === "string"
      ) {
        const token = cleanValue.trim();
        const isAlnumOnly = /^[a-z0-9]+$/i.test(token);
        if (token.length > 0 && token.length < 2 && isAlnumOnly) {
          new Notice("Contains value must be at least 2 characters for letters/numbers (symbols like @ are allowed).");          return;
        }
        cleanValue = token;
      }

      ruleProxy[prop] = cleanValue;

      const sanitized: CSSLink = sanitizeRule(selector);
      selector.match = sanitized.match;
      selector.value = sanitized.value;

      // Tving oppdateringen direkte inn i referanse-arrayet
      this.plugin.settings.selectors[targetIdx] = selector;
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

      // 1. Locate the physical row container layout in the DOM
      const rowEl: HTMLElement | null = this.containerEl.querySelector<HTMLElement>(`[data-index="${i}"]`) ?? null;
      if (rowEl === null) continue;

      // 2. Locate and style the "Note" preview anchor node dynamically
      const noteEl: HTMLElement | null = rowEl.querySelector<HTMLElement>(`.data-link-text.scl-rule-${i}`) ?? null;
      
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

        const val: string = (rule.value || "").trim();
        if (rule.type === "tag" && val.length > 0) {
          const cleanTag = val.replace(/^#/, "");
          noteEl.setAttribute("data-link-tags", `#${cleanTag}`);
        }

        // 3. 🔑 REAL-TIME TEXT REFLECTION: Update sentence tokens directly in the DOM!
        // This instantly reflects typing changes in the main row sentence without triggering a focus-breaking refreshUI().
        const valText: string = rule.value || "empty";
        
        if (rule.type === "tag") {
          const tagAnchor = rowEl.querySelector<HTMLElement>("a.tag");
          if (tagAnchor !== null) {
            const cleanDisplayTag = valText.trim().replace(/^#/, "");
            tagAnchor.setText(`#${cleanDisplayTag}`);
          }
        } else if (rule.type === "attribute") {
          const boldElements = rowEl.querySelectorAll("b");
          const attrName: string = rule.name || "empty";
          
          // Bold 0 is Key Name, Bold 1 is Attribute Value
          if (boldElements[0] instanceof HTMLElement) boldElements[0].setText(attrName);
          if (boldElements[1] instanceof HTMLElement) boldElements[1].setText(valText);
        } else {
          // Note path match view
          const boldElement = rowEl.querySelector("b");
          if (boldElement instanceof HTMLElement) {
            boldElement.setText(valText);
          }
        }

        // 4. Symmetrically synchronize the badges capsule container representation
        const badgeContainer = rowEl.querySelector(".scl-badge-container");
        if (badgeContainer instanceof HTMLElement) {
          badgeContainer.empty();
          createColorCapsule(badgeContainer, rule.lightBgColor ?? "transparent", rule.lightColor ?? "", "Light mode", "var(--text-normal)");
          createColorCapsule(badgeContainer, rule.darkBgColor ?? "transparent", rule.darkColor ?? "", "Dark mode", "var(--text-muted)");
        }

        // 5. Wipe any stale background legacy icon nodes before re-rendering widgets
        const oldIcons: NodeListOf<Element> = noteEl.querySelectorAll(".scl-inline-icon");
        oldIcons.forEach((icon: Element): void => icon.remove());

        const iconBefore: string = (rule.iconBefore ?? "").trim();
        const iconAfter: string = (rule.iconAfter ?? "").trim();

        if (iconBefore.length > 0) {
          const spanBefore = noteEl.win.createSpan({
            cls: "scl-inline-icon scl-inline-icon-before",
            text: iconBefore
          });
          spanBefore.setCssStyles({ display: "inline-block" });
          noteEl.insertBefore(spanBefore, noteEl.firstChild);
        }

        if (iconAfter.length > 0) {
          const spanAfter = noteEl.win.createSpan({
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
