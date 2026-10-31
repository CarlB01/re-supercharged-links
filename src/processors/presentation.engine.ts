import { FlyweightResponse } from "../core/flyweight-engine";

// En fast struktur som lever permanent i minnet og aldri kastes
export interface PreAllocatedPresentation {
	hasMatch: boolean;
	classesCount: number;
	stylesCount: number;
	readonly classes: string[];
	readonly styleKeys: string[];
	readonly styleValues: string[];
}

// Instansieres nøyaktig ÉN gang ved oppstart. Heap-forurensning = 0.
const SHARED_PRESENTATION_POOL: PreAllocatedPresentation = {
	hasMatch: false,
	classesCount: 0,
	stylesCount: 0,
	classes: new Array<string>(32).fill(""),       // Plass til maks 32 klasser per node
	styleKeys: new Array<string>(16).fill(""),     // Plass til maks 16 stiler per node
	styleValues: new Array<string>(16).fill("")
};

/**
 * Fyller opp den globale bufferen uten en eneste ny allokering på heapen.
 * V8 monomorf-optimalisert: Formene på arrayene endrer seg aldri.
 */
export function populatePresentationPool(
	resolution: FlyweightResponse,
	skipIconBefore = false,
	skipIconAfter = false
): PreAllocatedPresentation {
	const pool = SHARED_PRESENTATION_POOL;
	pool.hasMatch = resolution.hasMatch;
	pool.classesCount = 0;
	pool.stylesCount = 0;

	if (!resolution.hasMatch) {
		pool.classes[pool.classesCount++] = "data-link-text";
		pool.classes[pool.classesCount++] = "scl-hide-before";
		pool.classes[pool.classesCount++] = "scl-hide-after";
		return pool;
	}

	// 1. Basistekst-klasse
	pool.classes[pool.classesCount++] = "data-link-text";

	// 2. Fyll inn stiler lineært (unngår Object.keys og Object.create)
	const s = resolution.styles;
	if (s.color.length > 0) {
		pool.styleKeys[pool.stylesCount] = "--scl-color";
		pool.styleValues[pool.stylesCount++] = s.color;
		pool.styleKeys[pool.stylesCount] = "color";
		pool.styleValues[pool.stylesCount++] = s.color;
	}
	if (s.backgroundColor.length > 0 && s.backgroundColor !== "transparent") {
		pool.styleKeys[pool.stylesCount] = "--scl-bg";
		pool.styleValues[pool.stylesCount++] = s.backgroundColor;
		pool.styleKeys[pool.stylesCount] = "background-color";
		pool.styleValues[pool.stylesCount++] = s.backgroundColor;
	}

	// 3. Typografi
	if (s.fontWeight === "bold") pool.classes[pool.classesCount++] = "scl-weight-bold";
	if (s.fontWeight === "lighter") pool.classes[pool.classesCount++] = "scl-weight-lighter";

	const decosLen = s.decorations.length;
	for (let i = 0; i < decosLen; i++) {
		const dec = s.decorations[i];
		if (dec === "italic") pool.classes[pool.classesCount++] = "scl-style-italic";
		if (dec === "underline") pool.classes[pool.classesCount++] = "scl-decor-underline";
		if (dec === "line-through") pool.classes[pool.classesCount++] = "scl-decor-linethrough";
	}

	// 4. Ikoner med posisjonell sjekk
	if (s.iconBefore.length > 0 && !skipIconBefore) {
		pool.styleKeys[pool.stylesCount] = "--scl-icon-before";
		pool.styleValues[pool.stylesCount++] = `"${s.iconBefore}"`;
	} else {
		pool.classes[pool.classesCount++] = "scl-hide-before";
	}

	if (s.iconAfter.length > 0 && !skipIconAfter) {
		pool.styleKeys[pool.stylesCount] = "--scl-icon-after";
		pool.styleValues[pool.stylesCount++] = `"${s.iconAfter}"`;
	} else {
		pool.classes[pool.classesCount++] = "scl-hide-after";
	}

	// 5. Kompositt-klasser levert fra motoren
	const resClassesLen = resolution.classes.length;
	for (let i = 0; i < resClassesLen; i++) {
		const cls = resolution.classes[i];
		if (cls && cls !== "data-link-text") {
			pool.classes[pool.classesCount++] = cls;
		}
	}

	return pool;
}
