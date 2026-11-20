# PRE-WARM & ENRICH: Fetch styles from  Re-Supercharged Links in one single V8-friendly batch:


if (this.sclBridge.isAvailable() && this.noteCache.size > 0) {
      const activeFiles: TFile[] = [];
      for (const note of this.noteCache.values()) {
        if (note.isUsed) activeFiles.push(note.file);
      }

      const styleMap = await this.sclBridge.resolveBatch(activeFiles, 5);
      if (tokenAtStart !== this.updateRequestToken || this.isAborted) return;

      for (const [path, flyweight] of styleMap) {
        const node = this.noteCache.get(path);
        if (node) {
          node.sclHasMatch = flyweight.hasMatch;
          node.sclSignature = flyweight.signature;
          node.sclColor = flyweight.color;
          node.sclBgColor = flyweight.backgroundColor;
          node.sclIconBefore = flyweight.iconBefore;
          node.sclIconAfter = flyweight.iconAfter;
          node.sclClasses = flyweight.classes;
        }
      }
    }

# How to define sclBridge:  
- see scl-bridge.ts
