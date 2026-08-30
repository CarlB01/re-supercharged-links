export type MatchTypes = 'exact' | 'contains' | 'startswith' | 'endswith' | 'whiteSpace';
export type SelectorTypes = 'attribute' | 'tag' | 'path';

export interface CSSLink {
    type: SelectorTypes;
    name: string;
    value: string;
    matchCaseSensitive: boolean;
    match: MatchTypes;
    uid: string;
    
    // De 4 egenskapene du bryr deg om:
    iconBefore: string;
    iconAfter: string;
    fontWeight: "normal" | "lighter" | "bold";
    fontStyle: "normal" | "italic" | "underline" | "line-through";
    lightColor: string;
    darkColor: string;
}

export const matchSign: Record<MatchTypes, string> = {
    'exact': "",
    'contains': "*",
    'startswith': "^",
    'endswith': "$",
    'whiteSpace': "~"
};

export const matchPreview: Record<MatchTypes, string> = {
    'exact': "with value",
    'contains': "containing",
    'whiteSpace': "containing",
    'startswith': "starting with",
    'endswith': "ending with"
};

export const matchPreviewPath: Record<MatchTypes, string> = {
    'exact': "is",
    'contains': "contains",
    'whiteSpace': "contains",
    'startswith': "starts with",
    'endswith': "ends with"
};

export const selectorType: Record<SelectorTypes, string> = {
    'attribute': 'Attribute value',
    'tag': 'Tag',
    'path': 'Note path'
};

export const matchTypes: Record<MatchTypes, string> = {
    'exact': "Exact match",
    'contains': "Contains value",
    'whiteSpace': "Value within whitespace separated words",
    'startswith': "Starts with this value",
    'endswith': "Ends with this value"
};

export class CSSLink {
    constructor() {
        this.type = 'tag';
        this.name = "";
        this.value = "";
        this.matchCaseSensitive = false;
        this.match = "exact";
        
        let s4 = () => Math.floor((1 + Math.random()) * 0x10000).toString(16).substring(1);
        this.uid = s4() + "-" + s4();
        
        // Standardverdier for dine nye kjerne-funksjoner:
        this.iconBefore = "";
        this.iconAfter = "";
        this.fontStyle = "normal";
        this.lightColor = "#aa0000"; // Mørkere rød for hvit bakgrunn
        this.darkColor = "#ff5555";  // Klar rød for mørk bakgrunn
    }
}
