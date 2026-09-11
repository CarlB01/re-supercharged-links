import { Setting, SettingDefinitionItem, App } from "obsidian";
import { CSSLink } from "../../types/css-link";
import { buildUnifiedColorRow } from "./color-row-factory";
import ResuperchargedLinks from "../../main";

type MyGroupItems = SettingDefinitionItem | { render: (setting: Setting) => void };

export interface ISCLSettingTab {
	plugin: ResuperchargedLinks;
	app: App;
	activeEditUid: string | null;
	setControlValue(key: string, value: unknown, silent?: boolean): Promise<void>;
	update(): void;
	containerEl: HTMLElement;
	compilePaneStyles(): void; 
}

/**
 * 🛠️ INTERN PREFAB-FABRIKK
 */
function createDetailRow(
	cls: string,
	name: string,
	desc: string,
	buildControl: (setting: Setting) => void
): MyGroupItems {
	return {
		render: (setting: Setting) => {
			setting.settingEl.className = `setting-item ${cls}`;
			setting.setName(name).setDesc(desc);
			buildControl(setting);
		}
	};
}

export function getRuleDetailItems(
	tab: ISCLSettingTab, 
	selector: CSSLink,
	index: number,
	selectors: CSSLink[]
): MyGroupItems[] {
	const rows: MyGroupItems[] = [];
	const triggerStylesUpdate = () => tab.compilePaneStyles();

	// 1. Match Target Type Row
	rows.push(createDetailRow("scl-detail-row scl-row-type", "Match Target Type", "Select target metadata type.", (setting) => {
		setting.addDropdown((d) => {
			d.addOption("tag", "Tag")
			 .addOption("attribute", "Attribute")
			 .addOption("path", "Note Path")
			 .setValue(selector.type || "tag"); // 🛡️ Beskyttelse mot undefined fallbacks
			d.onChange(async (v) => { 
				if (v === "tag" || v === "attribute" || v === "path") { 
					await tab.setControlValue(`scl_type_${selector.uid}`, v, true); 
					tab.update(); 
				} 
			});
		});
	}));

	// 2. Attribute Key Name Row (Kun synlig hvis typen er attribute)
	if (selector.type === "attribute") {
		rows.push(createDetailRow("scl-detail-row scl-row-attrname", "Key name (attributes only)", "Frontmatter key to read.", (setting) => {
			setting.addText((t) => t.setPlaceholder("status").setValue(selector.name || "").onChange(async (v) => { 
				await tab.setControlValue(`scl_name_${selector.uid}`, v, true); 
				tab.update(); 
			}));
		}));
	}

	// 3. Keyword Value Row
	rows.push(createDetailRow("scl-detail-row scl-row-value", "Value to match", "Trigger keyword.", (setting) => {
		setting.addText((t) => t.setPlaceholder("todo").setValue(selector.value || "").onChange(async (v) => { 
			await tab.setControlValue(`scl_value_${selector.uid}`, v, true); 
			tab.update(); 
		}));
	}));

	// 4. Prepend Icon Row
	rows.push(createDetailRow("scl-detail-row scl-row-iconbefore", "Prepend Icon", "Icon to inject before link text.", (setting) => {
		setting.addText((t) => t.setValue(selector.iconBefore || "").onChange(async (v) => { 
			await tab.setControlValue(`scl_iconBefore_${selector.uid}`, v, true); 
			triggerStylesUpdate(); 
		}));
	}));

	// 5. Append Icon Row
	rows.push(createDetailRow("scl-detail-row scl-row-iconafter", "Append Icon", "Icon to inject after link text.", (setting) => {
		setting.addText((t) => t.setValue(selector.iconAfter || "").onChange(async (v) => { 
			await tab.setControlValue(`scl_iconAfter_${selector.uid}`, v, true); 
			triggerStylesUpdate(); 
		}));
	}));

	// 6. Font Weight Row
	rows.push(createDetailRow("scl-detail-row scl-row-weight", "Font Weight", "Choose font weight.", (setting) => {
		setting.addDropdown((d) => { 
			d.addOption("normal", "Normal")
			 .addOption("lighter", "Lighter")
			 .addOption("bold", "Bold")
			 .setValue(selector.fontWeight || "normal"); 
			d.onChange(async (v) => { 
				if (v === "normal" || v === "lighter" || v === "bold") {
					await tab.setControlValue(`scl_fontWeight_${selector.uid}`, v, true); 
					triggerStylesUpdate(); 
				}
			}); 
		});
	}));

	// 7. Font Style / Text Decoration Row
	rows.push(createDetailRow("scl-detail-row scl-row-style", "Font Style", "Choose text decoration.", (setting) => {
		setting.addDropdown((d) => { 
			d.addOption("normal", "Normal")
			 .addOption("italic", "Italic")
			 .addOption("underline", "Underline")
			 .addOption("line-through", "Strikethrough")
			 .setValue(selector.fontStyle || "normal"); 
			d.onChange(async (v) => { 
				if (v === "normal" || v === "italic" || v === "underline" || v === "line-through") {
					await tab.setControlValue(`scl_fontStyle_${selector.uid}`, v, true); 
					triggerStylesUpdate(); 
				}
			}); 
		});
	}));

	// Slank parameter-matrise for fargevelgere
	const colorConfigs = [
		{ key: 'lightColor', cls: 'scl-row-lightcolor', name: 'Light Mode Color', desc: 'Text color for light theme.', isBg: false, fallback: '#ffffff' },
		{ key: 'darkColor', cls: 'scl-row-darkcolor', name: 'Dark Mode Color', desc: 'Text color for dark theme.', isBg: false, fallback: '#000000' },
		{ key: 'lightBgColor', cls: 'scl-row-lightbg', name: 'Light Mode Background', desc: 'Background color for light theme.', isBg: true, fallback: '#ffffff' },
		{ key: 'darkBgColor', cls: 'scl-row-darkbg', name: 'Dark Mode Background', desc: 'Background color for dark theme.', isBg: true, fallback: '#1e1e1e' }
	] as const;

	// 8, 9, 10, 11. Generer fargerader med garanterte fallbacks mot undefined
	for (const c of colorConfigs) {
		const pickerClass = c.isBg ? "scl-bg-picker-row" : "scl-text-picker-row";
		rows.push(createDetailRow(`mod-toggle scl-color-row ${pickerClass} ${c.cls}`, c.name, c.desc, (setting) => {
			buildUnifiedColorRow({ 
				setting, 
				plugin: tab.plugin, 
				selector, 
				propKey: c.key, 
				modeName: c.name.replace(" Color", "").replace(" Background", "") + " mode",
				fallbackColor: c.fallback, 
				isBackground: c.isBg, 
				setControlValue: tab.setControlValue.bind(tab), 
				refreshUI: () => { tab.update(); triggerStylesUpdate(); } 
			});
		}));
	}

	// 12. Delete Style Row
	rows.push(createDetailRow("scl-detail-row scl-row-delete", "Delete style", "Permanently remove this style rule.", (setting) => {
		setting.addButton((btn) => { 
			btn.setIcon("trash").setTooltip("Delete style").onClick(async () => { 
				selectors.splice(index, 1); 
				if (tab.activeEditUid === selector.uid) tab.update(); 
				tab.plugin.compileActiveAttributes(); 
				await tab.plugin.saveSettings(); 
				triggerStylesUpdate();
				tab.update(); 
			}); 
			btn.buttonEl.addClass("mod-warning"); 
		});
	}));

	return rows;
}
