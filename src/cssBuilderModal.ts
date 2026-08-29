import { Modal, Setting } from "obsidian";
import { CSSLink, matchPreview, matchPreviewPath, SelectorTypes, selectorType, matchTypes, MatchTypes } from "./cssLink";
import ResuperchargedLinks from "./main";
import { processKey } from "./linkAttributes";

export function displayText(link: CSSLink, settings: any): string {
    if (link.type === 'tag') {
        if (!link.value) return "<b>Please choose a tag</b>";
        return `<span class="data-link-icon data-link-text data-link-icon-after" data-link-tags="${link.value}">Note</span> has tag <a class="tag">#${link.value}</a>`;
    } else if (link.type === 'attribute') {
        if (settings.targetAttributes.length === 0) return `<b>No attributes added to "Target attributes".</b>`;
        if (!link.name) return "<b>Please choose an attribute name.</b>";
        if (!link.value) return "<b>Please choose an attribute value.</b>";
        return `<span class="data-link-icon data-link-text data-link-icon-after" data-link-${link.name}="${link.value}">Note</span> has attribute <b>${link.name.replace(/-/g, ' ')}</b> ${matchPreview[link.match]} <b>${link.value}</b>.`;
    }
    if (!link.value) return "<b>Please choose a path.</b>";
    return `The path of the <span class="data-link-icon data-link-text data-link-icon-after" data-link-path="${link.value}">note</span> ${matchPreviewPath[link.match]} <b>${link.value}</b>`;
}

export function updateDisplay(textArea: HTMLElement, link: CSSLink, settings: any): boolean {
    textArea.innerHTML = displayText(link, settings);
    if (link.type === 'tag') return !link.value;
    if (link.type === 'attribute') return settings.targetAttributes.length === 0 || !link.name || !link.value;
    return !link.value;
}

export class CSSBuilderModal extends Modal {
    declare plugin: ResuperchargedLinks;
    declare cssLink: CSSLink;
    declare saveCallback: (cssLink: CSSLink) => void;

    constructor(plugin: ResuperchargedLinks, saveCallback: (cssLink: CSSLink) => void, cssLink: CSSLink | null = null) {
        super(plugin.app);
        this.plugin = plugin;
        this.saveCallback = saveCallback;
        this.cssLink = cssLink ? cssLink : new CSSLink();
    }

