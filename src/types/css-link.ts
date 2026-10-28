export type MatchTypes = 'exact' | 'contains' | 'startswith' | 'endswith' | 'whiteSpace';
export type SelectorTypes = 'attribute' | 'tag' | 'path';

/**
 * 🚀 UNIFIED ENGINE DATA MODEL (FLYWEIGHT COMPLIANT)
 * Represents a single, structurally isolated user-defined styling rule blueprint.
 * Strictly avoids internal undefined leaks by anchoring initial states to concrete fallbacks.
 */
export class CSSLink {
  public uid: string;
  public type: SelectorTypes;
  public name: string;
  public value: string;
  public match: MatchTypes;
  public matchCaseSensitive: boolean;
  
  // Core styling token definitions
  public iconBefore: string;
  public iconAfter: string;
  public fontWeight: "normal" | "lighter" | "bold";
  public fontStyle: "normal" | "italic" | "underline" | "line-through";
  public lightColor: string;
  public darkColor: string;
  public lightBgColor: string;
  public darkBgColor: string;

  // 🔥 FLYWEIGHT RUNTIME IDENTIFIERS:
  // Pre-allocated structural slots to bypass dynamic string mappings in layout sweeps.
  public _flyweightIdLight: number = 0;
  public _flyweightIdDark: number = 0;

  constructor() {
      this.type = 'tag';
      this.name = "";
      this.value = "";
      this.matchCaseSensitive = false;
      this.match = "exact";
      
      this.uid = this.generateId();
      
      this.iconBefore = "";
      this.iconAfter = "";
      this.fontWeight = "normal";
      this.fontStyle = "normal";
      
      this.lightColor = "#aa0000"; 
      this.darkColor = "#ff5555";  
      
      this.lightBgColor = "transparent";
      this.darkBgColor = "transparent";
  }

  private generateId(): string {
    const s4 = (): string => Math.floor((1 + Math.random()) * 0x10000).toString(16).substring(1);
    return `${s4()}${s4()}-${s4()}`;
  }
}
