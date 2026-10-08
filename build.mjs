import * as esbuild from "esbuild"
import { solidPlugin } from "esbuild-plugin-solid"

const watch = process.argv.includes("--watch")

const options = {
  entryPoints: ["src/tui.tsx"],
  outfile: "dist/tui.js",
  bundle: true,
  format: "esm",
  platform: "node",
  sourcemap: true,
  external: [
    "@opencode/plugin",
    "@opentui/core",
    "@opentui/solid",
    "solid-js",
    "solid-js/web",
    "solid-js/store",
    "solid-js/html",
  ],
  plugins: [solidPlugin({ solid: { moduleName: "@opentui/solid", generate: "universal" } })],
  logLevel: "info",
}

if (watch) {
  const ctx = await esbuild.context(options)
  await ctx.watch()
  console.log("[build] watching src/tui.tsx ...")
} else {
  await esbuild.build(options)
  console.log("[build] dist/tui.js written")
}