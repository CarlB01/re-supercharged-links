import { App, debounce, PluginSettingTab, SettingDefinitionItem, Setting, SettingGroupItem } from "obsidian";
import ResuperchargedLinks from "./main";
import { updateVisibleLinks } from "./linkAttributes";
import { buildCSS } from "./cssBuilder";
import { CSSLink } from "./cssLink";

type MyGroupItems = SettingDefinitionItem | { render: (setting: Setting) => void };

export default class SCLSettingTab extends PluginSettingTab {
  plugin: ResuperchargedLinks;
  private readonly debouncedGenerate: () => void;
  
  private rulesSearchQuery = "";
  
  constructor(app: App, plugin: ResuperchargedLinks) {
    super(app, plugin);
    this.plugin = plugin;
    this.debouncedGenerate = debounce(() => { void this._generateSnippet(); }, 300, true);

    void this._generateSnippet();

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
        type: "page",
        name: this.getRuleTitle(selector),
        desc: this.getRuleDescription(selector),
render: (setting: Setting) => {
          // idempotent cleanup
          setting.controlEl.querySelectorAll(".scl-reorder-inline").forEach((el) => el.remove());

          const wrap = setting.controlEl.createDiv({ cls: "scl-reorder-inline" });
          const grip = wrap.createEl("button", {
            cls: "clickable-icon scl-grip-btn",
            attr: { "aria-label": "Reorder (tap: down, long-press/Shift: up)" }
          });
          grip.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="5" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="19" r="1"/></svg>`;

          let longPressTriggered = false;
          const moveBy = (direction: number) => {
            const targetIndex = index + direction;
            if (targetIndex < 0 || targetIndex >= selectors.length) return;
            void this.moveRule(index, direction, selectors);
          };

          const onLongPress = debounce(() => {
            longPressTriggered = true;
            moveBy(-1); // up
          }, 380, true);

          grip.addEventListener("pointerdown", (evt: PointerEvent) => {
            if (evt.pointerType !== "touch") return;
            longPressTriggered = false;
            onLongPress();
          });

          const cancelLongPress = () => onLongPress.cancel();
          grip.addEventListener("pointerup", cancelLongPress);
          grip.addEventListener("pointercancel", cancelLongPress);
          grip.addEventListener("pointerleave", cancelLongPress);

          grip.addEventListener("click", (evt: MouseEvent) => {
            evt.preventDefault();
            evt.stopPropagation(); // prevent page navigation when clicking grip
            if (longPressTriggered) {
              longPressTriggered = false; // swallow click after long-press
              return;
            }
            const direction = evt.shiftKey ? -1 : 1; // shift-click => up, click => down
            moveBy(direction);
          });
        },
        items: this.getRuleDetailItems(selector, index, selectors) as unknown as SettingGroupItem<string>[]
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
          render: (setting: Setting) => {
            setting.addButton((btn) =>
              btn
                .setButtonText("Create")
                .onClick(() => {

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

  private getRuleTitle(selector: CSSLink): string {
    const value = selector.value || "empty";
    if (selector.type === "tag") return `#${value}`;
    if (selector.type === "attribute") return `${selector.name || "attribute"}: ${value}`;
    return `Path: ${value}`;
  }

  private getRuleDescription(selector: CSSLink): string {
  const fg = selector.lightColor || "default";
    const bg = selector.lightBgColor && selector.lightBgColor !== "transparent" ? selector.lightBgColor : "transparent";
    const before = selector.iconBefore ? ` ${selector.iconBefore}` : "";
    const after = selector.iconAfter ? ` ${selector.iconAfter}` : "";
    const iconPart = before || after ? ` • Icons:${before}${after}` : "";
    return `Text ${fg} • Bg ${bg}${iconPart}`;  
  }

private getRuleDetailItems(selector: CSSLink, index: number, selectors: CSSLink[]): MyGroupItems[] {
  return [
    {
      name: "Match Target Type",
      desc: "Select target metadata type.",
      control: {
        type: "dropdown",
        key: `scl_type_${selector.uid}`,
        options: { tag: "Tag", attribute: "Attribute", path: "Note Path" }
      }
    },
    ...(selector.type === "attribute"
      ? [
          {
            render: (setting: Setting) => {
              setting.settingEl.addClass("scl-detail-row");
              setting.setName("Key name (attributes only)").setDesc("Frontmatter key to read.");
              setting.addText((t) =>
                t.setPlaceholder("status").setValue(selector.name || "").onChange(async (v) => {
                  await this.setControlValue(`scl_name_${selector.uid}`, v, true);
                })
              );
            }
          }
        ]
      : []),
    {
      render: (setting: Setting) => {
        setting.settingEl.addClass("scl-detail-row");
        setting.setName("Value to match").setDesc("Trigger keyword.");
        setting.addText((t) =>
          t.setPlaceholder("todo").setValue(selector.value || "").onChange(async (v) => {
            await this.setControlValue(`scl_value_${selector.uid}`, v, true);
          })
        );
      }
    },
    {
      render: (setting: Setting) => {
        setting.settingEl.addClass("scl-detail-row");
        setting.setName("Prepend Icon").setDesc("Icon to inject before link text.");
        setting.addText((t) =>
          t.setPlaceholder("").setValue(selector.iconBefore || "").onChange(async (v) => {
            await this.setControlValue(`scl_iconBefore_${selector.uid}`, v, true);
          })
        );
      }
    },
    {
      render: (setting: Setting) => {
        setting.settingEl.addClass("scl-detail-row");
        setting.setName("Append Icon").setDesc("Icon to inject after link text.");
        setting.addText((t) =>
          t.setPlaceholder("").setValue(selector.iconAfter || "").onChange(async (v) => {
            await this.setControlValue(`scl_iconAfter_${selector.uid}`, v, true);
          })
        );
      }
    },
    {
      render: (setting: Setting) => {
        setting.settingEl.addClass("scl-detail-row");
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
      }
    },
    {
      render: (setting: Setting) => {
        setting.settingEl.addClass("scl-detail-row");
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
      }
    },
    {
      render: (setting: Setting) => {
        setting.settingEl.addClass("scl-detail-row", "scl-row-lightcolor");
        setting.setName("Light Mode Color").setDesc("Text color for light theme.");
        setting.addColorPicker((cp) =>
          cp.setValue(selector.lightColor || "#000000").onChange(async (v) => {
            await this.setControlValue(`scl_lightColor_${selector.uid}`, v, true);
          })
        );
      }
    },
    {
      render: (setting: Setting) => {
        setting.settingEl.addClass("scl-detail-row", "scl-row-darkcolor");
        setting.setName("Dark Mode Color").setDesc("Text color for dark theme.");
        setting.addColorPicker((cp) =>
          cp.setValue(selector.darkColor || "#ffffff").onChange(async (v) => {
            await this.setControlValue(`scl_darkColor_${selector.uid}`, v, true);
          })
        );
      }
    },
    {
      render: (setting: Setting) => {
        setting.settingEl.addClass("scl-detail-row", "scl-row-lightbg");
        setting.setName("Light Mode Background").setDesc("Background color for light theme.");
        const val = selector.lightBgColor && selector.lightBgColor !== "transparent" ? selector.lightBgColor : "#ffffff";
        setting.addColorPicker((cp) =>
          cp.setValue(val).onChange(async (v) => {
            await this.setControlValue(`scl_lightBgColor_${selector.uid}`, v, true);
          })
        );
      }
    },
    {
      render: (setting: Setting) => {
        setting.settingEl.addClass("scl-detail-row", "scl-row-darkbg");
        setting.setName("Dark Mode Background").setDesc("Background color for dark theme.");
        const val = selector.darkBgColor && selector.darkBgColor !== "transparent" ? selector.darkBgColor : "#1e1e1e";
        setting.addColorPicker((cp) =>
          cp.setValue(val).onChange(async (v) => {
            await this.setControlValue(`scl_darkBgColor_${selector.uid}`, v, true);
          })
        );
      }
    },
    {
      render: (setting: Setting) => {
        setting.setName("Delete style").setDesc("Permanently remove this style rule.");
        setting.settingEl.addClass("scl-detail-row", "scl-row-delete");
        setting.addButton((btn) =>
          btn.setButtonText("Delete").setWarning().onClick(async () => {
            selectors.splice(index, 1);
            this.plugin.compileActiveAttributes();
            await this.plugin.saveSettings();
            await this._generateSnippet();
            this.refreshUI();
          })
        );
      }
    }
  ];
}

  private async moveRule(index: number, direction: number, selectors: CSSLink[]) {
    const targetIndex = index + direction;
    const targetSelector = selectors[targetIndex];
    if (!targetSelector) return;

    selectors[targetIndex] = selectors[index]!;
    selectors[index] = targetSelector;

    this.plugin.compileActiveAttributes();
    await this.plugin.saveSettings();
    await this._generateSnippet();
    this.refreshUI();
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