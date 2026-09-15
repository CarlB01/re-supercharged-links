import { CSSLink } from "../types/css-link";

export interface SCLSettings {
	getFromInlineField: boolean; // Om Dataview inline-field skal leses
	enableTagChips: boolean;     // Stilering av a.tag-brikker
	selectors: CSSLink[];        // Brukerens stilregler
}

export const DEFAULT_SETTINGS: SCLSettings = {
	getFromInlineField: false,
	enableTagChips: true,
	selectors: []
};
