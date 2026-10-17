import { Setting, setIcon } from "obsidian";
import { CSSLink } from "../../types/css-link";
import ResuperchargedLinks from "../../core/main";

// Persistent timeline registry. Survives UI refreshes, cleared only when detail pane closes.
export const colorTimelines: Record<string, { past: string[]; future: string[] }> = {};

interface ColorRowConfig {
  setting: Setting;
  plugin: ResuperchargedLinks;
  selector: CSSLink;
  propKey: 'lightColor' | 'darkColor' | 'lightBgColor' | 'darkBgColor';
  modeName: string;
  fallbackColor: string;
  isBackground: boolean;
  setControlValue: (key: string, value: unknown, silent: boolean) => void | Promise<void>;
  refreshUI: () => void;
  index: number; 
}

interface HistoryButtonBlueprint {
  cls: string;
  icon: string;
  label: string;
  shouldDisable: () => boolean;
  onExecute: () => Promise<void>;
}

/**
 * Public cleanup utility called by SettingTab to clear session memories when closing details.
 */
export function clearColorHistory(): void {
  for (const key in colorTimelines) {
    if (Object.prototype.hasOwnProperty.call(colorTimelines, key)) {
      delete colorTimelines[key];
    }
  }
}

/**
 * Factory routine to inject and wire standard control action buttons with consistent layouts.
 */
function createHistoryActionButton(
  setting: Setting,
  historyKey: string,
  blueprint: HistoryButtonBlueprint,
  onPostAction: () => void
): void {
  setting.addExtraButton((btn) => {
    const el: HTMLElement = btn.extraSettingsEl;
    el.addClass(blueprint.cls);
    el.setAttribute("data-key", historyKey);
    setIcon(el, blueprint.icon);
    el.setAttribute("aria-label", blueprint.label);

    btn.onClick(async (): Promise<void> => {
      if (blueprint.shouldDisable()) return;
      await blueprint.onExecute();
      onPostAction();
    });
  });
}

/**
 * Synchronizes the visibility and interactive state of the history buttons.
 * Guarantees positional stability by dimming icons instead of shifting DOM nodes.
 */
function updateHistoryButtonStates(setting: Setting, historyKey: string, past: string[], future: string[]): void {
  const row: HTMLElement = setting.settingEl;
  const uEl: HTMLElement | null = row.querySelector(`.scl-undo-btn[data-key="${historyKey}"]`);
  const rEl: HTMLElement | null = row.querySelector(`.scl-redo-btn[data-key="${historyKey}"]`);
  
  const isHistoryActive: boolean = past.length > 1 || future.length > 0;

  if (uEl !== null) {
    if (isHistoryActive) {
      uEl.show();
      uEl.toggleClass("is-disabled", past.length <= 1);
      uEl.style.opacity = past.length <= 1 ? "0.3" : "1";
      uEl.style.pointerEvents = past.length <= 1 ? "none" : "auto";
    } else {
      uEl.hide();
    }
  }

  if (rEl !== null) {
    if (isHistoryActive) {
      rEl.show();
      rEl.toggleClass("is-disabled", future.length === 0);
      rEl.style.opacity = future.length === 0 ? "0.3" : "1";
      rEl.style.pointerEvents = future.length === 0 ? "none" : "auto";
    } else {
      rEl.hide();
    }
  }
}

/**
 * Builds a layout-stable color configuration row with unified undo/redo capabilities.
 */
export function buildUnifiedColorRow(config: ColorRowConfig): void {
  const { setting, plugin, selector, propKey, fallbackColor, isBackground, setControlValue, refreshUI, index } = config;
  
  const historyKey = `${propKey}_${index}`;
  const modelProxy = selector as unknown as Record<string, string>;

  if (!colorTimelines[historyKey]) {
    colorTimelines[historyKey] = { past: [modelProxy[propKey] || ""], future: [] };
  }

  const timeline = colorTimelines[historyKey];

  const handleStateMutation = (): void => {
    updateHistoryButtonStates(setting, historyKey, timeline.past, timeline.future);
    refreshUI();
  };

  // ⚡ DEKLARATIV MATRISE: Her mater vi inn verdiene for hver knapp i sekvens
  const blueprints: HistoryButtonBlueprint[] = [
    {
      cls: "scl-undo-btn",
      icon: "undo",
      label: "Undo step",
      shouldDisable: () => timeline.past.length <= 1,
      onExecute: async (): Promise<void> => {
        const current: string | undefined = timeline.past.pop();
        if (current !== undefined) {
          timeline.future.push(current);
        }
        const previous: string = timeline.past[timeline.past.length - 1] ?? "";
        modelProxy[propKey] = previous;
        await setControlValue(`scl_${propKey}_${index}`, previous, false);
      }
    },
    {
      cls: "scl-redo-btn",
      icon: "redo",
      label: "Redo step",
      shouldDisable: () => timeline.future.length === 0,
      onExecute: async (): Promise<void> => {
        const next: string | undefined = timeline.future.pop();
        if (next !== undefined) {
          timeline.past.push(next);
        }
        modelProxy[propKey] = next ?? "";
        await setControlValue(`scl_${propKey}_${index}`, modelProxy[propKey], false);
      }
    },
    {
      cls: "scl-reset-btn",
      icon: "rotate-ccw",
      label: "Reset to default",
      shouldDisable: () => false,
      onExecute: async (): Promise<void> => {
        const defaultVal: string = isBackground ? "transparent" : "";
        const lastSaved: string = timeline.past[timeline.past.length - 1] ?? "";
        if (defaultVal !== lastSaved) {
          timeline.past.push(defaultVal);
          timeline.future = [];
        }
        modelProxy[propKey] = defaultVal;
        await setControlValue(`scl_${propKey}_${index}`, defaultVal, false);
      }
    }
  ];

  // Injekter knappene basert på matrisen
  for (let i = 0; i < blueprints.length; i++) {
    const bp = blueprints[i];
    if (bp !== undefined) {
      createHistoryActionButton(setting, historyKey, bp, handleStateMutation);
    }
  }

  // 4. ATTACH THE NATIVE OBISIDIAN COLOR PICKER
  setting.addColorPicker((cp) => {
    const currentVal: string = modelProxy[propKey] ?? "";
    cp.setValue(currentVal && currentVal !== "transparent" ? currentVal : fallbackColor);
    
    cp.onChange(async (v: string): Promise<void> => {
      const lastSaved: string = timeline.past[timeline.past.length - 1] ?? "";
      if (v !== lastSaved) {
        timeline.past.push(v);
        timeline.future = [];
      }
      updateHistoryButtonStates(setting, historyKey, timeline.past, timeline.future);
      await setControlValue(`scl_${propKey}_${index}`, v, true);
    });

    plugin.registerDomEvent(cp.colorPickerEl, "change", (): void => {
      refreshUI();
    });
  });

  updateHistoryButtonStates(setting, historyKey, timeline.past, timeline.future);
}

