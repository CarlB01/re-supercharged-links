// --- 1. TYPE-DEFINISJONER (TypeScript-kontroll) ---

// Definerer de lovlige måtene vi kan sammenligne verdier på i CSS (Sammenligningsmetoder)
export type MatchTypes = 'exact' | 'contains' | 'startswith' | 'endswith' | 'whiteSpace';

// Definerer de tre gyldige kategoriene en lenke-regel kan rettes mot
export type SelectorTypes = 'attribute' | 'tag' | 'path';

// Et "kart" (interface) som forteller TypeScript nøyaktig hvilke egenskaper en CSSLink skal ha
interface CSSLink {
    type: SelectorTypes       // 'attribute', 'tag' eller 'path'
    name: string              // Navnet på attributtet (f.eks 'status')
    value: string             // Verdien det søkes etter (f.eks 'done')
    matchCaseSensitive: boolean // Skal den skille mellom store/små bokstaver?
    match: MatchTypes         // Hvordan verdien skal matches (f.eks 'exact')
    uid: string               // En unik ID for akkurat denne regelen (f.eks '6a4f-8ecb')
    selectText: boolean       // Skal tekstfarge endres?
    selectBackground: boolean // Skal bakgrunnsfarge endres?
    selectAppend: boolean     // Skal det legges til tekst/ikon etter lenken?
    selectPrepend: boolean    // Skal det legges til tekst/ikon før lenken?
}


// --- 2. OPPSLAGSTABELLER FOR BRUKERGRENSNESNITTET (Menytekster og CSS-tegn) ---

// Kobler de tekniske MatchTypes-nøklene til fine titler i nedtrekksmenyen inne i Modalen
const matchTypes: Record<MatchTypes, string> = {
    'exact': "Exact match",
    'contains': "Contains value",
    'whiteSpace': "Value within whitespace separated words",
    'startswith': "Starts with this value",
    'endswith': "Ends with this value"
}

// Kobler sammenligningsmetoden til det faktiske tegnet som brukes i CSS-attributtselektorer.
// F.eks blir 'contains' til '*' som i CSS betyr `[data-link-tags*="verdi"]`
export const matchSign: Record<MatchTypes, string> = {
    'exact': "",          // Nøyaktig lik (ingen ekstra tegn i CSS)
    'contains': "*",      // Inneholder tegnsekvensen
    'startswith': "^",    // Starter med tegnsekvensen
    'endswith': "$",      // Ender med tegnsekvensen
    'whiteSpace': "~"     // Inneholder ordet i en mellomromsseparert liste
}

// Tekstbiter som brukes i displayText()-funksjonen for å bygge forhåndsvisningen for ATTRIBUTTER
export const matchPreview: Record<MatchTypes, string> = {
    'exact': "with value",
    'contains': "containing",
    'whiteSpace': "containing",
    'startswith': "starting with",
    'endswith': "ending with"
}

// Tekstbiter som brukes i displayText()-funksjonen for å bygge forhåndsvisningen for FILBANER (paths)
export const matchPreviewPath: Record<MatchTypes, string> = {
    'exact': "is",
    'contains': "contains",
    'whiteSpace': "contains",
    'startswith': "starts with",
    'endswith': "ends with"
}

// Kobler selektortypene til fine titler i hovedmenyen for valg av type
export const selectorType: Record<SelectorTypes, string> = {
    'attribute': 'Attribute value',
    'tag': 'Tag',
    'path': 'Note path'
}


// --- 3. KLASSE-IMPLEMENTASJON (Opprettelse av nye regler) ---

// Selve blueprinten (klassen) som kjører hver gang du lager en ny regel med `new CSSLink()`
class CSSLink {
    constructor() {
        // Setter standardverdier (defaults) for en helt ny regel:
        this.type = 'attribute';
        this.name = "";
        this.value = "";
        this.matchCaseSensitive = false;
        this.match = "exact";
        
        // En intern hjelpefunksjon som genererer et tilfeldig 4-tegns hex-tall (f.eks '6a4f')
        let s4 = () => {
            return Math.floor((1 + Math.random()) * 0x10000)
                .toString(16)
                .substring(1);
        }
        
        // Genererer en unik ID (UID) ved å slå sammen to 4-tegns strenger med bindestrek.
        // Dette gir formatet 'aaaa-aaaa' (f.eks '6a4f-8ecb').
        // (Kommentaren i den opprinnelige koden beskriver en lengre UUID, men koden lager 4+4 tegn).
        this.uid = s4() + "-" + s4();
        
        // Aktiverer alle stilvalg som standard for nye regler
        this.selectText = true;
        this.selectAppend = true;
        this.selectPrepend = true;
        this.selectBackground = true;
    }
}

// Eksporterer objektene slik at andre filer i pluginet kan bruke dem
export { matchTypes, CSSLink }
