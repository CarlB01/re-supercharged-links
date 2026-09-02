import { App, debounce, PluginSettingTab, SettingDefinitionItem, Setting, SettingGroupItem } from "obsidian";
import ResuperchargedLinks from "./main";
import { updateVisibleLinks } from "./linkAttributes";
import { buildCSS } from "./cssBuilder";
import { CSSLink } from "./cssLink";

type MyGroupItems = SettingDefinitionItem | { render: (setting: Setting) => void };

export default class SCLSettingTab extends PluginSettingTab {
  plugin: ResuperchargedLinks;
  private readonly debouncedGenerate: () => void;

  public activeEditUid: string | null = null;
  private rulesSearchQuery = "";

  constructor(app: App, plugin: ResuperchargedLinks) {
    super(app, plugin);
    this.plugin = plugin;
    this.debouncedGenerate = debounce(() => { void this._generateSnippet(); }, 300, true);

    void this._generateSnippet();

    // Delegate row click handling so the entire row opens the detail panel.
    this.containerEl.addEventListener("click", (e) => {
      const target = e.target as HTMLElement;
      const clickedRow = target.closest(".scl-clickable-row") as HTMLElement | null;
      if (!clickedRow) return;

      // Keep action buttons independent from row navigation.
      if (target.closest(".scl-order-btn") || target.closest(".clickable-icon")) return;

      const selectors = this.plugin.settings.selectors || [];
      const rowUid = clickedRow.getAttribute("data-scl-uid");
      const selector = rowUid ? selectors.find((s) => s.uid === rowUid) : null;

      if (selector) {
        this.activeEditUid = selector.uid;
        this.refreshUI();
      }
    });
  }

  private refreshUI(): void {
    this.update();
  }

  private async _generateSnippet() {
    await buildCSS(this.plugin.settings.selectors, this.plugin);
    updateVisibleLinks(this.app, this.plugin);
  }

  override getControlValue(key: string): unknown {
    if (key === "scl_rules_search") return this.rulesSearchQuery;

    const settings = this.plugin.settings;
    const coreKeys = [
      "targetTags",
      "getFromInlineField",
      "activateSnippet",
      "enableEditor",
      "enableTabHeader",
      "enableFileList",
      "enableBacklinks",
      "enableQuickSwitcher",
      "enableSuggestor"
    ];

    if (coreKeys.includes(key)) {
      return (settings as unknown as Record<string, unknown>)[key];
    }

    if (key.startsWith("scl_")) {
      const [, prop, uid] = key.split("_");
      const selector = settings.selectors.find((s) => s.uid === uid);
      const editableProps = [
        "type",
        "name",
        "value",
        "iconBefore",
        "iconAfter",
        "lightColor",
        "darkColor",
        "lightBgColor",
        "darkBgColor",
        "fontWeight",
        "fontStyle"
      ];

      if (selector && typeof prop === "string" && editableProps.includes(prop)) {
        return (selector as unknown as Record<string, unknown>)[prop];
      }
    }

    return undefined;
  }