    onOpen() {
        this.titleEl.setText(`Configure Link Styling`);
        const cssLink = this.cssLink;
        const plugin = this.plugin;
        this.contentEl.addClass("supercharged-modal");

    // --- SELEKTOR-TYPE ---
    new Setting(this.contentEl)
        .setName("Type of selector")
        .addDropdown(dc => {
            Object.keys(selectorType).forEach((type) => {
                dc.addOption(type, selectorType[type as SelectorTypes]);
                if (type === cssLink.type) dc.setValue(type);
            });
            
            // 🚀 FIKSET: Ta imot en 'string' og cast den trygt inni funksjonen
            dc.onChange((value: string) => {
                if (value === 'attribute' || value === 'tag' || value === 'path') {
                    const checkedType = value as SelectorTypes;
                    cssLink.type = checkedType;
                    updateContainer(checkedType);
                    saveButton.setDisabled(updateDisplay(preview, cssLink, plugin.settings));
                }
            });
        });

        // --- ATTRIBUTT-NAVN ---
        const attrName = new Setting(this.contentEl)
            .setName("Attribute name")
            .addDropdown(dc => {
                plugin.settings.targetAttributes.forEach((attribute: string) => {
                    const dom_attribute = processKey(attribute);
                    dc.addOption(dom_attribute, attribute);
                    if (dom_attribute === cssLink.name) dc.setValue(dom_attribute);
                });
                dc.onChange(name => {
                    cssLink.name = name;
                    saveButton.setDisabled(updateDisplay(preview, cssLink, plugin.settings));
                });
            });

        // --- VERDI SOM SKAL MATCHES ---
        const attrValue = new Setting(this.contentEl)
            .setName("Value to match")
            .addText(t => {
                t.setValue(cssLink.value);
                t.onChange(value => {
                    cssLink.value = value;
                    saveButton.setDisabled(updateDisplay(preview, cssLink, plugin.settings));
                });
            });

        this.contentEl.createEl('h4', { text: 'Advanced Matching' });

        // --- MATCHING TYPE ---
        const matchingType = new Setting(this.contentEl)
            .setName("Matching type")
            .addDropdown(dc => {
                // 🚀 FIKSET: Cast arrayet til MatchTypes[] i stedet for å caste selve nøkkelen til 'any'
                (Object.keys(matchTypes) as MatchTypes[]).forEach((key) => {
                    dc.addOption(key, matchTypes[key]); // Nå vet TypeScript at key er trygg!
                    if (key === cssLink.match) dc.setValue(key);
                });
                
                dc.onChange((value: string) => {
                    if (value === 'exact' || value === 'contains' || value === 'startswith' || value === 'endswith' || value === 'whiteSpace') {
                        cssLink.match = value as MatchTypes;
                        saveButton.setDisabled(updateDisplay(preview, cssLink, plugin.settings));
                    }
                });
            });

        // --- CASE SENSITIVE ---
        const caseSensitive = new Setting(this.contentEl)
            .setName("Case sensitive matching")
            .addToggle(b => {
                b.setValue(cssLink.matchCaseSensitive);
                b.onChange(value => {
                    cssLink.matchCaseSensitive = value;
                });
            });

        this.contentEl.createEl('h4', { text: 'Styling & Icons' });

        // --- IKON FØR / ETTER ---
        new Setting(this.contentEl)
            .setName("Prepend Icon / Text")
            .addText(t => t.setValue(cssLink.iconBefore).onChange(v => { cssLink.iconBefore = v; }));

        new Setting(this.contentEl)
            .setName("Append Icon / Text")
            .addText(t => t.setValue(cssLink.iconAfter).onChange(v => { cssLink.iconAfter = v; }));

        // --- FARGER (LIGHT & DARK MODE) ---
        new Setting(this.contentEl)
            .setName("Light Mode Color")
            .setDesc("Color used when Obsidian is in light mode")
            .addColorPicker(cp => cp.setValue(cssLink.lightColor).onChange(v => { cssLink.lightColor = v; }));

        new Setting(this.contentEl)
            .setName("Dark Mode Color")
            .setDesc("Color used when Obsidian is in dark mode")
            .addColorPicker(cp => cp.setValue(cssLink.darkColor).onChange(v => { cssLink.darkColor = v; }));

        // Auto-velg første attributt om tomt
        const firstAttribute = plugin.settings.targetAttributes[0];
        if (!cssLink.name && firstAttribute !== undefined) {
            cssLink.name = processKey(firstAttribute);
        }


        const updateContainer = (type: SelectorTypes) => {
            if (type === 'attribute') {
                attrName.settingEl.show();
                matchingType.settingEl.show();
                caseSensitive.settingEl.show();
            } else if (type === 'tag') {
                attrName.settingEl.hide();
                matchingType.settingEl.hide();
                caseSensitive.settingEl.hide();
            } else {
                attrName.settingEl.hide();
                matchingType.settingEl.show();
                caseSensitive.settingEl.show();
            }
        };

        this.contentEl.createEl('h4', { text: 'Result Preview' });
        const saveButton = new Setting(this.contentEl)
            .setName("Preview")
            .addButton(b => {
                b.setButtonText("Save").onClick(() => {
                    this.saveCallback(cssLink);
                    this.close();
                });
            });

        const preview = saveButton.nameEl;
        updateContainer(cssLink.type);
        saveButton.setDisabled(updateDisplay(preview, cssLink, plugin.settings));
    }
}
