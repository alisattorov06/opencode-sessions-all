// TUI entry forwarder for directory-form plugin loading (e.g. a directory or
// symlink placed in ~/.config/opencode/plugins/). Package-name installs
// resolve `exports["./tui"]` instead and never load this file. Keep the
// target in sync with the build output (dist/tui.js).
export { default } from './dist/tui.js';