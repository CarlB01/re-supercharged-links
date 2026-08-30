import { App, debounce, PluginSettingTab, SettingDefinitionItem, Setting, SettingGroupItem } from "obsidian";
import ResuperchargedLinks from "./main";
import { updateVisibleLinks } from "./linkAttributes";
import { buildCSS } from "./cssBuilder";
import { CSSLink } from "./cssLink";

// 🚀 Union Type som tillater både standardkontroller og våre egne render-rader i samme liste
type MyGroupItems = SettingDefinitionItem | { render: (setting: Setting) => void };

export default class SCLSettingTab extends PluginSettingTab {
  plugin: ResuperchargedLinks;
  private readonly debouncedGenerate: () => void;
  public activeEditUid: string | null = null; // Holder styr på hvilken rad som er åpen

  constructor(app: App, plugin: ResuperchargedLinks) {
    super(app, plugin);
    this.plugin = plugin;
    this.debouncedGenerate = debounce(() => { void this._generateSnippet(); }, 300, true);
    void this._generateSnippet();
  }

  private async _generateSnippet() {
    await buildCSS(this.plugin.settings.selectors, this.plugin);
    updateVisibleLinks(this.app, this.plugin);
  }

  /**
   * 1. HENTER VERDIER: Forteller Obsidian hva som skal vises i ALLÈ input-feltene.
   */
  override getControlValue(key: string): unknown {
    const settings = this.plugin.settings;

    // Sjekk for standard kjerne-toggles
    if (key === "targetTags" || key === "getFromInlineField" || key === "activateSnippet" || key === "enableEditor" || key === "enableTabHeader" || key === "enableFileList" || key === "enableBacklinks" || key === "enableQuickSwitcher" || key === "enableSuggestor") {
      return (settings as unknown as Record<string, unknown>)[key];
    }

    // Håndterer de dynamiske nøklene for stilreglene (f.eks: scl_fontStyle_abcd-1234)
    if (key.startsWith("scl_")) {
      const [, prop, uid] = key.split("_");
      const selector = settings.selectors.find((s) => s.uid === uid);
      
      // 🚀 FIKSET: Åpnet portvakten for fontWeight og fontStyle i getControlValue
      if (selector && typeof prop === "string" && (
        prop === "type" || 
        prop === "name" || 
        prop === "value" || 
        prop === "iconBefore" || 
        prop === "iconAfter" || 
        prop === "lightColor" || 
        prop === "darkColor" ||
        prop === "fontWeight" || 
        prop === "fontStyle"    
      )) {
        return (selector as unknown as Record<string, unknown>)[prop];
      }
    }

    return undefined;
  }
  override getSettingDefinitions(): SettingDefinitionItem[] {
    const existingRuleItems: MyGroupItems[] = []; 
    const selectors = this.plugin.settings.selectors || [];

    selectors.forEach((selector, index) => {
      const isEditing = this.activeEditUid === selector.uid;
      let previewText = "";

      // Bygg HTML-forhåndsvisningen for raden
      if (selector.type === 'tag') {
        previewText = `<span class="data-link-icon data-link-text data-link-icon-after" data-link-tags="${selector.value}">Note</span> has tag <a class="tag">#${selector.value || "empty"}</a>`;
      } else if (selector.type === 'attribute') {
        previewText = `<span class="data-link-icon data-link-text data-link-icon-after" data-link-${selector.name}="${selector.value}">Note</span> has attribute <b>${selector.name || "empty"}</b> with value <b>${selector.value || "empty"}</b>`;
      } else {
        previewText = `The path of the <span class="data-link-icon data-link-text data-link-icon-after" data-link-path="${selector.value}">note</span> matches <b>${selector.value || "empty"}</b>`;
      }

      existingRuleItems.push({
        render: (setting: Setting) => {
          setting.nameEl.innerHTML = previewText;
          setting.settingEl.addClass("scl-clickable-row");

          if (isEditing) {
            setting.settingEl.addClass("is-active");
          }

          setting.settingEl.addEventListener("click", (e) => {
            const target = e.target as HTMLElement;
            if (target.closest(".clickable-icon") || target.closest("button") || target.closest(".scl-color-dot")) {
              return;
            }
            this.activeEditUid = isEditing ? null : selector.uid;
            this.update(); 
          });

          if (setting.controlEl) {
            const lightDot = setting.controlEl.createEl("span", { cls: "scl-color-dot" });
            lightDot.style.setProperty("--scl-dot-color", selector.lightColor || "var(--text-muted)");
            lightDot.style.backgroundColor = "var(--scl-dot-color)";
            lightDot.title = `Light mode farge: ${selector.lightColor || "ikke satt"}`;

            const darkDot = setting.controlEl.createEl("span", { cls: "scl-color-dot is-dark" });
            darkDot.style.setProperty("--scl-dot-color", selector.darkColor || "var(--text-muted)");
            darkDot.style.backgroundColor = "var(--scl-dot-color)";
            darkDot.title = `Dark mode farge: ${selector.darkColor || "ikke satt"}`;
          }

          setting.addButton(btn => btn
            .setIcon("arrow-down")
            .setTooltip("Flytt ned")
            .setDisabled(index === selectors.length - 1)
            .onClick(async () => {
              const next = selectors[index + 1];
              if (next) { selectors[index + 1] = selector; selectors[index] = next; await this.plugin.saveSettings(); this.update(); }
            })
          );

          setting.addButton(btn => btn
            .setIcon("arrow-up")
            .setTooltip("Flytt opp")
            .setDisabled(index === 0)
            .onClick(async () => {
              const prev = selectors[index - 1];
              if (prev) { selectors[index - 1] = selector; selectors[index] = prev; await this.plugin.saveSettings(); this.update(); }
            })
          );
        }
      });

      if (isEditing) {
        existingRuleItems.push(
          {
            name: "Match Target Type",
            desc: "Velg om du vil matche på tag, attributt eller filbane.",
            control: {
              type: "dropdown",
              key: `scl_type_${selector.uid}`,
              options: { tag: "Tag", attribute: "Attribute", path: "Note Path" }
            }
          }
        );

        if (selector.type === "attribute") {
          existingRuleItems.push({
            name: "Key name (only for attributes)",
            desc: "The YAML property key name.",
            control: { type: "text", key: `scl_name_${selector.uid}`, placeholder: "status" }
          });
        }

        existingRuleItems.push(
          {
            name: "Value to match",
            desc: "The tag name or attribute value to trigger styling.",
            control: { type: "text", key: `scl_value_${selector.uid}`, placeholder: "todo" }
          },
          {
            name: "Prepend Icon",
            desc: "Emoji/Text BEFORE link.",
            control: { type: "text", key: `scl_iconBefore_${selector.uid}`, placeholder: "" }
          },
          {
            name: "Append Icon",
            desc: "Emoji/Text AFTER link.",
            control: { type: "text", key: `scl_iconAfter_${selector.uid}`, placeholder: "" }
          },
          // Dropdown for Font Weight
          {
            render: (setting: Setting) => {
              setting.setName("Font Weight");
              setting.setDesc("Velg hvor kraftig eller tynn lenketeksten skal være.");
              setting.addDropdown(dc => dc
                .addOptions({ 
                  "normal": "Normal", 
                  "lighter": "Tynn (Lighter)", 
                  "bold": "Kraftig (Bold)" 
                })
                .setValue(selector.fontWeight || "normal")
                // 🚀 FIKSET: Rut endringen gjennom den overordnede setControlValue-kanalen!
                .onChange(async (value) => {
                  await this.setControlValue(`scl_fontWeight_${selector.uid}`, value);
                })
              );
            }
          },
          // Dropdown for Font Style (Inkludert Overstrøket!)
          {
            render: (setting: Setting) => {
              setting.setName("Font Style");
              setting.setDesc("Velg visuell stil på teksten (Kursiv, Understreket eller Overstrøket).");
              setting.addDropdown(dc => dc
                .addOptions({ 
                  "normal": "Normal", 
                  "italic": "Kursiv (Italic)", 
                  "underline": "Understreket",
                  "line-through": "Overstrøket" 
                })
                .setValue(selector.fontStyle || "normal")
                // 🚀 FIKSET: Rut endringen gjennom setControlValue
                .onChange(async (value) => {
                  await this.setControlValue(`scl_fontStyle_${selector.uid}`, value);
                })
              );
            }
          },
          {
            name: "Light Mode Color",
            desc: "Choose color for white theme.",
            control: { type: "color", key: `scl_lightColor_${selector.uid}` }
          },
          {
            name: "Dark Mode Color",
            desc: "Choose color for dark theme.",
            control: { type: "color", key: `scl_darkColor_${selector.uid}` }
          },
          {
            name: "Slett regel",
            desc: "Fjern denne stilregel-malen permanent.",
            render: (setting: Setting) => {
              setting.addButton(btn => btn
                .setButtonText("Slett")
                .setClass("scl-delete-btn-standard") 
                .onClick(async () => {
                  selectors.splice(index, 1);
                  if (this.activeEditUid === selector.uid) this.activeEditUid = null;
                  await this.plugin.saveSettings();
                  await this._generateSnippet();
                  this.update();
                })
              );
            }
          }
        );
      }
    });
    // ---- TRINN 2: SETT SAMMEN DET ENDELIGE SKJEMAET I GRUPPER ----
    const definitions: SettingDefinitionItem[] = [];

    if (existingRuleItems.length > 0) {
      definitions.push({
        type: "group",
        heading: "Link Styling Rules",
        items: existingRuleItems as unknown as SettingGroupItem<string>[]
      });
    }

    // Knappen for å opprette nye regler
    definitions.push({
      type: "group",
      heading: "NEW rules",
      items: [
        {
          name: "Create a new style rule",
          desc: "Adds a template selector to your setup.",
          action: () => {
            const newSelector = new CSSLink();
            newSelector.type = "tag";
            newSelector.value = "new-tag";
            this.plugin.settings.selectors.push(newSelector);
            void this.plugin.saveSettings();
            this.activeEditUid = newSelector.uid; 
            this.update();
          }
        },
      ]
    });

    // Avansert-side (Skjult på en felles page helt i bunnen)
    definitions.push({
      type: "group",
      heading: "Advanced Settings Overview",
      items: [
        {
          type: "page",
          name: "Advanced Settings",
          desc: "Click here to configure parsing triggers, plugin integrations and display panels.",
          items: [
            {
              type: "group",
              heading: "General",
              items: [
                { name: "Parse all tags in the file", desc: "Look for tags both in frontmatter and inline.", control: { type: "toggle", key: "targetTags" } },
                { name: "Automatically activate CSS snippet", desc: "Enable 'supercharged-links-gen.css' automatically.", control: { type: "toggle", key: "activateSnippet" } }
              ]
            },
            {
              type: "group",
              heading: "Where to Supercharge",
              items: [
                { name: "Enable in Editor", desc: "Supercharge links inside Live Preview.", control: { type: "toggle", key: "enableEditor" } },
                { name: "Enable in Tab Headers", desc: "Supercharge file names inside workspace tab headers.", control: { type: "toggle", key: "enableTabHeader" } },
                { name: "Enable in Plugins & Panels", desc: "Supercharge links inside Backlinks and Outgoing links panels.", control: { type: "toggle", key: "enableBacklinks" } }
              ]
            },
            {
              type: "group",
              heading: "Display panels",
              items: [
                { name: "Activate in File Browser", desc: "Supercharge elements in file explorer.", control: { type: "toggle", key: "enableFileList" } },
                { name: "Activate in Quick Switcher", desc: "Supercharge in quick switcher.", control: { type: "toggle", key: "enableQuickSwitcher" } },
                { name: "Activate in Link Autocompleter", desc: "Supercharge in the [[ dropdown-menu.", control: { type: "toggle", key: "enableSuggestor" } }
              ]
            },
            {
              type: "group",
              heading: "Experimental data sources",
              items: [
                { name: "Search for attributes in Inline fields", desc: "Turn on support for Dataview-style inline fields (<field::>).", control: { type: "toggle", key: "getFromInlineField" } }
              ]
            }
          ]
        }
      ]
    });

    return definitions;
  }

  // 🚀 TYPESAFE LAGRING OG ØYEBLIKKELIG SKJEMA-OPPDATERING
  override async setControlValue(key: string, value: unknown): Promise<void> {
    const settings = this.plugin.settings;

    if (key.startsWith("scl_")) {
      const [, prop, uid] = key.split("_");
      const selector = settings.selectors.find((s) => s.uid === uid);
      
      // 🚀 FIKSET: Portvakten slipper nå også igjennom prop === "fontWeight" og "fontStyle"!
      if (selector && typeof prop === "string" && (
        prop === "type" || 
        prop === "name" || 
        prop === "value" || 
        prop === "iconBefore" || 
        prop === "prop" || // Bevar eksisterende sjekker
        prop === "iconAfter" || 
        prop === "lightColor" || 
        prop === "darkColor" ||
        prop === "fontWeight" || 
        prop === "fontStyle"   
      )) {
        (selector as any)[prop] = value; 
      }
    } else {
      (settings as unknown as Record<string, unknown>)[key] = value;
    }

    await this.plugin.saveSettings();
    this.debouncedGenerate(); // Bygg ny CSS
    this.update(); // Gjenbygg grensesnittet
  }
}
