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

    // 🚀 SENTRAL EVENT DELEGATION: Én lytter for hele panelet som ALDRI lekker minne!
    this.containerEl.addEventListener("click", (e) => {
      const target = e.target as HTMLElement;
      
      // Finn ut om brukeren klikket på en av våre klikkbare stil-rader
      const clickedRow = target.closest(".scl-clickable-row") as HTMLElement;
      if (!clickedRow) return;

      // Ignorer klikk hvis brukeren traff en knapp, et ikon eller en fargebrikke på linjen
      if (target.closest(".clickable-icon") || target.closest("button") || target.closest(".scl-bg-capsule") || target.closest(".scl-color-dot")) {
        return;
      }

      // Finn den unike regelen som er knyttet til raden ved å "kikke" på dens plassering i DOM-en
      const allRows = Array.from(this.containerEl.querySelectorAll(".vertical-tab-content-container .scl-clickable-row"));
      const index = allRows.indexOf(clickedRow);
      const selectors = this.plugin.settings.selectors || [];
      const selector = selectors[index];

      if (selector) {
        // Hvis raden allerede er åpen, lukk den. Hvis ikke, åpne den!
        const isCurrentlyEditing = this.activeEditUid === selector.uid;
        this.activeEditUid = isCurrentlyEditing ? null : selector.uid;
        this.update(); // Sikker oppdatering av visningen
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
    const existingRuleItems: MyGroupItems[] = []; 
    const selectors = this.plugin.settings.selectors || [];

    // Hovedloopen er nå ekstremt lettlest og ryddig
    selectors.forEach((selector, index) => {
      const isEditing = this.activeEditUid === selector.uid;

      // Seksjon A: Radvisning
      existingRuleItems.push({
        render: (setting: Setting) => this.renderRuleRow(setting, selector, index, selectors, isEditing)
      });

      // Seksjon B: Utvidet redigeringsskjema
      if (isEditing) {
        existingRuleItems.push(...this.buildEditForm(selector, index, selectors));
      }
    });

    return this.assembleFinalSchema(existingRuleItems);
  }
  
  private renderRuleRow(setting: Setting, selector: CSSLink, index: number, selectors: CSSLink[], isEditing: boolean) {
    // 🚀 SKUDDSIKKER NULLSTILLING: Vasker bort alle gjenbrukte mobil-klasser før hovedraden tegnes!
    setting.settingEl.className = "setting-item scl-clickable-row scl-main-rule-row";
    if (isEditing) setting.settingEl.addClass("is-active");

    // 1. Bygg HTML-forhåndsvisningstekst (Uendret kjerne-logikk)
    if (selector.type === 'tag') {
      setting.nameEl.innerHTML = `<span class="data-link-icon data-link-text data-link-icon-after" data-link-tags="${selector.value}">Note</span> has tag <a class="tag">#${selector.value || "empty"}</a>`;
    } else if (selector.type === 'attribute') {
      setting.nameEl.innerHTML = `<span class="data-link-icon data-link-text data-link-icon-after" data-link-${selector.name}="${selector.value}">Note</span> has attribute <b>${selector.name || "empty"}</b> with value <b>${selector.value || "empty"}</b>`;
    } else {
      setting.nameEl.innerHTML = `The path of the <span class="data-link-icon data-link-text data-link-icon-after" data-link-path="${selector.value}">note</span> matches <b>${selector.value || "empty"}</b>`;
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
  }

  private createColorCapsule(parent: HTMLElement, bgColor: string | undefined, textColor: string | undefined, modeName: string, fallbackText: string) {
    const capsule = parent.createEl("span", { cls: modeName.includes("Dark") ? "scl-bg-capsule is-dark" : "scl-bg-capsule" });
    capsule.title = `${modeName} background: ${bgColor || "transparent"}`;
    if (bgColor && bgColor !== "transparent") capsule.style.backgroundColor = bgColor;
    else capsule.addClass("is-transparent");

    const dot = capsule.createEl("span", { cls: "scl-color-dot" });
    dot.style.setProperty("--scl-dot-color", textColor || fallbackText);
    dot.style.backgroundColor = "var(--scl-dot-color)";
    dot.title = `${modeName} text color: ${textColor || "default"}`;
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
          selectors.splice(index, 1); if (this.activeEditUid === selector.uid) this.activeEditUid = null;
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

    await this.plugin.saveSettings();
    this.debouncedGenerate(); // Always compile CSS in the background
    
    // 🔑 THE SCROLL FIX: Only refresh the whole DOM tab if NOT running in silent mode
    if (!silent) {
      this.update(); 
    }
  }

}

