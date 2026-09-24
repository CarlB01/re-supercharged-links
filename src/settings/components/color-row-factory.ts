import { Setting, setIcon } from "obsidian";
import { CSSLink } from "../../types/css-link";
import ResuperchargedLinks from "../../core/main";

// Persistent timeline registry. Survives UI refreshes, cleared only when detail pane closes.
export const colorTimelines: Record<string, { past: string[]; future: string[] }> = {};

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

interface ColorRowConfig {
  setting: Setting;
  plugin: ResuperchargedLinks;
  selector: CSSLink;
  propKey: 'lightColor' | 'darkColor' | 'lightBgColor' | 'darkBgColor';
  modeName: string;
  fallbackColor: string;
  isBackground: boolean;
  // 🔑 CONTRACT HARMONIZATION: Allow the control parameter proxy to return void or Promise to align with Obsidian
  setControlValue: (key: string, value: unknown, silent: boolean) => void | Promise<void>;
  refreshUI: () => void;
  // 🔑 RUNTIME INDEXING: Pass the sequential array index instead of a static string hash UID
  index: number; 
}

export function buildUnifiedColorRow(config: ColorRowConfig): void {
  const { setting, plugin, selector, propKey, fallbackColor, isBackground, setControlValue, refreshUI, index } = config;
  
  // 🔑 INDEX BRIDGE: Construct transaction history registration key directly around the runtime sequence index
  const historyKey = `${propKey}_${index}`;

  const modelProxy = selector as unknown as Record<string, string>;

  if (!colorTimelines[historyKey]) {
    colorTimelines[historyKey] = { past: [modelProxy[propKey] || ""], future: [] };
  }

  const timeline = colorTimelines[historyKey];

  // 1. ADD DEDICATED UNDO BUTTON NODE
  setting.addExtraButton((undoBtn) => {
    const el = undoBtn.extraSettingsEl;
    el.addClass("scl-undo-btn");
    el.setAttribute("data-key", historyKey);
    setIcon(el, "undo");
    el.setAttribute("aria-label", "Undo step");

    if (timeline.past.length <= 1) el.hide(); else el.show();

    undoBtn.onClick(async () => {
      if (timeline.past.length <= 1) return;
      
      const current = timeline.past.pop()!;
      timeline.future.push(current);
      
      const previous = timeline.past[timeline.past.length - 1] ?? "";
      
      modelProxy[propKey] = previous;

      // 🔑 INDEX CONSOLIDATION: Force the active row index parameter into the control registration channel
      await setControlValue(`scl_${propKey}_${index}`, previous, false);
      refreshUI();
    });
  });

  // 2. ADD DEDICATED REDO BUTTON NODE
  setting.addExtraButton((redoBtn) => {
    const el = redoBtn.extraSettingsEl;
    el.addClass("scl-redo-btn");
    el.setAttribute("data-key", historyKey);
    setIcon(el, "redo");
    el.setAttribute("aria-label", "Redo step");

    if (timeline.future.length === 0) el.hide(); else el.show();

    redoBtn.onClick(async () => {
      if (timeline.future.length === 0) return;

      const next = timeline.future.pop()!;
      timeline.past.push(next);
      
      modelProxy[propKey] = next;

      // 🔑 INDEX CONSOLIDATION: Force the active row index parameter into the control registration channel
      await setControlValue(`scl_${propKey}_${index}`, next, false);
      refreshUI();
    });
  });

  // 3. ADD TOTAL RESET COMPONENT BUTTON
  setting.addExtraButton((b) => b.setIcon("rotate-ccw").setTooltip("Reset to default").onClick(async () => {
    const defaultVal = isBackground ? "transparent" : "";
    const lastSaved = timeline.past[timeline.past.length - 1];

    if (defaultVal !== lastSaved) {
      timeline.past.push(defaultVal);
      timeline.future = []; 
    }

    modelProxy[propKey] = defaultVal;
    // 🔑 INDEX CONSOLIDATION: Force the active row index parameter into the control registration channel
    await setControlValue(`scl_${propKey}_${index}`, defaultVal, false);
    refreshUI();
  }));

  // 4. ATTACH THE NATIVE OBISIDIAN COLOR PICKER
  setting.addColorPicker((cp) => {
    const currentVal = modelProxy[propKey];
    cp.setValue(currentVal && currentVal !== "transparent" ? currentVal : fallbackColor);
    
    cp.onChange(async (v) => {
      const lastSaved = timeline.past[timeline.past.length - 1];
      
      if (v !== lastSaved) {
        timeline.past.push(v);
        timeline.future = []; 
      }

      const row = setting.settingEl;
      const uEl = row.querySelector(`.scl-undo-btn[data-key="${historyKey}"]`) as HTMLElement;
      const rEl = row.querySelector(`.scl-redo-btn[data-key="${historyKey}"]`) as HTMLElement;
      
      if (uEl) { if (timeline.past.length <= 1) uEl.hide(); else uEl.show(); }
      if (rEl) { if (timeline.future.length === 0) rEl.hide(); else rEl.show(); }

      // 🔑 INDEX CONSOLIDATION: Force the active row index parameter into the control registration channel
      await setControlValue(`scl_${propKey}_${index}`, v, true);
    });

    plugin.registerDomEvent(cp.colorPickerEl, "change", () => {
      refreshUI();
    });
  });
}
