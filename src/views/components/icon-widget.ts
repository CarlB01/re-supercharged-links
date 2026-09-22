import { WidgetType } from "@codemirror/view";

/**
 * 🟢 RUNTIME EMOJI WIDGET: Isolated physical DOM factory that renders inline rule icons.
 * STRICT PROTOCOL: Inherits directly from CodeMirror's WidgetType with absolute type parameters.
 * Multi-window compliant architecture leveraging the active view dome node dom domain.
 */
export class IconWidget extends WidgetType {
	constructor(
		private readonly icon: string, 
		private readonly isBefore: boolean
	) {
		super();
	}

	/**
	 * Natively constructs the DOM element node for the CodeMirror widget component.
	 */
	public toDOM(): HTMLElement {

		const span: HTMLSpanElement = createEl("span", {
			cls: this.isBefore ? "scl-inline-icon scl-inline-icon-before" : "scl-inline-icon scl-inline-icon-after",
			text: this.icon
		});

		span.setAttribute("contenteditable", "false");
		span.setCssStyles({ display: "inline-block" });

		return span;
	}


	/**
	 * Comparison logic to allow CodeMirror to determine if the widget needs a graphical redrawing step.
	 */
	public eq(other: IconWidget): boolean {
		return other.icon === this.icon && other.isBefore === this.isBefore;
	}
}
