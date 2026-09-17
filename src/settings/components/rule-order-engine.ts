import { CSSLink } from "../../types/css-link";
import ResuperchargedLinks from "../../main";

interface MoveRuleOptions {
	onAfterMove: () => void;
	onAnimate: (() => void) | null;
	activeEditIndex: number | null;
	setActiveEditIndex: (next: number | null) => void;
}

/**
 * Moves a rule by one step and keeps active editor index in sync.
 * Includes optional row animation after UI refresh.
 */
export async function moveRule(
	plugin: ResuperchargedLinks,
	selectors: CSSLink[],
	index: number,
	direction: number,
	options: MoveRuleOptions
): Promise<void> {
	const targetIndex: number = index + direction;
	const currentSelector: CSSLink | null = selectors[index] ?? null;
	const targetSelector: CSSLink | null = selectors[targetIndex] ?? null;
	if (currentSelector === null || targetSelector === null) return;

	const allRowsBefore: Element[] = Array.from(
		document.querySelectorAll(".vertical-tab-content-container .scl-clickable-row")
	);
	const currentRowBefore: Element | null = allRowsBefore[index] ?? null;
	const targetRowBefore: Element | null = allRowsBefore[targetIndex] ?? null;
	const currentRect: DOMRect | null = currentRowBefore instanceof HTMLElement ? currentRowBefore.getBoundingClientRect() : null;
	const targetRect: DOMRect | null = targetRowBefore instanceof HTMLElement ? targetRowBefore.getBoundingClientRect() : null;

	selectors[targetIndex] = currentSelector;
	selectors[index] = targetSelector;
	plugin.bumpRuleConfigVersion();

	const active: number | null = options.activeEditIndex;
	if (active === index) {
		options.setActiveEditIndex(targetIndex);
	} else if (active === targetIndex) {
		options.setActiveEditIndex(index);
	}

	plugin.compileActiveAttributes();
	await plugin.saveSettings();

	options.onAfterMove();

	if (currentRect !== null && targetRect !== null) {
		window.setTimeout((): void => {
			const allRowsAfter: NodeListOf<Element> = document.querySelectorAll(
				".vertical-tab-content-container .scl-clickable-row"
			);
			const movedRow: HTMLElement | null = (allRowsAfter[targetIndex] as HTMLElement) ?? null;
			const swappedRow: HTMLElement | null = (allRowsAfter[index] as HTMLElement) ?? null;
			if (movedRow !== null && swappedRow !== null) {
				movedRow.animate(
					[{ transform: `translateY(${currentRect.top - targetRect.top}px)` }, { transform: "translateY(0)" }],
					{ duration: 250, easing: "ease-in-out" }
				);
				swappedRow.animate(
					[{ transform: `translateY(${targetRect.top - currentRect.top}px)` }, { transform: "translateY(0)" }],
					{ duration: 250, easing: "ease-in-out" }
				);
			}
			if (typeof options.onAnimate === "function") {
				options.onAnimate();
			}
		}, 0);
	}
}