# Changelog

All notable changes to this extension will be documented in this file.

## [3.1.2] - 2026-08-14

### Changed

- Reworked syntax colors after reviewing 1,193 supported files from an installed game directory.
- Added separate low-saturation palettes for common dark and light VS Code themes.
- Changed invalid dynamic `_effects` decorations to use the active theme's warning color.

## [3.1.1] - 2026-08-14

### Added

- Initial public VS Code release.
- Language support for `.effects.darkest`, `.info.darkest`, `.art.darkest`, `.override.darkest`, and `.colours.darkest`.
- TextMate syntax highlighting with Effect-specific keyword colors and dynamic Info-like `_effects` highlighting.
- Context-aware completion for Effect and Info-like files, including prefix and subsequence fuzzy matching.
- Effect and Info-like diagnostics with Problems panel integration and 250 ms debounced updates.
- Multi-line `Ctrl+/` / `Cmd+/` comment toggling.
- Native RGBA color previews, color picker integration, and hover information for Colours files.
