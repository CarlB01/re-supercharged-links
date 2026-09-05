import { App, debounce, PluginSettingTab, SettingDefinitionItem, Setting, SettingGroupItem, setIcon } from "obsidian";
import ResuperchargedLinks from "./main";
import { updateVisibleLinks } from "./linkAttributes";
import { buildCSS } from "./cssBuilder";
import { CSSLink } from "./cssLink";

type MyGroupItems = SettingDefinitionItem | { render: (setting: Setting) => void };

export default class SCLSettingTab extends PluginSettingTab {
  plugin: ResuperchargedLinks;
  private readonly debouncedGenerate: () => void;

  private rulesSearchQuery = "";
  public activeEditUid: string | null = null;

  constructor(app: App, plugin: ResuperchargedLinks) {
    super(app, plugin);
    this.plugin = plugin;
    this.debouncedGenerate = debounce(() => { void this._generateSnippet(); }, 300, true);
    void this._generateSnippet();

    this.plugin.registerDomEvent(this.containerEl, "click", (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const clickedRow = target.closest(".scl-clickable-row") as HTMLElement;
      if (!clickedRow) return;

      if (
        target.closest(".clickable-icon") ||
        target.closest("button") ||
        target.closest("input") ||
        target.closest("select") ||
        target.closest(".scl-bg-capsule") ||
        target.closest(".scl-color-dot")
      ) {
        return;
      }

      const selectors = this.plugin.settings.selectors || [];
      const filteredSelectors = this.getFilteredSelectors(selectors);

      const allRows = Array.from(
        this.containerEl.querySelectorAll(".vertical-tab-content-container .scl-clickable-row")
      );
      const index = allRows.indexOf(clickedRow);
      const selector = filteredSelectors[index];
      if (!selector) return;

      this.activeEditUid = this.activeEditUid === selector.uid ? null : selector.uid;
      this.refreshUI();
    });
  }

  private refreshUI(): void {
    this.update();
  }

  private getFilteredSelectors(selectors: CSSLink[]): CSSLink[] {
    const q = this.rulesSearchQuery.trim().toLowerCase();
    if (!q) return selectors;
    return selectors.filter((selector) => {
      const haystack = [
        selector.type ?? "",
        selector.name ?? "",
        selector.value ?? "",
        selector.iconBefore ?? "",
        selector.iconAfter ?? ""
      ].join(" ").toLowerCase();
      return haystack.includes(q);
    });
  }

  private normalizeAttrKey(name: string | undefined): string {
    return (name || "").trim().replace(/ /g, "-").toLowerCase();
  }

  private renderPreviewNote(parent: HTMLElement, selector: CSSLink): void {
    
    const noteSpan = parent.createSpan( { cls: "data-link-text" });

    // Provide the same metadata attributes used by generated CSS selectors.
    if (selector.type === "tag") {
      noteSpan.setAttr("data-link-tags", selector.value || "");
   
    } else if (selector.type === "attribute") {
      const key = this.normalizeAttrKey(selector.name);
      if (key) noteSpan.setAttr(`data-link-${key}`, selector.value || "");
   
    } else {
      noteSpan.setAttr("data-link-path", selector.value || "");
    }

    noteSpan.setText("Note");
  }
  
