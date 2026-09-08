import { Setting, setIcon } from "obsidian";
import { CSSLink } from "../../types/css-link";
import ResuperchargedLinks from "../../main";

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
  setControlValue: (key: string, value: unknown, silent: boolean) => Promise<void>;
  refreshUI: () => void;
}

export function buildUnifiedColorRow(config: ColorRowConfig): void {
  const { setting, plugin, selector, propKey, modeName, fallbackColor, isBackground, setControlValue, refreshUI } = config;
  const historyKey = `${propKey}_${selector.uid}`;

  // Initialize a fresh timeline bucket state if this element is clicked for the first time
  if (!colorTimelines[historyKey]) {
    colorTimelines[historyKey] = { past: [selector[propKey] || ""], future: [] };
  }

  const timeline = colorTimelines[historyKey]!;

  // 1. ADD DEDICATED UNDO BUTTON NODE
  setting.addExtraButton((undoBtn) => {
    const el = undoBtn.extraSettingsEl;
    el.addClass("scl-undo-btn");
    el.setAttribute("data-key", historyKey);
    setIcon(el, "undo");
    el.setAttribute("aria-label", "Undo step");

    // 🔑 FIKSET BLINKING: Sjekk tilstand SYNKRONTS med en gang i stedet for setTimeout
    if (timeline.past.length <= 1) el.hide(); else el.show();

    undoBtn.onClick(async () => {
      if (timeline.past.length <= 1) return;
      
      const current = timeline.past.pop()!;
      timeline.future.push(current);
      
      const previous = timeline.past[timeline.past.length - 1] ?? "";
      selector[propKey] = previous as any;

      await setControlValue(`scl_${propKey}_${selector.uid}`, previous, false);
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

    // 🔑 FIKSET BLINKING: Sjekk tilstand synkront under rendering
    if (timeline.future.length === 0) el.hide(); else el.show();

    redoBtn.onClick(async () => {
      if (timeline.future.length === 0) return;

      const next = timeline.future.pop()!;
      timeline.past.push(next);
      selector[propKey] = next as any;

      await setControlValue(`scl_${propKey}_${selector.uid}`, next, false);
      refreshUI();
    });
  });

  // 3. ADD TOTAL RESET COMPONENT BUTTON
  setting.addExtraButton((b) => b.setIcon("rotate-ccw").setTooltip("Reset to default").onClick(async () => {
    const defaultVal = isBackground ? "transparent" : "";
    const lastSaved = timeline.past[timeline.past.length - 1];

    // 🔑 FIKSET: Reset sletter IKKE historikken lenger. Den legger bare til 'transparent' eller tom streng
    // som et nytt ledd i tidslinjen, slik at du kan trykke UNDO for å få fargen din tilbake!
    if (defaultVal !== lastSaved) {
      timeline.past.push(defaultVal);
      timeline.future = []; // Start en ny gren i tidslinjen
    }

    selector[propKey] = defaultVal as any;
    await setControlValue(`scl_${propKey}_${selector.uid}`, defaultVal, false);
    refreshUI();
  }));

  // 4. ATTACH THE NATIVE OBISIDIAN COLOR PICKER
  setting.addColorPicker((cp) => {
    const currentVal = selector[propKey];
    cp.setValue(currentVal && currentVal !== "transparent" ? currentVal : fallbackColor);
    
    cp.onChange(async (v) => {
      const lastSaved = timeline.past[timeline.past.length - 1];
      
      if (v !== lastSaved) {
        timeline.past.push(v);
        timeline.future = []; 
      }

      // Live oppdatering av knappene på den aktive linjen under drag
      const row = setting.settingEl;
      const uEl = row.querySelector(`.scl-undo-btn[data-key="${historyKey}"]`) as HTMLElement;
      const rEl = row.querySelector(`.scl-redo-btn[data-key="${historyKey}"]`) as HTMLElement;
      
      if (uEl) { if (timeline.past.length <= 1) uEl.hide(); else uEl.show(); }
      if (rEl) { if (timeline.future.length === 0) rEl.hide(); else rEl.show(); }

      await setControlValue(`scl_${propKey}_${selector.uid}`, v, true);
    });

    plugin.registerDomEvent(cp.colorPickerEl, "change", () => {
      refreshUI();
    });
  });
}
