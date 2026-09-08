import { CSSLink } from "./types/css-link";

export interface SCLSettings {
	targetTags: boolean;
	getFromInlineField: boolean;
	activateSnippet: boolean;
	enableEditor: boolean;
	enableTabHeader: boolean;
	enableFileList: boolean;
	enableBacklinks: boolean;
	enableQuickSwitcher: boolean;
	enableSuggestor: boolean;
	enableBases: boolean;
	enableTagChips: boolean; // ny
	selectors: CSSLink[];
}

export const DEFAULT_SETTINGS: SCLSettings = {
	targetTags: true,
	getFromInlineField: false,
	enableTabHeader: true,
	activateSnippet: true,
	enableEditor: true,
	enableFileList: true,
	enableBacklinks: true,
	enableQuickSwitcher: true,
	enableSuggestor: true,
	enableBases: true,
	enableTagChips: true,
	selectors: []
}