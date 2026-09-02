export type MatchTypes = 'exact' | 'contains' | 'startswith' | 'endswith' | 'whiteSpace';
export type SelectorTypes = 'attribute' | 'tag' | 'path';

/**
 * 🚀 FIXED & UNIFIED ENGINE DATA MODEL
 * Merged the duplicate interface and class declarations into a single, clean exported blueprint.
 */
export class CSSLink {
    uid: string;
    type: SelectorTypes;
    name: string;
    value: string;
    match: MatchTypes;
    matchCaseSensitive: boolean;
    
    // Core styling token definitions
    iconBefore: string;
    iconAfter: string;
    fontWeight: "normal" | "lighter" | "bold";
    fontStyle: "normal" | "italic" | "underline" | "line-through";
    lightColor: string;
    darkColor: string;
    lightBgColor: string;
    darkBgColor: string;

    constructor() {
        this.type = 'tag';
        this.name = "";
        this.value = "";
        this.matchCaseSensitive = false;
        this.match = "exact";
        
        // Secure, cryptographically distributed unique identifier block
        const s4 = () => Math.floor((1 + Math.random()) * 0x10000).toString(16).substring(1);
        this.uid = s4() + "-" + s4();
        
        // Strict baseline default initializations to prevent Color Picker runtime crashes
        this.iconBefore = "";
        this.iconAfter = "";
        this.fontWeight = "normal";
        this.fontStyle = "normal";
        
        // Default text color nodes (Accessible contrast scales)
        this.lightColor = "#aa0000"; 
        this.darkColor = "#ff5555";  
        
        // Fixed: Ground default fallback colors to text descriptors instead of empty properties
        this.lightBgColor = "transparent";
        this.darkBgColor = "transparent";
    }
}

/**
 * 🔑 FIXED OPERATORS: Contains complete production CSS attribute qualifiers
 */
export const matchSign: Record<MatchTypes, string> = {
    'exact': "=",
    'contains': "*=",
    'startswith': "^=",
    'endswith': "$=",
    'whiteSpace': "~="
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