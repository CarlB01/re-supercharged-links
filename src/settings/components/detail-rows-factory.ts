import { Setting, SettingDefinitionItem, App } from "obsidian";
import { CSSLink } from "../../types/css-link";
import { buildUnifiedColorRow } from "./color-row-factory";
import ResuperchargedLinks from "../../main";
import { updateVisibleLinks } from "../../views/view-invalidator";

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

	// 1. Match Target Type Row (Dropdowns are safe to refresh fully)
	rows.push(createDetailRow("scl-detail-row scl-row-type", "Match Target Type", "Select target metadata type.", (setting) => {
		setting.addDropdown((d) => {
			d.addOption("tag", "Tag")
			 .addOption("attribute", "Attribute")
			 .addOption("path", "Note Path")
			 .setValue(selector.type || "tag");
			d.onChange(async (v) => { 
				if (v === "tag" || v === "attribute" || v === "path") { 

					// Toggles UI structure, full update required here
					await tab.setControlValue(`scl_type_${index}`, v, false); 
					tab.update(); 
				} 
			});
		});
	}));

	// 2. Attribute Key Name Row (Only visible if type is attribute)
	if (selector.type === "attribute") {
		rows.push(createDetailRow("scl-detail-row scl-row-attrname", "Key name (attributes only)", "Frontmatter key to read.", (setting) => {
			setting.addText((t) => t.setPlaceholder("status").setValue(selector.name || "").onChange(async (v) => { 
				// 🔑 SILENT SAVE: Set silent=true so the UI doesn't redraw and break keyboard focus
				await tab.setControlValue(`scl_name_${index}`, v, true); 
				triggerStylesUpdate();
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
				// 🔑 SILENT SAVE: Keep cursor focus intact during active typing sessions
				await tab.setControlValue(`scl_value_${index}`, v, true); 
				triggerStylesUpdate(); 
			})
		);
	}));

	// 4. Prepend Icon Row
	rows.push(createDetailRow("scl-detail-row scl-row-iconbefore", "Prepend Icon", "Icon to inject before link text.", (setting) => {
		setting.addText((t) => t.setValue(selector.iconBefore || "").onChange(async (v) => { 
			await tab.setControlValue(`scl_iconBefore_${index}`, v, true); 
			triggerStylesUpdate(); 
		}));
	}));

	// 5. Append Icon Row
	rows.push(createDetailRow("scl-detail-row scl-row-iconafter", "Append Icon", "Icon to inject after link text.", (setting) => {
		setting.addText((t) => t.setValue(selector.iconAfter || "").onChange(async (v) => { 
			await tab.setControlValue(`scl_iconAfter_${index}`, v, true); 
			triggerStylesUpdate(); 
		}));
	}));

	// 6. Font Weight Row (Dropdowns are safe to refresh silently)
	rows.push(createDetailRow("scl-detail-row scl-row-weight", "Font Weight", "Choose font weight.", (setting) => {
		setting.addDropdown((d) => { 
			d.addOption("normal", "Normal")
			 .addOption("lighter", "Lighter")
			 .addOption("bold", "Bold")
			 .setValue(selector.fontWeight || "normal"); 
			d.onChange(async (v) => { 
				if (v === "normal" || v === "lighter" || v === "bold") {
					await tab.setControlValue(`scl_fontWeight_${index}`, v, true); 
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
					await tab.setControlValue(`scl_fontStyle_${index}`, v, true); 
					triggerStylesUpdate(); 
				}
			}); 
		});
	}));

	const colorConfigs = [
		{ key: 'lightColor', cls: 'scl-row-lightcolor', name: 'Light Mode Color', desc: 'Text color for light theme.', isBg: false, fallback: '#ffffff' },
		{ key: 'darkColor', cls: 'scl-row-darkcolor', name: 'Dark Mode Color', desc: 'Text color for dark theme.', isBg: false, fallback: '#000000' },
		{ key: 'lightBgColor', cls: 'scl-row-lightbg', name: 'Light Mode Background', desc: 'Background color for light theme.', isBg: true, fallback: '#ffffff' },
		{ key: 'darkBgColor', cls: 'scl-row-darkbg', name: 'Dark Mode Background', desc: 'Background color for dark theme.', isBg: true, fallback: '#1e1e1e' }
	] as const;

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