  private renderRuleSentence(nameEl: HTMLElement, selector: CSSLink): void {
    const valText = selector.value || "empty";

    if (selector.type === "tag") {
      this.renderPreviewNote(nameEl, selector);
      nameEl.appendText(" has tag ");
      nameEl.createEl("a", { cls: "tag", text: `#${valText}` });
      return;
    }

    if (selector.type === "attribute") {
      const attrName = selector.name || "empty";
      this.renderPreviewNote(nameEl, selector);
      nameEl.appendText(" has attribute ");
      nameEl.createEl("b", { text: attrName });
      nameEl.appendText(" with value ");
      nameEl.createEl("b", { text: valText });
      return;
    }

    this.renderPreviewNote(nameEl, selector);
    nameEl.appendText(" path matches ");
    nameEl.createEl("b", { text: valText });
  }

private renderRuleBadges(setting: Setting, selector: CSSLink): void {
  const controlEl = setting.controlEl;

  const badgeContainer: HTMLSpanElement = controlEl.createSpan( { cls: "scl-badge-container" } );

  this.createColorCapsule(
    badgeContainer,
    selector.lightBgColor,
    selector.lightColor,
    "Light mode",
    "var(--text-normal)"
  );

  this.createColorCapsule(
    badgeContainer,
    selector.darkBgColor,
    selector.darkColor,
    "Dark mode",
    "var(--text-muted)"
  );
}

private renderReorderGrip(setting: Setting, index: number, selectors: CSSLink[]): void {
  const wrap = setting.controlEl.createDiv({ cls: "scl-reorder-inline" });
  const grip = wrap.createEl("button", {
    cls: "clickable-icon extra-setting-button mod-drag-handle scl-grip-btn",
    attr: {
      "aria-label": "Reorder (tap: down, long-press/Shift: up)",
      type: "button"
    }
  });

  setIcon(grip, "grip-vertical");

  let longPressTriggered = false;

  const moveBy = (direction: number) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= selectors.length) return;
    void this.moveRule(index, direction, selectors);
  };

  const onLongPress = debounce(() => {
    longPressTriggered = true;
    moveBy(-1);
  }, 380, true);

  const cancelLongPress = () => onLongPress.cancel();

  this.plugin.registerDomEvent(grip, "pointerup", cancelLongPress);
  this.plugin.registerDomEvent(grip, "pointercancel", cancelLongPress);
  this.plugin.registerDomEvent(grip, "pointerleave", cancelLongPress);

  this.plugin.registerDomEvent(grip, "pointerdown", (evt: PointerEvent) => {
    if (evt.pointerType !== "touch") return;
    longPressTriggered = false;
    onLongPress();
  });

  this.plugin.registerDomEvent(grip, "click", (evt: MouseEvent) => {
    evt.preventDefault();
    evt.stopPropagation();

    if (longPressTriggered) {
      longPressTriggered = false;
      return;
    }

    moveBy(evt.shiftKey ? -1 : 1);
  });
}

  private row(render: (setting: Setting) => void): MyGroupItems {
    return { render };
  }

  private setRowClass(setting: Setting, cls: string): void {
    setting.settingEl.className = `setting-item ${cls}`;
  }

  private createTypeRow(selector: CSSLink): MyGroupItems {
    return this.row((setting) => {
      this.setRowClass(setting, "scl-detail-row scl-row-type");
      setting.setName("Match Target Type").setDesc("Select target metadata type.");
      setting.addDropdown((d) => {
        d.addOption("tag", "Tag");
        d.addOption("attribute", "Attribute");
        d.addOption("path", "Note Path");
        d.setValue(selector.type || "tag");
        d.onChange(async (value: string) => {
          if (value !== "tag" && value !== "attribute" && value !== "path") return;
          await this.setControlValue(`scl_type_${selector.uid}`, value, true);
          this.refreshUI();
        });
      });
    });
  }

  private createAttributeNameRow(selector: CSSLink): MyGroupItems {
    return this.row((setting) => {
      this.setRowClass(setting, "scl-detail-row scl-row-attrname");
      setting.setName("Key name (attributes only)").setDesc("Frontmatter key to read.");
      setting.addText((t) =>
        t.setPlaceholder("status").setValue(selector.name || "").onChange(async (v) => {
          await this.setControlValue(`scl_name_${selector.uid}`, v, true);
          this.refreshUI();
        })
      );
    });
  }

  private createValueRow(selector: CSSLink): MyGroupItems {
    return this.row((setting) => {
      this.setRowClass(setting, "scl-detail-row scl-row-value");
      setting.setName("Value to match").setDesc("Trigger keyword.");
      setting.addText((t) =>
        t.setPlaceholder("todo").setValue(selector.value || "").onChange(async (v) => {
          await this.setControlValue(`scl_value_${selector.uid}`, v, true);
          this.refreshUI();
        })
      );
    });
  }

  private createIconBeforeRow(selector: CSSLink): MyGroupItems {
    return this.row((setting) => {
      this.setRowClass(setting, "scl-detail-row scl-row-iconbefore");
      setting.setName("Prepend Icon").setDesc("Icon to inject before link text.");
      setting.addText((t) =>
        t.setPlaceholder("").setValue(selector.iconBefore || "").onChange(async (v) => {
          await this.setControlValue(`scl_iconBefore_${selector.uid}`, v, true);
        })
      );
    });
  }

  private createIconAfterRow(selector: CSSLink): MyGroupItems {
    return this.row((setting) => {
      this.setRowClass(setting, "scl-detail-row scl-row-iconafter");
      setting.setName("Append Icon").setDesc("Icon to inject after link text.");
      setting.addText((t) =>
        t.setPlaceholder("").setValue(selector.iconAfter || "").onChange(async (v) => {
          await this.setControlValue(`scl_iconAfter_${selector.uid}`, v, true);
        })
      );
    });
  }

  private createFontWeightRow(selector: CSSLink): MyGroupItems {
    return this.row((setting) => {
      this.setRowClass(setting, "scl-detail-row scl-row-weight");
      setting.setName("Font Weight").setDesc("Choose font weight.");
      setting.addDropdown((d) => {
        d.addOption("normal", "Normal");
        d.addOption("lighter", "Lighter");
        d.addOption("bold", "Bold");
        d.setValue(selector.fontWeight || "normal");
        d.onChange(async (v) => {
          await this.setControlValue(`scl_fontWeight_${selector.uid}`, v, true);
        });
      });
    });
  }

  private createFontStyleRow(selector: CSSLink): MyGroupItems {
    return this.row((setting) => {
      this.setRowClass(setting, "scl-detail-row scl-row-style");
      setting.setName("Font Style").setDesc("Choose text decoration.");
      setting.addDropdown((d) => {
        d.addOption("normal", "Normal");
        d.addOption("italic", "Italic");
        d.addOption("underline", "Underline");
        d.addOption("line-through", "Strikethrough");
        d.setValue(selector.fontStyle || "normal");
        d.onChange(async (v) => {
          await this.setControlValue(`scl_fontStyle_${selector.uid}`, v, true);
        });
      });
    });
  }

  private createLightColorRow(selector: CSSLink): MyGroupItems {
    return this.row((setting) => {
      this.setRowClass(setting, "mod-toggle scl-color-row scl-text-picker-row scl-row-lightcolor");
      setting.setName("Light Mode Color").setDesc("Text color for light theme.");

      setting.addExtraButton((eb) =>
        eb.setIcon("rotate-ccw").setTooltip("Back to default").onClick(async () => {
          selector.lightColor = "";
          this.plugin.compileActiveAttributes();
          await this.plugin.saveSettings();
          await this._generateSnippet();
          this.refreshUI();
        })
      );

      setting.addColorPicker((cp) => {
        cp.setValue(selector.lightColor || "#ffffff");
        cp.onChange(async (v) => {
          await this.setControlValue(`scl_lightColor_${selector.uid}`, v, true);
        });
      });
    });
  }

  private createDarkColorRow(selector: CSSLink): MyGroupItems {
    return this.row((setting) => {
      this.setRowClass(setting, "mod-toggle scl-color-row scl-text-picker-row scl-row-darkcolor");
      setting.setName("Dark Mode Color").setDesc("Text color for dark theme.");

      setting.addExtraButton((eb) =>
        eb.setIcon("rotate-ccw").setTooltip("Back to default").onClick(async () => {
          selector.darkColor = "";
          this.plugin.compileActiveAttributes();
          await this.plugin.saveSettings();
          await this._generateSnippet();
          this.refreshUI();
        })
      );

      setting.addColorPicker((cp) => {
        cp.setValue(selector.darkColor || "#000000");
        cp.onChange(async (v) => {
          await this.setControlValue(`scl_darkColor_${selector.uid}`, v, true);
        });
      });
    });
  }

  private createLightBgRow(selector: CSSLink): MyGroupItems {
    return this.row((setting) => {
      this.setRowClass(setting, "mod-toggle scl-color-row scl-bg-picker-row scl-row-lightbg");
      setting.setName("Light Mode Background").setDesc("Background color for light theme.");

      const currentVal = selector.lightBgColor;
      const fallbackColor = currentVal && currentVal !== "transparent" ? currentVal : "#ffffff";

      setting.addExtraButton((eb) =>
        eb.setIcon("rotate-ccw").setTooltip("Back to default").onClick(async () => {
          selector.lightBgColor = "transparent";
          this.plugin.compileActiveAttributes();
          await this.plugin.saveSettings();
          await this._generateSnippet();
          this.refreshUI();
        })
      );

      setting.addColorPicker((cp) => {
        cp.setValue(fallbackColor);
        cp.onChange(async (v) => {
          await this.setControlValue(`scl_lightBgColor_${selector.uid}`, v, true);
        });
      });
    });
  }

  private createDarkBgRow(selector: CSSLink): MyGroupItems {
    return this.row((setting) => {
      this.setRowClass(setting, "mod-toggle scl-color-row scl-bg-picker-row scl-row-darkbg");
      setting.setName("Dark Mode Background").setDesc("Background color for dark theme.");

      const currentVal = selector.darkBgColor;
      const fallbackColor = currentVal && currentVal !== "transparent" ? currentVal : "#1e1e1e";

      setting.addExtraButton((eb) =>
        eb.setIcon("rotate-ccw").setTooltip("Back to default").onClick(async () => {
          selector.darkBgColor = "transparent";
          this.plugin.compileActiveAttributes();
          await this.plugin.saveSettings();
          await this._generateSnippet();
          this.refreshUI();
        })
      );

      setting.addColorPicker((cp) => {
        cp.setValue(fallbackColor);
        cp.onChange(async (v) => {
          await this.setControlValue(`scl_darkBgColor_${selector.uid}`, v, true);
        });
      });
    });
  }

  private createDeleteRow(selector: CSSLink, index: number, selectors: CSSLink[]): MyGroupItems {
    return this.row((setting) => {
      this.setRowClass(setting, "scl-detail-row scl-row-delete");
      setting.setName("Delete style").setDesc("Permanently remove this style rule.");

      setting.addButton((btn) => {
        btn
          .setIcon("trash")
          .setTooltip("Delete style")
          .onClick(async () => {
            selectors.splice(index, 1);
            if (this.activeEditUid === selector.uid) this.activeEditUid = null;
            this.plugin.compileActiveAttributes();
            await this.plugin.saveSettings();
            await this._generateSnippet();
            this.refreshUI();
          });

        btn.buttonEl.addClass("mod-warning");
      });
    });
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
    const filteredSelectors = this.getFilteredSelectors(selectors);

    const existingRuleItems: MyGroupItems[] = [];

    filteredSelectors.forEach((selector) => {
      const index = selectors.indexOf(selector);
      const isEditing = this.activeEditUid === selector.uid;

      existingRuleItems.push({
        render: (setting: Setting) => this.renderRuleRow(setting, selector, index, selectors, isEditing)
      });

      if (isEditing) {
        existingRuleItems.push(...this.getRuleDetailItems(selector, index, selectors));
      }
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
          render: (setting: Setting) => {
            setting.addButton((btn) =>
              btn.setButtonText("Create").onClick(() => {
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
              })
            );
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
                {
                  name: "Parse all tags in file",
                  desc: "Read tags from frontmatter and inline.",
                  control: { type: "toggle", key: "targetTags" }
                },
                {
                  name: "Automatically activate CSS snippet",
                  desc: "Enable generated snippet.",
                  control: { type: "toggle", key: "activateSnippet" }
                }
              ]
            },
            {
              type: "group",
              heading: "Where to Supercharge",
              items: [
                {
                  name: "Enable in Editor",
                  desc: "Live Preview support.",
                  control: { type: "toggle", key: "enableEditor" }
                },
                {
                  name: "Enable in Tab Headers",
                  desc: "Apply styling in tab titles.",
                  control: { type: "toggle", key: "enableTabHeader" }
                },
                {
                  name: "Enable in Plugins & Panels",
                  desc: "Apply styling in backlinks/panels.",
                  control: { type: "toggle", key: "enableBacklinks" }
                }
              ]
            },
            {
              type: "group",
              heading: "Display Panels",
              items: [
                {
                  name: "Activate in File Browser",
                  desc: "Apply styling in file explorer.",
                  control: { type: "toggle", key: "enableFileList" }
                },
                {
                  name: "Activate in Quick Switcher",
                  desc: "Apply styling in quick switcher.",
                  control: { type: "toggle", key: "enableQuickSwitcher" }
                },
                {
                  name: "Activate in Link Autocompleter",
                  desc: "Apply styling in [[ suggestions.",
                  control: { type: "toggle", key: "enableSuggestor" }
                }
              ]
            },
            {
              type: "group",
              heading: "Experimental Data Sources",
              items: [
                {
                  name: "Read inline fields",
                  desc: "Enable Dataview inline field parsing.",
                  control: { type: "toggle", key: "getFromInlineField" }
                }
              ]
            }
          ]
        }
      ]
    });

    return definitions;
  }

  private renderRuleRow(
    setting: Setting,
    selector: CSSLink,
    index: number,
    selectors: CSSLink[],
    isEditing: boolean
  ) {
    setting.settingEl.className = "setting-item scl-clickable-row scl-main-rule-row";
    setting.settingEl.addClass("markdown-rendered");
    if (isEditing) setting.settingEl.addClass("is-active");

    setting.nameEl.empty();
    this.renderRuleSentence(setting.nameEl, selector);

    this.renderRuleBadges(setting, selector);
    this.renderReorderGrip(setting, index, selectors);
  }

  private getRuleDetailItems(selector: CSSLink, index: number, selectors: CSSLink[]): MyGroupItems[] {
    const rows: MyGroupItems[] = [];

    rows.push(this.createTypeRow(selector));
    if (selector.type === "attribute") rows.push(this.createAttributeNameRow(selector));

    rows.push(
      this.createValueRow(selector),
      this.createIconBeforeRow(selector),
      this.createIconAfterRow(selector),
      this.createFontWeightRow(selector),
      this.createFontStyleRow(selector),
      this.createLightColorRow(selector),
      this.createDarkColorRow(selector),
      this.createLightBgRow(selector),
      this.createDarkBgRow(selector),
      this.createDeleteRow(selector, index, selectors)
    );

    return rows;
  }

  private createColorCapsule(
    parent: HTMLElement,
    bgColor: string | undefined,
    textColor: string | undefined,
    modeName: string,
    fallbackText: string
  ): void {
    const capsule: HTMLSpanElement = parent.createSpan({
      cls: modeName.includes("Dark") 
        ? "scl-bg-capsule is-dark" 
        : "scl-bg-capsule",
      });

    capsule.setAttr("title", `${modeName} background: ${bgColor ?? "transparent"}`);

    if (bgColor && bgColor !== "transparent") {
      capsule.style.backgroundColor = bgColor;
    } else {
      capsule.addClass("is-transparent");
    }

    const dot: HTMLSpanElement = capsule.createSpan({ cls: "scl-color-dot" });
    dot.setAttr("title", `${modeName} text color: ${textColor ?? "default"}`);

    const activeColor = textColor ?? fallbackText;
    dot.style.setProperty("--scl-dot-color", activeColor);
  }

  private async moveRule(index: number, direction: number, selectors: CSSLink[]) {
    const targetIndex = index + direction;
    const targetSelector = selectors[targetIndex];
    if (!targetSelector) return;

    const allRowsBefore = Array.from(
      document.querySelectorAll(".vertical-tab-content-container .scl-clickable-row")
    );

    const currentRowBefore = allRowsBefore[index];
    const targetRowBefore = allRowsBefore[targetIndex];
    const currentRect = currentRowBefore?.getBoundingClientRect();
    const targetRect = targetRowBefore?.getBoundingClientRect();

    selectors[targetIndex] = selectors[index]!;
    selectors[index] = targetSelector;

    this.plugin.compileActiveAttributes();
    await this.plugin.saveSettings();
    await this._generateSnippet();
    this.refreshUI();

    if (currentRect && targetRect) {
      window.setTimeout(() => {
        const allRowsAfter = document.querySelectorAll(
          ".vertical-tab-content-container .scl-clickable-row"
        );
        const movedRow = allRowsAfter[targetIndex] as HTMLElement;
        const swappedRow = allRowsAfter[index] as HTMLElement;
        if (movedRow && swappedRow) {
          movedRow.animate(
            [
              { transform: `translateY(${currentRect.top - targetRect.top}px)` },
              { transform: "translateY(0)" }
            ],
            { duration: 250, easing: "ease-in-out" }
          );
          swappedRow.animate(
            [
              { transform: `translateY(${targetRect.top - currentRect.top}px)` },
              { transform: "translateY(0)" }
            ],
            { duration: 250, easing: "ease-in-out" }
          );
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