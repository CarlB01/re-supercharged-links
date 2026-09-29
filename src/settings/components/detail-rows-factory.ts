import { Setting, SettingDefinitionItem, App } from "obsidian";
import { CSSLink } from "../../types/css-link";
import { buildUnifiedColorRow, clearColorHistory } from "./color-row-factory";
import { updateVisibleLinks } from "../../processors/dom-reconciler";
import ResuperchargedLinks from "../../core/main";
import { DROPDOWN_OPTIONS, COLOR_ROW_CONFIGS } from "../settings-constants";

type MyGroupItems = SettingDefinitionItem | { render: (setting: Setting) => void };


export interface ISCLSettingTab {
	plugin: ResuperchargedLinks;
	app: App;
	activeEditIndex: number | null;
	setControlValue(key: string, value: unknown, silent?: boolean): void | Promise<void>;
	update(): void;
	containerEl: HTMLElement;
	compilePaneStyles(): void; 
}

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

/**
 * Generates expanded sub-form control rows for a selected style rule.
 * 🔑 KEYBOARD IMMUNITY UPGRADE: Text inputs now save silently without triggering full UI redraws.
 * This completely banishes input freezing and cursor focus loss bugs.
 */
export function getRuleDetailItems(
	tab: ISCLSettingTab, 
	selector: CSSLink,
	index: number,
	selectors: CSSLink[]
): MyGroupItems[] {
	const rows: MyGroupItems[] = [];
	const triggerStylesUpdate = () => tab.compilePaneStyles();

	const applySilent = async (propName: string, value: string): Promise<void> => {
		await tab.setControlValue(`scl_${propName}_${index}`, value, true);
		triggerStylesUpdate();
	};

	const applyLoud = async (propName: string, value: string): Promise<void> => {
		await tab.setControlValue(`scl_${propName}_${index}`, value, false);
		tab.update(); // Enforces full structural UI redraws for layout-shifting keys like 'type'
	};


	// 1. Target Type Dropdown:
	rows.push(createDetailRow("scl-detail-row scl-row-type", "Match Target Type", "Select target metadata type.", (setting) => {
		setting.addDropdown((d) => {
			for (const [optKey, optVal] of Object.entries(DROPDOWN_OPTIONS.type)) {
				d.addOption(optKey, optVal);
			}
			d.setValue(selector.type || "tag");
			d.onChange(async (v) => { 
				if (v === "tag" || v === "attribute" || v === "path") { 
					await applyLoud("type", v);
				} 
			});
		});
	}));

	// 2. Attribute Key Name Row (Only visible if type is attribute)
	if (selector.type === "attribute") {
		rows.push(createDetailRow("scl-detail-row scl-row-attrname", "Key name (attributes only)", "Frontmatter key to read.", (setting) => {
			setting.addText((t) => t.setPlaceholder("status").setValue(selector.name || "").onChange(async (v) => { 
				await applySilent("name", v);
			}));
		}));
	}

	// 3. Keyword Value Row
	const currentType: string = selector.type ?? "tag";
	const placeholderValue: string = (() => {
		if (currentType === "tag") return "todo";
		if (currentType === "attribute") return "active-value";
		if (currentType === "path") return "folder/note-name";
		return "keyword";
	})();

	rows.push(createDetailRow("scl-detail-row scl-row-value", "Value to match", "Trigger keyword.", (setting) => {
		setting.addText((t) => t
			.setPlaceholder(placeholderValue)
			.setValue(selector.value || "")
			.onChange(async (v: string) => { 
				await applySilent("value", v);
			})
		);
	}));

	// 4. Prepend Icon Row
	rows.push(createDetailRow("scl-detail-row scl-row-iconbefore", "Prepend Icon", "Icon to inject before link text.", (setting) => {
		setting.addText((t) => t.setValue(selector.iconBefore || "").onChange(async (v) => { 
			await applySilent("iconBefore", v);
		}));
	}));

	// 5. Append Icon Row
	rows.push(createDetailRow("scl-detail-row scl-row-iconafter", "Append Icon", "Icon to inject after link text.", (setting) => {
		setting.addText((t) => t.setValue(selector.iconAfter || "").onChange(async (v) => { 
			await applySilent("iconAfter", v);
		}));
	}));

	// 6. Font Weight Row (Dropdowns are safe to refresh silently)
	rows.push(createDetailRow("scl-detail-row scl-row-weight", "Font Weight", "Choose font weight.", (setting) => {
		setting.addDropdown((d) => { 
			for (const [optKey, optVal] of Object.entries(DROPDOWN_OPTIONS.fontWeight)) {
				d.addOption(optKey, optVal);
			}
			d.setValue(selector.fontWeight || "normal"); 
			d.onChange(async (v) => { 
				if (v === "normal" || v === "lighter" || v === "bold") {
					await applySilent("fontWeight", v);
				}
			}); 
		});
	}));

	// 7. Font Style / Text Decoration Row
	rows.push(createDetailRow("scl-detail-row scl-row-style", "Font Style", "Choose text decoration.", (setting) => {
		setting.addDropdown((d) => { 
			for (const [optKey, optVal] of Object.entries(DROPDOWN_OPTIONS.fontStyle)) {
				d.addOption(optKey, optVal);
			}
			d.setValue(selector.fontStyle || "normal"); 
			d.onChange(async (v) => { 
				if (v === "normal" || v === "italic" || v === "underline" || v === "line-through") {
					await applySilent("fontStyle", v);
				}
			}); 
		});
	}));

	for (const c of COLOR_ROW_CONFIGS) {
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
				setControlValue: async (k, v, s) => { await tab.setControlValue(k, v, s); }, 
				refreshUI: () => { triggerStylesUpdate(); }, // 🔑 Only refresh preview styles contextually
				index 
			});
		}));
	}

	// 12. Delete Style Row
	rows.push(createDetailRow("scl-detail-row scl-row-delete", "Delete style", "Permanently remove this style rule.", (setting) => {
		setting.addButton((btn) => { 
			btn.setIcon("trash").setTooltip("Delete style").onClick(async () => { 
				clearColorHistory();
				selectors.splice(index, 1);

				if (tab.activeEditIndex === index) {
					tab.activeEditIndex = null;
				}

				tab.plugin.bumpRuleConfigVersion();
				tab.plugin.compileActiveAttributes();
				await tab.plugin.saveSettings();

				updateVisibleLinks(tab.app, tab.plugin);
				tab.plugin.refreshEditorThemes();

				triggerStylesUpdate();
				tab.update();
			}); 
			btn.buttonEl.addClass("mod-warning"); 
		});
	}));

	return rows;
}
