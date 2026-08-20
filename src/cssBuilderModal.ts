import { Modal, Setting } from "obsidian";
import { CSSLink, matchPreview, matchPreviewPath, MatchTypes, matchTypes, selectorType, SelectorTypes } from "./cssLink";
import RechargedSuperchargedLinks from "./main";
import { SCLSettings } from "./Settings";
import { processKey } from "./linkAttributes";

/**
 * Genererer en forklarende HTML-tekst eller feilmelding som viser en 
 * forhåndsvisning av den valgte lenke-regelen i pluginets innstillinger.
 * 
 * @param link - Det gjeldende regel-objektet (tag, attributt eller path)
 * @param settings - Pluginets globale innstillinger
 * @returns En streng med HTML-kode som skal vises i brukergrensesnittet
 */
export function displayText(link: CSSLink, settings: SCLSettings): string {
    
    // SJEKK 1: Hvis regelen gjelder for en TAG (#tag)
    if (link.type === 'tag') {
        // Hvis brukeren ikke har skrevet inn navnet på taggen ennå, vis en advarsel
        if (!link.value) {
            return "<b>Please choose a tag</b>";
        }
        // Returnerer en forhåndsvisning av en lenke (Note) dekorert med riktig tag-attributt,
        // samt navnet på taggen slik den ser ut i Obsidian.
        return `<span class="data-link-icon data-link-text data-link-icon-after" data-link-tags="${link.value}">Note</span> has tag <a class="tag">#${link.value}</a>`;
    }
    
    // SJEKK 2: Hvis regelen gjelder for en ATTRIBUTT (f.eks. Frontmatter/YAML-egenskap)
    else if (link.type === 'attribute') {
        // Validering: Sjekker om brukeren i det hele tatt har definert noen "Mål-attributter" i hovedinnstillingene
        if (settings.targetAttributes.length === 0) {
            return `<b>No attributes added to "Target attributes". Go to plugin settings to add them.</b>`
        }
        // Validering: Sjekker om brukeren har glemt å velge hvilket attributt-navn (f.eks. 'status') regelen gjelder
        if (!link.name) {
            return "<b>Please choose an attribute name.</b>";
        }
        // Validering: Sjekker om brukeren har glemt å skrive inn verdien attributtet skal ha (f.eks. 'done')
        if (!link.value){
            return "<b>Please choose an attribute value.</b>"
        }
        // Returnerer en forhåndsvisning. replace(/-/g, ' ') gjør at bindestreker i attributtnavnet 
        // vises som vanlige mellomrom i teksten. matchPreview viser operatøren (f.eks "er lik", "starter med").
        return `<span class="data-link-icon data-link-text data-link-icon-after" data-link-${link.name}="${link.value}">Note</span> has attribute <b>${link.name.replace(/-/g, ' ')}</b> ${matchPreview[link.match]} <b>${link.value}</b>.`;
    }
    
    // SJEKK 3: Hvis koden kommer hit, betyr det at regelen gjelder for en FILBANE (path)
    // Validering: Sjekker om brukeren har glemt å skrive inn filbanen (mappenavn eller filnavn)
    if (!link.value) {
        // (Merk: Her mangler det en semikolon på slutten av linjen i den originale koden din, men JavaScript godtar det)
        return "<b>Please choose a path.</b>"
    }
    // Returnerer en forhåndsvisning for filbane-matching (f.eks. "The path of the note starts with 01_Projects")
    return `The path of the <span class="data-link-icon data-link-text data-link-icon-after" data-link-path="${link.value}">note</span> ${matchPreviewPath[link.match]} <b>${link.value}</b>`
}

/**
 * Oppdaterer HTML-innholdet i et tekstfelt med en forhåndsvisning, 
 * og sjekker om regelen er ufullstendig (slik at knapper kan deaktiveres).
 * 
 * @param textArea - HTML-elementet hvor forhåndsvisningsteksten skal settes inn
 * @param link - Det gjeldende regel-objektet som redigeres
 * @param settings - Pluginets globale innstillinger
 * @returns `true` hvis regelen mangler data (er ugyldig), ellers `false`
 */
