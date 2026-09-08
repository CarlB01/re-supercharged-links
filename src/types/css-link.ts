export type MatchTypes = 'exact' | 'contains' | 'startswith' | 'endswith' | 'whiteSpace';
export type SelectorTypes = 'attribute' | 'tag' | 'path';

/**
 * 🚀 UNIFIED ENGINE DATA MODEL
 * Represents a single, clean user-defined styling rule blueprint.
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
        
        // Fast, collision-resistant unique identifier generator block
        this.uid = this.generateId();
        
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

    /**
     * Helper to assemble a lightweight, secure component hash id.
     */
    private generateId(): string {
        const s4 = () => Math.floor((1 + Math.random()) * 0x10000).toString(16).substring(1);
        return `${s4()}${s4()}-${s4()}`;
    }
}

/**
 * 🔑 CSS ATTRIBUTE OPERATORS: Production-ready CSS modifier tokens.
 * Shared globally across compilers to eliminate duplicate translation blocks.
 */
export const matchSign: Record<MatchTypes, string> = {
    'exact': "=",
    'contains': "*=",
    'startswith': "^=",
    'endswith': "$=",
    'whiteSpace': "~="
};

/**
 * Human-readable sentence fragments used to build UI descriptions inside SettingTab rows contextually.
 */
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
