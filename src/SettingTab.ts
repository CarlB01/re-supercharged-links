import { App, debounce, PluginSettingTab, SettingDefinitionItem } from "obsidian";
import ResuperchargedLinks from "./main";
import { updateVisibleLinks } from "./linkAttributes";
import { buildCSS } from "./cssBuilder";
import { CSSLink } from "./cssLink";

export default class SCLSettingTab extends PluginSettingTab {
  plugin: ResuperchargedLinks;
  private readonly debouncedGenerate: () => void;

  constructor(app: App, plugin: ResuperchargedLinks) {
    super(app, plugin);
    this.plugin = plugin;

    // Debounce genereringen for å hindre lag når brukeren skriver inn farger/ikoner
    this.debouncedGenerate = debounce(
      () => { void this._generateSnippet(); },
      300,
      true
    );
    
    void this._generateSnippet();
  }

  private async _generateSnippet() {
    await buildCSS(this.plugin.settings.selectors, this.plugin);
    updateVisibleLinks(this.app, this.plugin);
  }

  /**
   * 1. HENTER VERDIER: Forteller Obsidian hva som skal vises i input-feltene.
   * Siden reglene våre genereres dynamisk, må vi parse ut nøklene her.
   */
  override getControlValue(key: string): unknown {
    const settings = this.plugin.settings;

    if (key === "targetAttributes") {
      return settings.targetAttributes.join(', ');
    }
    if (key === "targetTags" || key === "getFromInlineField" || key === "activateSnippet" || key === "enableEditor" || key === "enableTabHeader" || key === "enableFileList" || key === "enableBacklinks" || key === "enableQuickSwitcher" || key === "enableSuggestor") {
			return (settings as unknown as Record<string, unknown>)[key];
		}

		// Håndterer dynamiske nøkler (f.eks: scl_lightColor_abcd-1234)
		if (key.startsWith("scl_")) {
			const [, prop, uid] = key.split("_");
			const selector = settings.selectors.find(s => s.uid === uid);
			if (selector && prop) {
				// 🚀 FIKSET: Gå via unknown for å tillate dynamisk indeks-oppslag
				return (selector as unknown as Record<string, unknown>)[prop];
			}
		}
    return undefined;
  }