export function updateDisplay(textArea: HTMLElement, link: CSSLink, settings: SCLSettings): boolean {
    // 1. Henter HTML-teksten (forhåndsvisningen eller feilmeldingen) fra displayText-funksjonen
    let toDisplay: string = displayText(link, settings);
    
    // 2. Oppretter en variabel som holder styr på om lagringsknappen skal deaktiveres.
    // Den starter som 'false' (alt i orden).
    let disabled = false;
    
    // 3. SJEKK FOR TAG-REGLER
    if (link.type === 'tag') {
        // Hvis tag-navnet er tomt, er regelen ugyldig
        if (!link.value) {
            disabled = true;
        }
    }
    // 4. SJEKK FOR ATTRIBUTT-REGLER
    else if (link.type === 'attribute') {
        // Hvis listen over gyldige attributter i pluginet er tom
        if (settings.targetAttributes.length === 0) {
            disabled = true;
        }
        // Eller hvis brukeren ikke har valgt et attributt-navn ennå
        else if (!link.name) {
            disabled = true;
        }
        // Eller hvis brukeren ikke har skrevet inn en attributt-verdi ennå
        else if (!link.value){
            disabled = true;
        }
    }
    // 5. SJEKK FOR FILBANE-REGLER (path)
    else {
        // Hvis filbanen er tom, er regelen ugyldig
        if (!link.value) {
            disabled = true;
        }
    }
    
    // 6. Setter den genererte teksten direkte inn i HTML-elementet på skjermen
    textArea.innerHTML = toDisplay;
    
    // 7. Returnerer statusen. Slik vet koden som kalte denne funksjonen om den skal låse/låse opp knapper.
    return disabled;
}

/**
 * Dette er en Modal-klasse (CSSBuilderModal). 
 * I Obsidian er en modal et popup-vindu som legger seg over resten av grensesnittet.
 * Denne spesifikke modalen fungerer som en skjermveiviser (wizard) der brukeren konfigurerer en ny regel
 *  for å style lenker. Den lar brukeren:
 * Velge type velger (Tag, Attributt, eller Filbane).
 * Dynamisk endre hvilke skjemafelter som vises (f.eks. skjule "Attributtnavn" hvis man velger Tag).
 * Velge avanserte innstillinger som "Case sensitive" (skille mellom store/små bokstaver) 
 * og samsvarslogikk (nøyaktig lik, inneholder, etc.).Huke av for hvilke CSS-egenskaper som skal genereres 
 * (farge på tekst, tekst før/etter, eller bakgrunn).
 * Se en live forhåndsvisning i bunnen som oppdateres hver gang brukeren gjør en endring.
 * Koden bruker Obsidians innebygde Setting-API for å bygge nedtrekksmenyer (dropdowns), 
 * tekstbokser og brytere (toggles).
 */
class CSSBuilderModal extends Modal {
    // 🚀 Bruk 'declare' for å fortelle TypeScript at disse egenskapene arves trygt via Obsidian uten å krasje konstruktøren
    declare plugin: RechargedSuperchargedLinks;
    declare cssLink: CSSLink;
    declare saveCallback: (cssLink: CSSLink) => void;

    // Konstruktør: Kjøres når modalen opprettes (f.eks. `new CSSBuilderModal(...)`)
    // Tillater eksplisitt 'null' som standardverdi hvis man lager en helt ny regel fra bunnen av
    constructor(plugin: RechargedSuperchargedLinks, saveCallback: (cssLink: CSSLink) => void, cssLink: CSSLink | null = null) {
        super(plugin.app); // Initialiserer Obsidians standard modal-applikasjon
        
        this.plugin = plugin;
        this.saveCallback = saveCallback;
        
        // SIKKERHETSSJEKK: Hvis det ikke ble sendt inn en eksisterende lenke-regel,
        // oppretter vi et helt nytt, tomt CSSLink-objekt.
        if (!cssLink) {
            this.cssLink = new CSSLink();
        } else {
            this.cssLink = cssLink; // Hvis en regel ble sendt med, redigerer vi den eksisterende
        }
    }

