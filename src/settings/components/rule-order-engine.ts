import { CSSLink } from "../../types/css-link";
import ResuperchargedLinks from "../../main";

/**
 * Safe layout reordering routine.
 * Swaps index markers and handles clean transform repaint animations seamlessly.
 */
export async function moveRule(
	plugin: ResuperchargedLinks,
	selectors: CSSLink[],
	index: number,
	direction: number,
	refreshCallback: () => void,
	generateCallback: () => void
): Promise<void> {
	const targetIndex = index + direction;
	const currentSelector = selectors[index];
	const targetSelector = selectors[targetIndex];
	if (!currentSelector || !targetSelector) return;

	const allRowsBefore = Array.from(document.querySelectorAll(".vertical-tab-content-container .scl-clickable-row"));
	const currentRowBefore = allRowsBefore[index];
	const targetRowBefore = allRowsBefore[targetIndex];
	const currentRect = currentRowBefore?.getBoundingClientRect();
	const targetRect = targetRowBefore?.getBoundingClientRect();

	selectors[targetIndex] = currentSelector;
	selectors[index] = targetSelector;

	plugin.compileActiveAttributes();
	await plugin.saveSettings();
	generateCallback();
	refreshCallback();

	if (currentRect && targetRect) {
		window.setTimeout(() => {
			const allRowsAfter = document.querySelectorAll(".vertical-tab-content-container .scl-clickable-row");
			const movedRow = allRowsAfter[targetIndex] as HTMLElement;
			const swappedRow = allRowsAfter[index] as HTMLElement;
			if (movedRow && swappedRow) {
				movedRow.animate([{ transform: `translateY(${currentRect.top - targetRect.top}px)` }, { transform: "translateY(0)" }], { duration: 250, easing: "ease-in-out" });
				swappedRow.animate([{ transform: `translateY(${targetRect.top - currentRect.top}px)` }, { transform: "translateY(0)" }], { duration: 250, easing: "ease-in-out" });
			}
		}, 0);
	}
}
