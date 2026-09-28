// settings/settings-constants

/**
 * 🔒 EDITABLE BLUEPRINT PROPERTIES
 * Registry of properties allowed to be dynamically updated inside the rule configurations channel.
 */
export const EDITABLE_PROPERTIES: readonly string[] = [
	"type", "name", "value", "iconBefore", "iconAfter", 
	"lightColor", "darkColor", "lightBgColor", "darkBgColor", 
	"fontWeight", "fontStyle"
];

/**
 * 🎨 DROP-DOWN SELECTION DICTIONARIES
 * Static human-readable token definitions used across configuration selectors contextually.
 */
export const DROPDOWN_OPTIONS = {
	type: {
		tag: "Tag",
		attribute: "Attribute",
		path: "Note Path"
	},
	fontWeight: {
		normal: "Normal",
		lighter: "Lighter",
		bold: "Bold"
	},
	fontStyle: {
		normal: "Normal",
		italic: "Italic",
		underline: "Underline",
		"line-through": "Strikethrough"
	}
} as const;

/**
 * 📊 COLOR PICKER BLUEPRINT MATRIX
 * Explicit parameters mapping core layout configurations directly to their contextual color pickers.
 */
export const COLOR_ROW_CONFIGS = [
	{ key: 'lightColor', cls: 'scl-row-lightcolor', name: 'Light Mode Color', desc: 'Text color for light theme.', isBg: false, fallback: '#ffffff' },
	{ key: 'darkColor', cls: 'scl-row-darkcolor', name: 'Dark Mode Color', desc: 'Text color for dark theme.', isBg: false, fallback: '#000000' },
	{ key: 'lightBgColor', cls: 'scl-row-lightbg', name: 'Light Mode Background', desc: 'Background color for light theme.', isBg: true, fallback: '#ffffff' },
	{ key: 'darkBgColor', cls: 'scl-row-darkbg', name: 'Dark Mode Background', desc: 'Background color for dark theme.', isBg: true, fallback: '#1e1e1e' }
] as const;
