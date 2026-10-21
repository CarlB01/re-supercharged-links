import ResuperchargedLinks from "../../core/main";
import { CSSLink } from "../../types/css-link";

interface MoveRuleOptions {
	onAfterMove: () => void;
	onAnimate: (() => void) | null;
	activeEditIndex: number | null;
	setActiveEditIndex: (next: number | null) => void;
}

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
	
	const currentRowBefore: HTMLElement | null = document.querySelector(`.scl-main-rule-row[data-index="${index}"]`);
	const targetRowBefore: HTMLElement | null = document.querySelector(`.scl-main-rule-row[data-index="${targetIndex}"]`);
	const currentRect: DOMRect | null = currentRowBefore instanceof HTMLElement ? currentRowBefore.getBoundingClientRect() : null;
	const targetRect: DOMRect | null = targetRowBefore instanceof HTMLElement ? targetRowBefore.getBoundingClientRect() : null;

	selectors[targetIndex] = currentSelector;
	selectors[index] = targetSelector;
	plugin.bumpRuleConfigVersion();

	const active: number | null = options.activeEditIndex === undefined ? null : options.activeEditIndex;
	
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
			// ⚡ SØKESIKRING: Slå opp de nylig flyttede radene basert på deres NYE master-indeks i DOM-en!
			// Siden onAfterMove() akkurat har kjørt, har radene fått oppdaterte data-index verdier.
			const movedRow: HTMLElement | null = document.querySelector(`.scl-main-rule-row[data-index="${targetIndex}"]`);
			const swappedRow: HTMLElement | null = document.querySelector(`.scl-main-rule-row[data-index="${index}"]`);
			
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
