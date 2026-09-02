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

  constructor(app: App, plugin: ResuperchargedLinks) {
    super(app, plugin);
    this.plugin = plugin;
    this.debouncedGenerate = debounce(() => { void this._generateSnippet(); }, 300, true);
    void this._generateSnippet();

    // 🚀 NATIVE NAVIGATION ENGINE: Lytter etter klikk for å navigere til undersiden!
    this.containerEl.addEventListener("click", (e) => {
      const target = e.target as HTMLElement;
      
      const clickedRow = target.closest(".scl-clickable-row") as HTMLElement;
      if (!clickedRow) return;

      // Hvis de trykker på opp/ned-pilene eller slettekrysset, skal vi ikke navigere bort
      if (target.closest(".scl-order-btn") || target.closest(".clickable-icon")) return;

      const allRows = Array.from(this.containerEl.querySelectorAll(".vertical-tab-content-container .scl-main-rule-row"));
      const index = allRows.indexOf(clickedRow);
      const selectors = this.plugin.settings.selectors || [];
      const selector = selectors[index];

      if (selector) {
        // 🔑 NAVIGERER TIL UNDERSIDEN: Setter denne regelen som aktiv og oppdaterer skjemaet
        this.activeEditUid = selector.uid;
        this.update(); // 🚀 Korrekt kjerne-metode for ditt rammeverk!
      }
    });
  }



  private async _generateSnippet() {
    await buildCSS(this.plugin.settings.selectors, this.plugin);
    updateVisibleLinks(this.app, this.plugin);
  }

  override getControlValue(key: string): unknown {
    const settings = this.plugin.settings;
    const coreKeys = ["targetTags", "getFromInlineField", "activateSnippet", "enableEditor", "enableTabHeader", "enableFileList", "enableBacklinks", "enableQuickSwitcher", "enableSuggestor"];

    if (coreKeys.includes(key)) {
      return (settings as unknown as Record<string, unknown>)[key];
    }

    if (key.startsWith("scl_")) {
      const [, prop, uid] = key.split("_");
      const selector = settings.selectors.find((s) => s.uid === uid);
      const editableProps = ["type", "name", "value", "iconBefore", "iconAfter", "lightColor", "darkColor", "lightBgColor", "darkBgColor", "fontWeight", "fontStyle"];
      
      if (selector && typeof prop === "string" && editableProps.includes(prop)) {
        return (selector as unknown as Record<string, unknown>)[prop];
      }
    }
    return undefined;
  }

  override getSettingDefinitions(): SettingDefinitionItem[] {
    const definitions: SettingDefinitionItem[] = [];
    const selectors = this.plugin.settings.selectors || [];

    // =========================================================================
    // 🎛️ CONTEXT A: VIS DETALJERT UNDERSIDE FOR VALGT STIL
    // =========================================================================
    if (this.activeEditUid) {
      const selector = selectors.find(s => s.uid === this.activeEditUid);
      if (!selector) {
        this.activeEditUid = null;
        return this.getSettingDefinitions();
      }

      const index = selectors.indexOf(selector);
      const editItems: MyGroupItems[] = [
        // 🔙 STANDARD OBSIDIAN TILBAKE-KNAPP ØVERST
        { render: (setting: Setting) => {
          setting.setName("← Back to style list").setDesc(`Editing style configuration for rule #${index + 1}`);
          setting.addButton(btn => btn.setButtonText("Back").setCta().onClick(() => {
            this.activeEditUid = null;
            this.update(); // 🚀 Tegner opp hovedlisten igjen
          }));
        }},
        // Standard innholdsfelter for undersiden (Gjenbruker dine deklarative kontroller)
        { name: "Match Target Type", desc: "Select target metadata type.", control: { type: "dropdown", key: `scl_type_${selector.uid}`, options: { tag: "Tag", attribute: "Attribute", path: "Note Path" } } },
        ...(selector.type === "attribute" ? [{ name: "Key name (only for attributes)", desc: "The YAML property key name.", control: { type: "text" as const, key: `scl_name_${selector.uid}`, placeholder: "status" } }] : []),
        { name: "Value to match", desc: "Trigger keyword.", control: { type: "text", key: `scl_value_${selector.uid}`, placeholder: "todo" } },
        { name: "Prepend Icon", desc: "Icon to inject before the link text.", control: { type: "text", key: `scl_iconBefore_${selector.uid}`, placeholder: "" } },
        { name: "Append Icon", desc: "Icon to inject after the link text.", control: { type: "text", key: `scl_iconAfter_${selector.uid}`, placeholder: "" } },
        { name: "Font Weight", desc: "Choose font weight adjustment.", control: { type: "dropdown", key: `scl_fontWeight_${selector.uid}`, options: { "normal": "Normal", "lighter": "Lighter", "bold": "Bold" } } },
        { name: "Font Style", desc: "Choose typography emphasis decoration.", control: { type: "dropdown", key: `scl_fontStyle_${selector.uid}`, options: { "normal": "Normal", "italic": "Italic", "underline": "Underline", "line-through": "Strikethrough" } } },
        { name: "Light Mode Color", desc: "Foreground text color token for white themes.", control: { type: "color", key: `scl_lightColor_${selector.uid}` } },
        { name: "Dark Mode Color", desc: "Foreground text color token for dark themes.", control: { type: "color", key: `scl_darkColor_${selector.uid}` } },
        { name: "Light Mode Background", desc: "Background layer token for white themes.", control: { type: "color", key: `scl_lightBgColor_${selector.uid}` } },
        { name: "Dark Mode Background", desc: "Background layer token for dark themes.", control: { type: "color", key: `scl_darkBgColor_${selector.uid}` } },
        // Sletteknapp i bunnen av undersiden
        { name: "Delete style", desc: "Remove this styling rule permanently from hvelvet.", render: (setting: Setting) => {
          setting.addButton(btn => btn.setButtonText("Delete Rule").setClass("scl-delete-btn-standard").onClick(async () => {
            selectors.splice(index, 1);
            this.plugin.compileActiveAttributes();
            this.activeEditUid = null;
            await this.plugin.saveSettings();
            await this._generateSnippet();
            this.update(); // 🚀 Går tilbake til listen etter sletting
          }));
        }}
      ];

      definitions.push({ type: "group", heading: "Style Configuration", items: editItems as unknown as SettingGroupItem<string>[] });
      return definitions;
    }

    // =========================================================================
    // 📋 CONTEXT B: VIS DEN STANDARD HOVEDLISTEN OVER REGLER
    // =========================================================================
    const existingRuleItems: MyGroupItems[] = []; 
    selectors.forEach((selector, index) => {
      existingRuleItems.push({
        render: (setting: Setting) => this.renderRuleRow(setting, selector, index, selectors, false)
      });
    });

    if (existingRuleItems.length > 0) {
      definitions.push({ type: "group", heading: "Link Styling Rules", items: existingRuleItems as unknown as SettingGroupItem<string>[] });
    }

    // Knapp for å opprette ny regel (Uendret kjerne-logikk)
    definitions.push({
      type: "group", heading: "NEW rules", items: [{ 
        name: "Create a new style rule", desc: "Adds a template selector with distinct, pre-configured color accents.", action: () => {
          const newSelector = new CSSLink(); 
          newSelector.type = "tag"; 
          newSelector.value = "new-tag";
          const generatedColors = (this as any).generateUniqueColors();
          newSelector.lightColor = generatedColors.light;
          newSelector.darkColor = generatedColors.dark;
          newSelector.lightBgColor = "transparent";
          newSelector.darkBgColor = "transparent";

          selectors.push(newSelector); 
          this.plugin.compileActiveAttributes();
          void this.plugin.saveSettings();
          void this._generateSnippet(); 
          this.activeEditUid = newSelector.uid; 
          this.update();
        }
      }]
    });

    // Globale avanserte innstillinger i bunnen (Uendret kjerne-logikk)
    definitions.push({
      type: "group", heading: "Advanced Settings Overview", items: [{ type: "page", name: "Advanced Settings", desc: "Configure global panels and triggers.", items: [
        { type: "group", heading: "General", items: [{ name: "Parse all tags in the file", desc: "Look in frontmatter and inline.", control: { type: "toggle", key: "targetTags" } }, { name: "Automatically activate CSS snippet", desc: "Enable general snippet sheet.", control: { type: "toggle", key: "activateSnippet" } }] },
        { type: "group", heading: "Where to Supercharge", items: [{ name: "Enable in Editor", desc: "Live Preview support.", control: { type: "toggle", key: "enableEditor" } }, { name: "Enable in Tab Headers", desc: "Tab titles names.", control: { type: "toggle", key: "enableTabHeader" } }, { name: "Enable in Plugins & Panels", desc: "Backlinks view panels.", control: { type: "toggle", key: "enableBacklinks" } }] },
        { type: "group", heading: "Display panels", items: [{ name: "Activate in File Browser", desc: "File explorer tree.", control: { type: "toggle", key: "enableFileList" } }, { name: "Activate in Quick Switcher", desc: "Core search popover.", control: { type: "toggle", key: "enableQuickSwitcher" } }, { name: "Activate in Link Autocompleter", desc: "The [[ auto picker menu.", control: { type: "toggle", key: "enableSuggestor" } }] },
        { type: "group", heading: "Experimental data sources", items: [{ name: "Search for attributes in Inline fields", desc: "Turn on Dataview inline fields syntax.", control: { type: "toggle", key: "getFromInlineField" } }] }
      ]}]
    });

    return definitions;
  }

  
  private renderRuleRow(setting: Setting, selector: CSSLink, index: number, selectors: CSSLink[], isEditing: boolean) {
    setting.settingEl.className = "setting-item scl-clickable-row scl-main-rule-row";
    if (isEditing) setting.settingEl.addClass("is-active");

    // 🚀 TRYGG OG GODKJENT DOM-BYGGING UTEN INNERHTML
    setting.nameEl.empty(); // Tømmer beholderen fullstendig før vi bygger
    const valText = selector.value || "empty";

    if (selector.type === 'tag') {
      // 1. <span class="..." data-link-tags="...">Note</span>
      const noteSpan = setting.nameEl.createEl("span", { 
        cls: "data-link-icon data-link-text data-link-icon-after",
        text: "Note"
      });
      noteSpan.setAttribute("data-link-tags", selector.value || "");

      // 2. Ren tekst: " has tag "
      setting.nameEl.appendText(" has tag ");

      // 3. <a class="tag">#value</a>
      setting.nameEl.createEl("a", { cls: "tag", text: `#${valText}` });

    } else if (selector.type === 'attribute') {
      const attrName = selector.name || "empty";
      
      // 1. <span class="..." data-link-[attr]="...">Note</span>
      const noteSpan = setting.nameEl.createEl("span", { 
        cls: "data-link-icon data-link-text data-link-icon-after",
        text: "Note"
      });
      if (selector.name) {
        noteSpan.setAttribute(`data-link-${selector.name}`, selector.value || "");
      }

      setting.nameEl.appendText(" has attribute ");
      setting.nameEl.createEl("b", { text: attrName });
      setting.nameEl.appendText(" with value ");
      setting.nameEl.createEl("b", { text: valText });

    } else {
      // 1. Ren tekst: "The path of the "
      setting.nameEl.appendText("The path of the ");

      // 2. <span class="..." data-link-path="...">note</span>
      const noteSpan = setting.nameEl.createEl("span", { 
        cls: "data-link-icon data-link-text data-link-icon-after",
        text: "note"
      });
      noteSpan.setAttribute("data-link-path", selector.value || "");

      setting.nameEl.appendText(" matches ");
      setting.nameEl.createEl("b", { text: valText });
    }

    setting.settingEl.addClass("scl-clickable-row");
    if (isEditing) setting.settingEl.addClass("is-active");

    // 3. Generer de parvise kapsel-fargebrikkene
    if (setting.controlEl) {
      const badgeContainer = setting.controlEl.createEl("span", { cls: "scl-badge-container" });
      this.createColorCapsule(badgeContainer, selector.lightBgColor, selector.lightColor, "Light mode", "var(--text-normal)");
      this.createColorCapsule(badgeContainer, selector.darkBgColor, selector.darkColor, "Dark mode", "var(--text-muted)");
    }

    // 4. Pilknapper med integrert FLIP-animasjon
    setting.addButton(btn => btn.setIcon("arrow-down").setTooltip("Move down").setClass("scl-order-btn").setDisabled(index === selectors.length - 1).onClick(() => this.moveRule(index, 1, selectors, setting.settingEl)));
    setting.addButton(btn => btn.setIcon("arrow-up").setTooltip("Move up").setClass("scl-order-btn").setDisabled(index === 0).onClick(() => this.moveRule(index, -1, selectors, setting.settingEl)));
  
    // 🚀 CHEVRON-NAVIGASJON: Indikerer at linjen kan klikkes for å åpne detaljene
    setting.addButton(btn => btn.setIcon("chevron-right").setTooltip("Open style details").setClass("scl-order-btn").onClick(() => {
      this.activeEditUid = selector.uid;
      this.update();
    }));
  }

  private createColorCapsule(parent: HTMLElement, bgColor: string | undefined, textColor: string | undefined, modeName: string, fallbackText: string) {
    const capsule = parent.createEl("span", { cls: modeName.includes("Dark") ? "scl-bg-capsule is-dark" : "scl-bg-capsule" });
    capsule.title = `${modeName} background: ${bgColor || "transparent"}`;
    if (bgColor && bgColor !== "transparent") capsule.style.backgroundColor = bgColor;
    else capsule.addClass("is-transparent");

    const dot = capsule.createEl("span", { cls: "scl-color-dot" });
    dot.title = `${modeName} text color: ${textColor || "default"}`;
    
    // 🚀 LØSNINGEN: Bruk Obsidians godkjente API i stedet for direkte .style-manipulasjon!
    const activeColor = textColor || fallbackText;
    dot.setCssProps({
      "--scl-dot-color": activeColor
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
    this.update();

    if (rowEl && siblingEl) {
      const rectSibling = siblingEl.getBoundingClientRect();
      setTimeout(() => {
        const all = document.querySelectorAll(".vertical-tab-content-container .scl-clickable-row");
        const nCur = all[targetIndex] as HTMLElement; 
        const nSib = all[index] as HTMLElement;
        if (nCur && nSib) {
          nCur.animate([{ transform: `translateY(${rectCurrent.top - rectSibling.top}px)` }, { transform: "translateY(0)" }], { duration: 250, easing: "ease-in-out" });
          nSib.animate([{ transform: `translateY(${rectSibling.top - rectCurrent.top}px)` }, { transform: "translateY(0)" }], { duration: 250, easing: "ease-in-out" });
        }
      }, 0);
    }
  }

  private buildEditForm(selector: CSSLink, index: number, selectors: CSSLink[]): MyGroupItems[] {
    return [
      { name: "Match Target Type", desc: "Select target metadata type.", control: { type: "dropdown", key: `scl_type_${selector.uid}`, options: { tag: "Tag", attribute: "Attribute", path: "Note Path" } } },
      ...(selector.type === "attribute" ? [{ name: "Key name (only for attributes)", desc: "The YAML property key name.", control: { type: "text" as const, key: `scl_name_${selector.uid}`, placeholder: "status" } }] : []),
      { name: "Value to match", desc: "Trigger keyword.", control: { type: "text", key: `scl_value_${selector.uid}`, placeholder: "todo" } },
      
      // Prepend Icon (Med unikt klasse-anker)
      { render: (setting: Setting) => {
        setting.setName("Prepend Icon").setDesc("Icon before link.");
        setting.settingEl.className = "setting-item scl-detail-row scl-row-iconbefore";
        // Prepend Icon
        setting.addText(text => text.setPlaceholder("").setValue(selector.iconBefore || "").onChange(async (v) => {
          await this.setControlValue(`scl_iconBefore_${selector.uid}`, v, true); // 🚀 silent = true!
        }));
      }},
      
      // // Append Icon (Med unikt klasse-anker)
      { render: (setting: Setting) => {
        setting.setName("Append Icon").setDesc("Icon after link.");
        setting.settingEl.className = "setting-item scl-detail-row scl-row-iconafter";
        setting.addText(text => text.setPlaceholder("").setValue(selector.iconAfter || "").onChange(async (v) => {
          await this.setControlValue(`scl_iconAfter_${selector.uid}`, v, true);
        }));
      }},
      
      // Font Weight
      { render: (setting: Setting) => {
        setting.setName("Font Weight").setDesc("Link thickness.");
        setting.settingEl.className = "setting-item scl-detail-row scl-row-weight";
        setting.addDropdown(dc => dc.addOptions({ "normal": "Normal", "lighter": "Lighter", "bold": "Bold" }).setValue(selector.fontWeight || "normal").onChange(async (v) => {
          await this.setControlValue(`scl_fontWeight_${selector.uid}`, v, true);
        }));
      }},
      
      // Font Style
      { render: (setting: Setting) => {
        setting.setName("Font Style").setDesc("Text decorations.");
        setting.settingEl.className = "setting-item scl-detail-row scl-row-style";
        setting.addDropdown(dc => dc.addOptions({ "normal": "Normal", "italic": "Italic", "underline": "Underline", "line-through": "Strikethrough" }).setValue(selector.fontStyle || "normal").onChange(async (v) => {
          await this.setControlValue(`scl_fontStyle_${selector.uid}`, v, true);
        }));
      }},

      // ☀️ Farge 1: Light Mode Text Color
      { render: (setting: Setting) => {
        setting.setName("Light Mode Color").setDesc("Text color for white themes.");
        setting.settingEl.className = "setting-item scl-color-row scl-text-picker-row scl-row-lightcolor";
        // Light Mode Color
        setting.addColorPicker(cp => {
          cp.setValue(selector.lightColor || "#000000");
          cp.onChange(async (v) => await this.setControlValue(`scl_lightColor_${selector.uid}`, v, true));
        });
        setting.addExtraButton(eb => eb.setIcon("cross").setTooltip("Clear text color").onClick(async () => {
          selector.lightColor = ""; await this.plugin.saveSettings(); await this._generateSnippet(); this.update();
        }));
      }},

      // 🌙 Farge 2: Dark Mode Text Color
      { render: (setting: Setting) => {
        setting.setName("Dark Mode Color").setDesc("Text color for dark themes.");
        setting.settingEl.className = "setting-item scl-color-row scl-text-picker-row scl-row-darkcolor";
        // Dark Mode Color
        setting.addColorPicker(cp => {
          cp.setValue(selector.darkColor || "#ffffff");
          cp.onChange(async (v) => await this.setControlValue(`scl_darkColor_${selector.uid}`, v, true));
        });
        setting.addExtraButton(eb => eb.setIcon("cross").setTooltip("Clear text color").onClick(async () => {
          selector.darkColor = ""; await this.plugin.saveSettings(); await this._generateSnippet(); this.update();
        }));
      }},

      // ☀️ Farge 3: Light Mode Background Picker
      { render: (setting: Setting) => {
        setting.setName("Light Mode Background").setDesc("Background for light themes.");
        setting.settingEl.className = "setting-item scl-color-row scl-bg-picker-row scl-row-lightbg";
        // Light Mode Background
        setting.addColorPicker(cp => {
          const currentVal = selector.lightBgColor;
          const fallbackColor = (currentVal && currentVal !== "transparent") ? currentVal : "#ffffff";
          cp.setValue(fallbackColor);
          cp.onChange(async (v) => await this.setControlValue(`scl_lightBgColor_${selector.uid}`, v, true));
        });
        setting.addExtraButton(eb => eb.setIcon("cross").setTooltip("Clear background color").onClick(async () => {
          selector.lightBgColor = "transparent"; await this.plugin.saveSettings(); await this._generateSnippet(); this.update();
        }));
      }},

      // 🌙 Farge 4: Dark Mode Background Picker
      { render: (setting: Setting) => {
        setting.setName("Dark Mode Background").setDesc("Background for dark themes.");
        setting.settingEl.className = "setting-item scl-color-row scl-bg-picker-row scl-row-darkbg";
        // Dark Mode Background
        setting.addColorPicker(cp => {
          const currentVal = selector.darkBgColor;
          const fallbackColor = (currentVal && currentVal !== "transparent") ? currentVal : "#1e1e1e";
          cp.setValue(fallbackColor);
          cp.onChange(async (v) => await this.setControlValue(`scl_darkBgColor_${selector.uid}`, v, true));
        });     
        setting.addExtraButton(eb => eb.setIcon("cross").setTooltip("Clear background color").onClick(async () => {
          selector.darkBgColor = "transparent"; await this.plugin.saveSettings(); await this._generateSnippet(); this.update();
        }));
      }},

      { name: "Delete style", desc: "Remove permanently.", render: (setting: Setting) => {
        setting.addButton(btn => btn.setButtonText("Delete").setClass("scl-delete-btn-standard").onClick(async () => {
          selectors.splice(index, 1); 
          if (this.activeEditUid === selector.uid) this.activeEditUid = null;
          this.plugin.compileActiveAttributes(); // Oppdaterer listen med en gang regelen slettes
          await this.plugin.saveSettings(); await this._generateSnippet(); this.update();
        }));
      }}
    ];
  }


  // 🚀 HELT NY ROUTINE: Genererer tilfeldige, harmoniske og unike tekstfarger
  // 🚀 UPDATED ROUTINE: Spits out valid HEX codes that HTML Color Pickers understand instantly
  private generateUniqueColors(): { light: string; dark: string } {
    const hue = Math.floor(Math.random() * 360);
    
    // Hjelpefunksjon for å gjøre HSL om til ekte HEX-koder
    const hslToHex = (h: number, s: number, l: number): string => {
      l /= 100; const a = (s * Math.min(l, 1 - l)) / 100;
      const f = (n: number) => {
        const k = (n + h / 30) % 12;
        const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
        return Math.round(255 * color).toString(16).padStart(2, "0");
      };
      return `#${f(0)}${f(8)}${f(4)}`;
    };

    // Genererer delikate, unike pastell-kontraster i HEX-format
    return {
      light: hslToHex(hue, 65, 35), // God lesbar mørk tekst for lyst tema
      dark: hslToHex(hue, 80, 75)   // Lysende pastell for mørkt tema
    };
  }


  private assembleFinalSchema(existingRuleItems: MyGroupItems[]): SettingDefinitionItem[] {
    const definitions: SettingDefinitionItem[] = [];
    const selectors = this.plugin.settings.selectors || [];
    
    if (existingRuleItems.length > 0) {
      definitions.push({ type: "group", heading: "Link Styling Rules", items: existingRuleItems as unknown as SettingGroupItem<string>[] });
    }
    
    definitions.push({
      type: "group", 
      heading: "NEW rules", 
      items: [{ 
        name: "Create a new style rule", 
        desc: "Adds a template selector with distinct, pre-configured color accents.", 
        action: () => {
          const newSelector = new CSSLink(); 
          newSelector.type = "tag"; 
          newSelector.value = "new-tag";
          
          // 🚀 AKTIVERT: Generer og tildel de unike fargene umiddelbart!
          const generatedColors = this.generateUniqueColors();
          newSelector.lightColor = generatedColors.light;
          newSelector.darkColor = generatedColors.dark;

          // Bakgrunner skal fortsatt starte som tomme/transparente (slik du ønsket)
          newSelector.lightBgColor = "transparent";
          newSelector.darkBgColor = "transparent";

          selectors.push(newSelector); 

          this.plugin.compileActiveAttributes(); // Oppdaterer den unike attributt-listen øverst i minnet
          void this.plugin.saveSettings();
          
          // Trigger CSS-kompilering med en gang så de nye fargene tegnes i sirkelen med en gang
          void this._generateSnippet(); 
          
          this.activeEditUid = newSelector.uid; 
          this.update();
        }
      }]
    });

    // ... Resten av Advanced Settings Overview forblir uendret
    definitions.push({
      type: "group", heading: "Advanced Settings Overview", items: [{ type: "page", name: "Advanced Settings", desc: "Configure global panels and triggers.", items: [
        { type: "group", heading: "General", items: [{ name: "Parse all tags in the file", desc: "Look in frontmatter and inline.", control: { type: "toggle", key: "targetTags" } }, { name: "Automatically activate CSS snippet", desc: "Enable general snippet sheet.", control: { type: "toggle", key: "activateSnippet" } }] },
        { type: "group", heading: "Where to Supercharge", items: [{ name: "Enable in Editor", desc: "Live Preview support.", control: { type: "toggle", key: "enableEditor" } }, { name: "Enable in Tab Headers", desc: "Tab titles names.", control: { type: "toggle", key: "enableTabHeader" } }, { name: "Enable in Plugins & Panels", desc: "Backlinks view panels.", control: { type: "toggle", key: "enableBacklinks" } }] },
        { type: "group", heading: "Display panels", items: [{ name: "Activate in File Browser", desc: "File explorer tree.", control: { type: "toggle", key: "enableFileList" } }, { name: "Activate in Quick Switcher", desc: "Core search popover.", control: { type: "toggle", key: "enableQuickSwitcher" } }, { name: "Activate in Link Autocompleter", desc: "The [[ auto picker menu.", control: { type: "toggle", key: "enableSuggestor" } }] },
        { type: "group", heading: "Experimental data sources", items: [{ name: "Search for attributes in Inline fields", desc: "Turn on Dataview inline fields syntax.", control: { type: "toggle", key: "getFromInlineField" } }] }
      ]}]
    });
    return definitions;
  }

  // 🚀 UPDATED SETTER: Supports silent real-time updates without scrolling/blinking on iOS
  override async setControlValue(key: string, value: unknown, silent = false): Promise<void> {
    const settings = this.plugin.settings;

    if (key.startsWith("scl_")) {
      const [, prop, uid] = key.split("_");
      const selector = settings.selectors.find((s) => s.uid === uid);
      const editableProps = ["type", "name", "value", "iconBefore", "iconAfter", "lightColor", "darkColor", "lightBgColor", "darkBgColor", "fontWeight", "fontStyle"];
      
      if (selector && typeof prop === "string" && editableProps.includes(prop)) {
        (selector as any)[prop] = value; 
      }
    } else {
      (settings as unknown as Record<string, unknown>)[key] = value;
    }

    this.plugin.compileActiveAttributes(); // Sørger for at Dataview og Frontmatter-loopen alltid har ferske data
    
    await this.plugin.saveSettings();
    this.debouncedGenerate(); // Always compile CSS in the background
    
    // 🔑 THE SCROLL FIX: Only refresh the whole DOM tab if NOT running in silent mode
    if (!silent) {
      this.update(); 
    }
  }

}