  override getSettingDefinitions(): SettingDefinitionItem[] {
    const definitions: SettingDefinitionItem[] = [];
    const selectors = this.plugin.settings.selectors || [];

    // Detail panel context
    if (this.activeEditUid) {
      const selector = selectors.find((s) => s.uid === this.activeEditUid);
      if (!selector) {
        this.activeEditUid = null;
        return this.getSettingDefinitions();
      }

      const index = selectors.indexOf(selector);

      const editItems: MyGroupItems[] = [
        {
          render: (setting: Setting) => {
            setting
              .setName("← Back to style list")
              .setDesc(`Editing style configuration for rule #${index + 1}`);
            setting.addButton((btn) =>
              btn.setButtonText("Back").setCta().onClick(() => {
                this.activeEditUid = null;
                this.refreshUI();
              })
            );
          }
        },
        { name: "Match Target Type", desc: "Select target metadata type.", control: { type: "dropdown", key: `scl_type_${selector.uid}`, options: { tag: "Tag", attribute: "Attribute", path: "Note Path" } } },
        ...(selector.type === "attribute"
          ? [{ name: "Key name (attributes only)", desc: "Frontmatter key to read.", control: { type: "text" as const, key: `scl_name_${selector.uid}`, placeholder: "status" } }]
          : []),
        { name: "Value to match", desc: "Trigger keyword.", control: { type: "text", key: `scl_value_${selector.uid}`, placeholder: "todo" } },
        { name: "Prepend Icon", desc: "Icon to inject before link text.", control: { type: "text", key: `scl_iconBefore_${selector.uid}`, placeholder: "" } },
        { name: "Append Icon", desc: "Icon to inject after link text.", control: { type: "text", key: `scl_iconAfter_${selector.uid}`, placeholder: "" } },
        { name: "Font Weight", desc: "Choose font weight.", control: { type: "dropdown", key: `scl_fontWeight_${selector.uid}`, options: { normal: "Normal", lighter: "Lighter", bold: "Bold" } } },
        { name: "Font Style", desc: "Choose text decoration.", control: { type: "dropdown", key: `scl_fontStyle_${selector.uid}`, options: { normal: "Normal", italic: "Italic", underline: "Underline", "line-through": "Strikethrough" } } },
        { name: "Light Mode Color", desc: "Text color for light theme.", control: { type: "color", key: `scl_lightColor_${selector.uid}` } },
        { name: "Dark Mode Color", desc: "Text color for dark theme.", control: { type: "color", key: `scl_darkColor_${selector.uid}` } },
        { name: "Light Mode Background", desc: "Background color for light theme.", control: { type: "color", key: `scl_lightBgColor_${selector.uid}` } },
        { name: "Dark Mode Background", desc: "Background color for dark theme.", control: { type: "color", key: `scl_darkBgColor_${selector.uid}` } },
        {
          name: "Delete style",
          desc: "Permanently remove this style rule.",
          render: (setting: Setting) => {
            setting.addButton((btn) =>
              btn.setButtonText("Delete Rule").setClass("scl-delete-btn-standard").onClick(async () => {
                selectors.splice(index, 1);
                this.plugin.compileActiveAttributes();
                this.activeEditUid = null;
                await this.plugin.saveSettings();
                await this._generateSnippet();
                this.refreshUI();
              })
            );
          }
        }
      ];

      definitions.push({
        type: "group",
        heading: "Style Configuration",
        items: editItems as unknown as SettingGroupItem<string>[]
      });

      return definitions;
    }

    // Main list context
    const q = this.rulesSearchQuery.trim().toLowerCase();
    const filteredSelectors = selectors.filter((selector) => {
      if (!q) return true;
      const haystack = [
        selector.type ?? "",
        selector.name ?? "",
        selector.value ?? "",
        selector.iconBefore ?? "",
        selector.iconAfter ?? ""
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });

    const existingRuleItems: MyGroupItems[] = filteredSelectors.map((selector) => {
      const index = selectors.indexOf(selector);
      return {
        render: (setting: Setting) => this.renderRuleRow(setting, selector, index, selectors, false)
      };
    });

    const ruleItems: MyGroupItems[] = [
      {
        render: (setting: Setting) => {
          setting.setName("Search").setDesc("Filter style rules.");
          setting.settingEl.addClass("scl-search-row");
          setting.addSearch((cb) => {
            cb.setPlaceholder("Search style rules...");
            cb.setValue(this.rulesSearchQuery);
            cb.onChange((value) => {
              this.rulesSearchQuery = value ?? "";
              this.refreshUI();
            });
          });
        }
      },
      ...(existingRuleItems.length > 0
        ? existingRuleItems
        : [{ name: "No matching rules", desc: "Try another search term." }])
    ];

    definitions.push({
      type: "group",
      heading: "Link Styling Rules",
      items: ruleItems as unknown as SettingGroupItem<string>[]
    });

    definitions.push({
      type: "group",
      heading: "NEW rules",
      items: [
        {
          name: "Create a new style rule",
          desc: "Add a new template selector with preconfigured colors.",
          action: () => {
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
          }
        }
      ]
    });

    definitions.push({
      type: "group",
      heading: "Advanced Settings Overview",
      items: [
        {
          type: "page",
          name: "Advanced Settings",
          desc: "Configure global panels and triggers.",
          items: [
            {
              type: "group",
              heading: "General",
              items: [
                { name: "Parse all tags in file", desc: "Read tags from frontmatter and inline.", control: { type: "toggle", key: "targetTags" } },
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
                { name: "Activate in Link Autocompleter", desc: "Apply styling in [[ suggestions.", control: { type: "toggle", key: "enableSuggestor" } }
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
        }
      ]
    });

    return definitions;
  }

  private renderRuleRow(setting: Setting, selector: CSSLink, index: number, selectors: CSSLink[], isEditing: boolean) {
    setting.settingEl.className = "setting-item scl-clickable-row scl-main-rule-row mod-navigable";
    setting.settingEl.setAttribute("data-scl-uid", selector.uid);
    if (isEditing) setting.settingEl.addClass("is-active");

    setting.nameEl.empty();
    const valText = selector.value || "empty";

    if (selector.type === "tag") {
      const noteSpan = setting.nameEl.createEl("span", {
        cls: "data-link-icon data-link-text data-link-icon-after",
        text: "Note"
      });
      noteSpan.setAttribute("data-link-tags", selector.value || "");
      setting.nameEl.appendText(" has tag ");
      setting.nameEl.createEl("a", { cls: "tag", text: `#${valText}` });
    } else if (selector.type === "attribute") {
      const attrName = selector.name || "empty";
      const noteSpan = setting.nameEl.createEl("span", {
        cls: "data-link-icon data-link-text data-link-icon-after",
        text: "Note"
      });
      if (selector.name) noteSpan.setAttribute(`data-link-${selector.name}`, selector.value || "");
      setting.nameEl.appendText(" has attribute ");
      setting.nameEl.createEl("b", { text: attrName });
      setting.nameEl.appendText(" with value ");
      setting.nameEl.createEl("b", { text: valText });
    } else {
      setting.nameEl.appendText("The path of the ");
      const noteSpan = setting.nameEl.createEl("span", {
        cls: "data-link-icon data-link-text data-link-icon-after",
        text: "note"
      });
      noteSpan.setAttribute("data-link-path", selector.value || "");
      setting.nameEl.appendText(" matches ");
      setting.nameEl.createEl("b", { text: valText });
    }

    if (setting.controlEl) {
      const badgeContainer = setting.controlEl.createEl("span", { cls: "scl-badge-container" });
      this.createColorCapsule(badgeContainer, selector.lightBgColor, selector.lightColor, "Light mode", "var(--text-normal)");
      this.createColorCapsule(badgeContainer, selector.darkBgColor, selector.darkColor, "Dark mode", "var(--text-muted)");
    }

    setting.addButton((btn) =>
      btn
        .setIcon("arrow-down")
        .setTooltip("Move down")
        .setClass("scl-order-btn")
        .setDisabled(index === selectors.length - 1)
        .onClick(() => this.moveRule(index, 1, selectors, setting.settingEl))
    );

    setting.addButton((btn) =>
      btn
        .setIcon("arrow-up")
        .setTooltip("Move up")
        .setClass("scl-order-btn")
        .setDisabled(index === 0)
        .onClick(() => this.moveRule(index, -1, selectors, setting.settingEl))
    );

    setting.addButton((btn) =>
      btn
        .setIcon("chevron-right")
        .setTooltip("Open style details")
        .setClass("scl-nav-indicator")
        .onClick(() => {
          this.activeEditUid = selector.uid;
          this.refreshUI();
        })
    );
  }

  private createColorCapsule(
    parent: HTMLElement,
    bgColor: string | undefined,
    textColor: string | undefined,
    modeName: string,
    fallbackText: string
  ) {
    const capsule = parent.createEl("span", {
      cls: modeName.includes("Dark") ? "scl-bg-capsule is-dark" : "scl-bg-capsule"
    });

    capsule.title = `${modeName} background: ${bgColor || "transparent"}`;
    if (bgColor && bgColor !== "transparent") capsule.style.backgroundColor = bgColor;
    else capsule.addClass("is-transparent");

    const dot = capsule.createEl("span", { cls: "scl-color-dot" });
    dot.title = `${modeName} text color: ${textColor || "default"}`;

    dot.setCssProps({
      "--scl-dot-color": textColor || fallbackText
    });
  }

  private async moveRule(index: number, direction: number, selectors: CSSLink[], rowEl: HTMLElement) {
    const targetIndex = index + direction;
    const targetSelector = selectors[targetIndex];
    if (!targetSelector) return;

    const siblingEl = (direction === 1 ? rowEl.nextElementSibling : rowEl.previousElementSibling) as HTMLElement;
    const rectCurrent = rowEl.getBoundingClientRect();

    selectors[targetIndex] = selectors[index]!;
    selectors[index] = targetSelector;

    await this.plugin.saveSettings();
    this.refreshUI();

    if (rowEl && siblingEl) {
      const rectSibling = siblingEl.getBoundingClientRect();
      requestAnimationFrame(() => {
        const all = document.querySelectorAll(".vertical-tab-content-container .scl-clickable-row");
        const nCur = all[targetIndex] as HTMLElement;
        const nSib = all[index] as HTMLElement;
        if (nCur && nSib) {
          nCur.animate(
            [{ transform: `translateY(${rectCurrent.top - rectSibling.top}px)` }, { transform: "translateY(0)" }],
            { duration: 250, easing: "ease-in-out" }
          );
          nSib.animate(
            [{ transform: `translateY(${rectSibling.top - rectCurrent.top}px)` }, { transform: "translateY(0)" }],
            { duration: 250, easing: "ease-in-out" }
          );
        }
      });
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

    return {
      light: hslToHex(hue, 65, 35),
      dark: hslToHex(hue, 80, 75)
    };
  }

  override async setControlValue(key: string, value: unknown, silent = false): Promise<void> {
    const settings = this.plugin.settings;

    if (key === "scl_rules_search") {
      this.rulesSearchQuery = String(value ?? "");
      this.refreshUI();
      return;
    }

    if (key.startsWith("scl_")) {
      const [, prop, uid] = key.split("_");
      const selector = settings.selectors.find((s) => s.uid === uid);
      const editableProps = [
        "type",
        "name",
        "value",
        "iconBefore",
        "iconAfter",
        "lightColor",
        "darkColor",
        "lightBgColor",
        "darkBgColor",
        "fontWeight",
        "fontStyle"
      ];

      if (selector && typeof prop === "string" && editableProps.includes(prop)) {
        (selector as unknown as Record<string, unknown>)[prop] = value;
      }
    } else {
      (settings as unknown as Record<string, unknown>)[key] = value;
    }

    this.plugin.compileActiveAttributes();
    await this.plugin.saveSettings();
    this.debouncedGenerate();

    if (!silent) this.refreshUI();
  }
}