  /**
   * 2. DEKLARATIVT SKJEMA: Definerer hele brukergrensesnittet uten HTML-koding!
   */
  override getSettingDefinitions(): SettingDefinitionItem[] {
    const definitions: SettingDefinitionItem[] = [
      {
        type: "group",
        heading: "Metadata & Data Sources",
        items: [
          {
            name: "Target Attributes for styling",
            desc: "Frontmatter attributes to target, comma separated.",
            control: { type: "textarea", key: "targetAttributes", placeholder: "status, project, priority", rows: 4 }
          },
          {
            name: "Parse all tags in the file",
            desc: "Look for tags both in the frontmatter properties and inline (#tag) inside the text body.",
            control: { type: "toggle", key: "targetTags" }
          },
          {
            name: "Search for attributes in Inline fields",
            desc: "Enable support for Dataview-style inline fields (<field::>).",
            control: { type: "toggle", key: "getFromInlineField" }
          }
        ]
      },
      {
        type: "group",
        heading: "Where to Supercharge",
        items: [
          { name: "Enable in Editor", desc: "Supercharge links inside Live Preview.", control: { type: "toggle", key: "enableEditor" } },
          { name: "Enable in Tab Headers", desc: "Supercharge file names inside workspace tab headers.", control: { type: "toggle", key: "enableTabHeader" } },
          { name: "Enable in File Browser", desc: "Supercharge items in the native File Explorer pane.", control: { type: "toggle", key: "enableFileList" } },
          { name: "Enable in Plugins & Panels", desc: "Supercharge links inside Backlinks and Outgoing links panels.", control: { type: "toggle", key: "enableBacklinks" } },
          { name: "Enable in Quick Switcher", desc: "Supercharge inside the built-in Quick Switcher.", control: { type: "toggle", key: "enableQuickSwitcher" } },
          { name: "Enable in Link Autocompleter", desc: "Supercharge suggestions inside the autocompleter dropdown.", control: { type: "toggle", key: "enableSuggestor" } }
        ]
      },
      {
        type: "group",
        heading: "Advanced Configuration",
        items: [
          {
            name: "Automatically activate CSS snippet",
            desc: "Automatically register and enable 'supercharged-links-gen.css' inside Obsidian.",
            control: { type: "toggle", key: "activateSnippet" }
          },
          {
            name: "Create a new style rule",
            desc: "Adds a template selector to your setup.",
            action: () => {
              const newSelector = new CSSLink();
              // Gi den noen gjenkjennbare standardverdier for utfylling
              newSelector.type = "tag";
              newSelector.value = "new-tag";
              this.plugin.settings.selectors.push(newSelector);
              void this.plugin.saveSettings();
              this.update(); // Tvinger Obsidian til å tegne opp taben på nytt med de nye feltene
            }
          }
        ]
      }
    ];

// GENERER DYNAMISKE STIL-REGLER:
    const sclItems: SettingDefinitionItem[] = [];
    const selectors = this.plugin.settings.selectors || [];

    selectors.forEach((selector, index) => {
      const ruleTitle = `Rule #${index + 1} (${selector.type.toUpperCase()}: ${selector.value || "empty"})`;

      sclItems.push(
        {
          name: ruleTitle,
          control: { type: "heading", level: 4 }
        },
        {
          name: "Match Target Type",
          desc: "Choose whether to match on tag, attribute, or path.",
          control: {
            type: "select",
            key: `scl_type_${selector.uid}`,
            options: [
              { value: "tag", label: "Tag" },
              { value: "attribute", label: "Attribute" },
              { value: "path", label: "Note Path" }
            ]
          }
        },
        {
          name: "Key name (only for attributes)",
          desc: "The YAML property key name.",
          control: { type: "text", key: `scl_name_${selector.uid}`, placeholder: "status" }
        },
        {
          name: "Value to match",
          desc: "The tag name or attribute value to trigger styling.",
          control: { type: "text", key: `scl_value_${selector.uid}`, placeholder: "todo" }
        },
        {
          name: "Prepend Icon",
          desc: "Emoji/Text BEFORE link.",
          control: { type: "text", key: `scl_iconBefore_${selector.uid}`, placeholder: "📅" }
        },
        {
          name: "Append Icon",
          desc: "Emoji/Text AFTER link.",
          control: { type: "text", key: `scl_iconAfter_${selector.uid}`, placeholder: "❗" }
        },
        {
          name: "Light Mode Color",
          desc: "Hex code for white theme.",
          control: { type: "text", key: `scl_lightColor_${selector.uid}` }
        },
        {
          name: "Dark Mode Color",
          desc: "Hex code for dark theme.",
          control: { type: "text", key: `scl_darkColor_${selector.uid}` }
        },
        {
          name: "Delete Rule",
          desc: "Permanently remove this styling rule.",
          action: () => {
            this.plugin.settings.selectors.splice(index, 1);
            void this.plugin.saveSettings();
            this.update(); // Re-render taben
          }
        }
      );
    });

    if (sclItems.length > 0) {
      definitions.push({
        type: "group",
        heading: "Link Styling Rules",
        items: sclItems
      });
    }

    return definitions;
  }

  /**
   * 3. LAGRER VERDIER: Fanger opp når brukeren endrer noe i UI-en.
   */
  override async setControlValue(key: string, value: unknown): Promise<void> {
    const settings = this.plugin.settings;

    if (key === "targetAttributes") {
      const str = typeof value === "string" ? value : "";
      settings.targetAttributes = str.split(',').map(attr => attr.trim()).filter(Boolean);
    } else if (key.startsWith("scl_")) {
      // Håndterer endringer i de dynamiske reglene
      const [, prop, uid] = key.split("_");
      const selector = settings.selectors.find(s => s.uid === uid);
      if (selector && prop) {
        (selector as unknown as Record<string, unknown>)[prop] = value;
      }
    } else {
      // Standard kjerne-toggles
      (settings as unknown as Record<string, unknown>)[key] = value;
    }

    await this.plugin.saveSettings();
    this.debouncedGenerate(); // Trigger CSS snippet bygging asynkront
  }
}
