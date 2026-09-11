import { Setting, SettingDefinitionItem } from "obsidian";
import { CSSLink } from "../../types/css-link";
import { buildUnifiedColorRow } from "./color-row-factory";

type MyGroupItems = SettingDefinitionItem | { render: (setting: Setting) => void };

function row(render: (setting: Setting) => void): MyGroupItems { return { render }; }
function setRowClass(setting: Setting, cls: string): void { setting.settingEl.className = `setting-item ${cls}`; }

// 🔑 LØSNINGEN: Et frittstående grensesnitt i stedet for direkte import av klassen.
// Dette kutter sirkulære avhengigheter tvert av og sikrer at CodeMirror-temaet laster perfekt!
export interface ISCLSettingTab {
	plugin: any;
	app: any;
	activeEditUid: string | null;
	setControlValue(key: string, value: unknown, silent?: boolean): Promise<void>;
	update(): void;
	compilePaneStyles(): void;
}

/**
 * 🚀 SIRKEL-FRI RAD-FABRIKK: Henter alt den trenger fra grensesnittet uten import-kollisjoner.
 */
export function getRuleDetailItems(
	tab: ISCLSettingTab, 
	selector: CSSLink,
	index: number,
	selectors: CSSLink[]
): MyGroupItems[] {
	const rows: MyGroupItems[] = [];

	// Match Target Type Row
	rows.push(row((setting) => {
		setRowClass(setting, "scl-detail-row scl-row-type");
		setting.setName("Match Target Type").setDesc("Select target metadata type.");
		setting.addDropdown((d) => {
			d.addOption("tag", "Tag").addOption("attribute", "Attribute").addOption("path", "Note Path").setValue(selector.type || "tag");
			d.onChange(async (v) => { 
				if (v === "tag" || v === "attribute" || v === "path") { 
					await tab.setControlValue(`scl_type_${selector.uid}`, v, true); 
					tab.update(); 
				} 
			});
		});
	}));

	// Attribute Key Name Row
	if (selector.type === "attribute") {
		rows.push(row((setting) => {
			setRowClass(setting, "scl-detail-row scl-row-attrname");
			setting.setName("Key name (attributes only)").setDesc("Frontmatter key to read.");
			setting.addText((t) => t.setPlaceholder("status").setValue(selector.name || "").onChange(async (v) => { 
				await tab.setControlValue(`scl_name_${selector.uid}`, v, true); 
				tab.update(); 
			}));
		}));
	}

	// Keyword Value Row
	rows.push(row((setting) => {
		setRowClass(setting, "scl-detail-row scl-row-value");
		setting.setName("Value to match").setDesc("Trigger keyword.");
		setting.addText((t) => t.setPlaceholder("todo").setValue(selector.value || "").onChange(async (v) => { 
			await tab.setControlValue(`scl_value_${selector.uid}`, v, true); 
			tab.update(); 
		}));
	}));

	// Prepend Icon Row
	rows.push(row((setting) => {
		setRowClass(setting, "scl-detail-row scl-row-iconbefore");
		setting.setName("Prepend Icon").setDesc("Icon to inject before link text.");
		setting.addText((t) => t.setValue(selector.iconBefore || "").onChange(async (v) => { 
			await tab.setControlValue(`scl_iconBefore_${selector.uid}`, v, true); 
			tab.compilePaneStyles(); 
		}));
	}));

	// Append Icon Row
	rows.push(row((setting) => {
		setRowClass(setting, "scl-detail-row scl-row-iconafter");
		setting.setName("Append Icon").setDesc("Icon to inject after link text.");
		setting.addText((t) => t.setValue(selector.iconAfter || "").onChange(async (v) => { 
			await tab.setControlValue(`scl_iconAfter_${selector.uid}`, v, true); 
			tab.compilePaneStyles(); 
		}));
	}));

	// Font Weight Row
	rows.push(row((setting) => {
		setRowClass(setting, "scl-detail-row scl-row-weight");
		setting.setName("Font Weight").setDesc("Choose font weight.");
		setting.addDropdown((d) => { 
			d.addOption("normal", "Normal").addOption("lighter", "Lighter").addOption("bold", "Bold").setValue(selector.fontWeight || "normal"); 
			d.onChange(async (v) => { 
				await tab.setControlValue(`scl_fontWeight_${selector.uid}`, v, true); 
				tab.compilePaneStyles(); 
			}); 
		});
	}));

	// Font Style / Text Decoration Row
	rows.push(row((setting) => {
		setRowClass(setting, "scl-detail-row scl-row-style");
		setting.setName("Font Style").setDesc("Choose text decoration.");
		setting.addDropdown((d) => { 
			d.addOption("normal", "Normal").addOption("italic", "Italic").addOption("underline", "Underline").addOption("line-through", "Strikethrough").setValue(selector.fontStyle || "normal"); 
			d.onChange(async (v) => { 
				await tab.setControlValue(`scl_fontStyle_${selector.uid}`, v, true); 
				tab.compilePaneStyles(); 
			}); 
		});
	}));

	// Light Color Picker Row
	rows.push(row((setting) => {
		setRowClass(setting, "mod-toggle scl-color-row scl-text-picker-row scl-row-lightcolor");
		setting.setName("Light Mode Color").setDesc("Text color for light theme.");
		buildUnifiedColorRow({ 
			setting, 
			plugin: tab.plugin, 
			selector, 
			propKey: 'lightColor', 
			modeName: "Light mode",
			fallbackColor: "#ffffff", 
			isBackground: false, 
			setControlValue: tab.setControlValue.bind(tab), 
			refreshUI: () => { tab.update(); tab.compilePaneStyles(); } 
		});
	}));

	// Dark Color Picker Row
	rows.push(row((setting) => {
		setRowClass(setting, "mod-toggle scl-color-row scl-text-picker-row scl-row-darkcolor");
		setting.setName("Dark Mode Color").setDesc("Text color for dark theme.");
		buildUnifiedColorRow({ 
			setting, 
			plugin: tab.plugin, 
			selector, 
			propKey: 'darkColor', 
			modeName: "Dark mode",
			fallbackColor: "#000000", 
			isBackground: false, 
			setControlValue: tab.setControlValue.bind(tab), 
			refreshUI: () => { tab.update(); tab.compilePaneStyles(); } 
		});
	}));

	// Light Background Picker Row
	rows.push(row((setting) => {
		setRowClass(setting, "mod-toggle scl-color-row scl-bg-picker-row scl-row-lightbg");
		setting.setName("Light Mode Background").setDesc("Background color for light theme.");
		buildUnifiedColorRow({ 
			setting, 
			plugin: tab.plugin, 
			selector, 
			propKey: 'lightBgColor', 
			modeName: "Light mode",
			fallbackColor: "#ffffff", 
			isBackground: true, 
			setControlValue: tab.setControlValue.bind(tab), 
			refreshUI: () => { tab.update(); tab.compilePaneStyles(); } 
		});
	}));

	// Dark Background Picker Row
	rows.push(row((setting) => {
		setRowClass(setting, "mod-toggle scl-color-row scl-bg-picker-row scl-row-darkbg");
		setting.setName("Dark Mode Background").setDesc("Background color for dark theme.");
		buildUnifiedColorRow({ 
			setting, 
			plugin: tab.plugin, 
			selector, 
			propKey: 'darkBgColor', 
			modeName: "Dark mode",
			fallbackColor: "#1e1e1e", 
			isBackground: true, 
			setControlValue: tab.setControlValue.bind(tab), 
			refreshUI: () => { tab.update(); tab.compilePaneStyles(); } 
		});
	}));

	// Delete Style Row
	rows.push(row((setting) => {
		setRowClass(setting, "scl-detail-row scl-row-delete");
		setting.setName("Delete style").setDesc("Permanently remove this style rule.");
		setting.addButton((btn) => { 
			btn.setIcon("trash").setTooltip("Delete style").onClick(async () => { 
				selectors.splice(index, 1); 
				if (tab.activeEditUid === selector.uid) tab.update(); 
				tab.plugin.compileActiveAttributes(); 
				await tab.plugin.saveSettings(); 
				
				// Direkte synkrone oppdateringer
				tab.compilePaneStyles();
				tab.update(); 
			}); 
			btn.buttonEl.addClass("mod-warning"); 
		});
	}));

	return rows;
}
