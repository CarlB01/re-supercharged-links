# Re-Supercharged Links

[![Obsidian Plugin](https://img.shields.io/badge/Obsidian-Plugin-%23483699.svg?logo=obsidian&logoColor=white)](https://obsidian.md)
[![Obsidian Community Plugin](https://img.shields.io/badge/Obsidian-Community%20Plugin-7C3AED?logo=obsidian&logoColor=white)](https://obsidian.md/plugins)
[![Release](https://img.shields.io/github/v/release/CarlB01/re-supercharged-links)](https://github.com/CarlB01/re-supercharged-links/releases)
[![myBrain Integration](https://img.shields.io/badge/myBrain-Integration-00C853?logo=icloud&logoColor=white)](https://github.com/CarlB01/myBrain)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/CarlB01/re-supercharged-links/blob/master/LICENSE)
[![Downloads](https://img.shields.io/github/downloads/CarlB01/re-supercharged-links/total)](https://github.com/CarlB01/re-supercharged-links/releases)
[![Stars](https://img.shields.io/github/stars/CarlB01/re-supercharged-links)](https://github.com/CarlB01/re-supercharged-links/stargazers)

Fast, modern metadata-based link styling for Obsidian.  
Style links by **tag**, **attribute/frontmatter**, or **path** with live updates and low overhead.

---

## What’s new in v1.0.12

This release continues the performance-focused architecture and includes the latest cache/runtime improvements:

- **Targeted cache invalidation (D2):**
  - File `modify` invalidates only that file’s cached entries
  - `rename` invalidates old + new path
  - Folder/path operations can invalidate by prefix
  - avoids broad cache clears and reduces churn in large vaults
- **Smoother live behavior:** less unnecessary recompute during normal vault activity
- **Stable rule pipeline:** settings changes still compile and apply quickly, while runtime work stays more focused

---

## What this plugin does

Re-Supercharged Links turns metadata into visual context across Obsidian UI surfaces.

Instead of plain internal links, you can make link appearance reflect meaning at a glance:

- status (`todo`, `doing`, `done`)
- type (`person`, `project`, `note`)
- urgency/priority
- category/tags
- folder/path context

Supported rule targets:

1. **Tag**
2. **Attribute** (frontmatter / metadata key + value)
3. **Path** (note path matching)

Each rule can control:

- text color (light/dark)
- background color (light/dark)
- font weight
- text style (normal / italic / underline / strikethrough)
- optional prefix/suffix icons

---

## Quick start

1. Install and enable **Re-Supercharged Links** in Community Plugins.
2. Open plugin settings and create a new rule.
3. Choose target type:
   - `Tag`, `Attribute`, or `Path`
4. Enter match value and styling.
5. Save — links update automatically.

Tip for tags: write clean tag values in settings (without leading `#` unless your workflow requires otherwise).

---

## How matching works (simple + technical)

### Simple view
- Plugin reads metadata for notes.
- It compares notes/links against your rules.
- Matching rules produce visual styles and optional semantic classes.

### Technical view
- Runtime is in-memory and optimized for incremental updates.
- Rule config changes bump internal versioning, so stale rule state is not reused.
- Cache is invalidated selectively by path/prefix on vault events (D2), reducing full recomputation pressure.
- Visible links are refreshed in a controlled way after relevant changes.

---

## Performance notes

Designed for metadata-heavy vaults:

- avoids broad cache resets on every file event
- minimizes repeated work when only a subset of files changed
- keeps UI updates responsive during frequent edits/renames

If you work in a large vault, v1.0.12 should feel more stable under continuous activity than earlier broad-invalidation behavior.

---

## Compatibility

- Built for modern Obsidian workflows
- Works with metadata-heavy setups (frontmatter, structured tags, path conventions)
- Coexists with common ecosystem plugins; behavior depends on each plugin’s rendered DOM and timing

---

## Known behavior

- Rule order matters when multiple rules can match.
- Very broad path rules may affect many links by design.
- After large structural vault operations, a short settling moment can occur while affected views refresh.

---

## Contributing / feedback

Issues and improvement ideas are welcome:
- performance traces
- edge-case matching examples
- UI/UX polish requests for settings workflow

---

## Credits

Respect to the original Supercharged Links idea and maintainers.  
Re-Supercharged Links continues that vision with a modernized runtime and ongoing performance-focused iteration.

---

Developed with care for real-world, metadata-heavy note workflows.