    // onOpen kjøres automatisk i det øyeblikket modalen spretter opp på skjermen
    onOpen() {
        this.titleEl.setText(`Select what links to style!`); // Setter tittelen øverst i vinduet

        // Tekst- og plassholder-variabler som brukes dynamisk basert på hva brukeren velger
        const matchAttrPlaceholder = "Attribute value to match.";
        const matchTagPlaceholder = "Note tag to match (without #).";
        const matchPathPlaceholder = "File path to match.";
        const matchAttrTxt = "Attribute value";
        const matchTagTxt = "Tag";
        const matchPathTxt = "Path";

        const cssLink = this.cssLink;
        const plugin = this.plugin;

        // Legger til en CSS-klasse på modalen for stylingformål
        this.contentEl.addClass("supercharged-modal");

        // --- FELT 1: TYPE SELEKTOR (Nedtrekksmeny) ---
        new Setting(this.contentEl)
            .setName("Type of selector")
            .setDesc("Attributes selects YAML and DataView attributes, tags chooses the tags of a note, and path considers the name of the note including in what folder it is.")
            .addDropdown(dc => {
                // Går gjennom alle tilgjengelige selektortyper (attribute, tag, path) og legger dem til i menyen
                (Object.keys(selectorType) as (keyof typeof selectorType)[]).forEach((type) => {
                    dc.addOption(type, selectorType[type]);
                    if (type === this.cssLink.type) {
                        dc.setValue(type); // Setter gjeldende verdi som valgt i menyen
                    }
                });
                
                // Hva skjer når brukeren bytter type (f.eks fra Tag til Path)
                dc.onChange((value: string) => {
                    if (value === 'attribute' || value === 'tag' || value === 'path') {
                        const type = value as SelectorTypes;
                        cssLink.type = type;
                        updateContainer(cssLink.type); // Skjul/vis relevante felter basert på det nye valget
                        // Oppdaterer live-forhåndsvisningen og deaktiverer lagringsknappen om skjemaet ble ugyldig
                        saveButton.setDisabled(updateDisplay(preview, this.cssLink, this.plugin.settings));
                    }
                });
            });

        // --- FELT 2: ATTRIBUTTNAVN (Nedtrekksmeny - vises kun for 'attribute') ---
        const attrName = new Setting(this.contentEl)
            .setName("Attribute name")
            .setDesc("What attribute to target? Make sure to first add target attributes to the settings at the top!")
            .addDropdown(dc => {
                // Henter listen over godkjente attributter fra plugin-innstillingene dine
                plugin.settings.targetAttributes.forEach((attribute: string) => {
                    const dom_attribute = processKey(attribute);
                    dc.addOption(dom_attribute, attribute);
                    if (dom_attribute === cssLink.name) {
                        dc.setValue(dom_attribute);
                    }
                });
                dc.onChange(name => {
                    cssLink.name = name; // Lagrer valgt attributtnavn
                    saveButton.setDisabled(updateDisplay(preview, cssLink, plugin.settings));
                });
            });


        // --- FELT 3: VERDI SOM SKAL MATCHES (Tekstfelt) ---
        const attrValue = new Setting(this.contentEl)
            .setName("Value to match")
            .setDesc("TODO")
            .addText(t => {
                t.setValue(cssLink.value); // Setter eksisterende tekst (hvis aktuelt)
                t.onChange(value => {
                    cssLink.value = value; // Oppdaterer verdien fortløpende når brukeren skriver
                    saveButton.setDisabled(updateDisplay(preview, cssLink, plugin.settings));
                });
            });

        // Lager en visuell overskrift for avanserte innstillinger
        this.contentEl.createEl('h4', {text: 'Advanced'});

        // --- FELT 4: MATCHING-TYPE (Nedtrekksmeny - f.eks "Exact", "Contains") ---
        const matchingType = new Setting(this.contentEl)
            .setName("Matching type")
            .setDesc("How to compare the attribute or path with the given value.")
            .addDropdown(dc => {
                (Object.keys(matchTypes) as (keyof typeof matchTypes)[]).forEach((key) => {
                    dc.addOption(key, matchTypes[key]);
                    if (key == cssLink.match) {
                        dc.setValue(key);
                    }
                });
                dc.onChange((value: string) => {
                    if (value in matchTypes) {
                        cssLink.match = value as "exact" | "contains" | "startswith" | "endswith";
                        saveButton.setDisabled(updateDisplay(preview, cssLink, plugin.settings));
                    }
                });
            });

        // --- FELT 5: CASE SENSITIVE (Av/på-bryter) ---
        const caseSensitiveTogglerContainer = new Setting(this.contentEl)
            .setName("Case sensitive matching")
            .setDesc("Should the matching of the value be case sensitive?")
            .addToggle(b => {
                b.setValue(cssLink.matchCaseSensitive);
                b.onChange(value => {
                    cssLink.matchCaseSensitive = value;
                    b.setDisabled(updateDisplay(preview, cssLink, plugin.settings));
                });
            });

        // Hvis regelen mangler navn, men pluginet har tilgjengelige målattributter, velg automatisk det første i listen
        if (!this.cssLink.name && this.plugin.settings.targetAttributes.length > 0) {
            const firstAttribute = this.plugin.settings.targetAttributes[0];
            if (!this.cssLink.name && firstAttribute !== undefined) {
                this.cssLink.name = firstAttribute;
            }
        }

        /**
         * HJELPEFUNKSJON: Skjuler eller viser felter dynamisk i modalen 
         * basert på om brukeren valgte 'attribute', 'tag' eller 'path'.
         */
        const updateContainer = function(type: SelectorTypes) {
            if (type === 'attribute') {
                attrName.settingEl.show(); // Vis attributtnavn-nedtrekk
                attrValue.nameEl.setText(matchAttrTxt); // "Attribute value"
                attrValue.descEl.setText(matchAttrPlaceholder);
                matchingType.settingEl.show();
                caseSensitiveTogglerContainer.settingEl.show();
            }
            else if (type === 'tag') {
                attrName.settingEl.hide(); // Skjul attributtnavn, tag trenger ikke dette
                attrValue.nameEl.setText(matchTagTxt); // "Tag"
                attrValue.descEl.setText(matchTagPlaceholder);
                matchingType.settingEl.hide(); // Skjul avansert matching (tags bruker alltid inneholder/stjerne-match)
                caseSensitiveTogglerContainer.settingEl.hide();
            }
            else { // Hvis det er en 'path' (filbane)
                attrName.settingEl.hide(); // Skjul attributtnavn
                attrValue.nameEl.setText(matchPathTxt); // "Path"
                attrValue.descEl.setText(matchPathPlaceholder);
                matchingType.settingEl.show();
                caseSensitiveTogglerContainer.settingEl.show();
            }
        };

        // --- FELT 6: STILVALG (Fire av/på-brytere på samme linje) ---
        new Setting(this.contentEl)
            .setName("Style options")
            .setDesc("What styling options are active? Disabling options you won't use can improve performance slightly.")
            .addToggle(t => {
                t.onChange(value => { cssLink.selectText = value; });
                t.setValue(cssLink.selectText);
                t.setTooltip("Style link text"); // Tekstfarge
            })
            .addToggle(t => {
                t.onChange(value => { cssLink.selectPrepend = value; });
                t.setValue(cssLink.selectPrepend);
                t.setTooltip("Add content before link"); // Ikon/tekst foran
            })
            .addToggle(t => {
                t.onChange(value => { cssLink.selectAppend = value; });
                t.setValue(cssLink.selectAppend);
                t.setTooltip("Add content after link"); // Ikon/tekst bak
            })
            .addToggle(t => {
                t.onChange(value => { cssLink.selectBackground = value; });
                t.setValue(cssLink.selectBackground);
                t.setTooltip("Add optional background or underline to link"); // Bakgrunnsfarge
            });

        // Setter opp resultat-/forhåndsvisningsseksjonen helt i bunnen
        this.contentEl.createEl('h4', {text: 'Result'});
        const modal = this;

        // --- LAGRINGSKNAPP OG FORHÅNDSVISNING ---
        // Oppretter en ny innstillingsrad i bunnen av modalen
        const saveButton = new Setting(this.contentEl)
            .setName("Preview") // Setter en midlertidig tekst (denne overskrives av updateDisplay)
            .setDesc("")        // Holdes tom fordi beskrivelsesfeltet ikke trengs her
            .addButton(b => {
                b.setButtonText("Save") // Setter teksten på selve knappen
                b.onClick(() => {
                    // Når knappen klikkes: Send det oppdaterte cssLink-objektet tilbake til lagringsrutinen
                    modal.saveCallback(cssLink);
                    // Lukk modal-vinduet
                    modal.close();
                });
            });

        // 🚀 SMART TRYKK: Vi bruker HTML-elementet til knappens "navn" (nameEl) 
        // som plattform for å tegne den levende HTML-forhåndsvisningen vår!
        const preview = saveButton.nameEl;

        // Kjører funksjonen som skjuler/viser riktige input-felter basert på om 
        // denne regelen er satt til 'tag', 'attribute' eller 'path' ved åpning.
        updateContainer(cssLink.type);

        // Kjører updateDisplay for å tegne den første forhåndsvisningen i 'preview'-elementet.
        // updateDisplay returnerer 'true' hvis obligatoriske felter mangler, 
        // og dette brukes direkte til å deaktivere (setDisabled) Save-knappen.
        saveButton.setDisabled(updateDisplay(preview, this.cssLink, this.plugin.settings));
    } // Avslutter onOpen()
} // Avslutter klassen CSSBuilderModal


export { CSSBuilderModal }