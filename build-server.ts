import esbuild from "esbuild";

esbuild.build({
  entryPoints: ["server.ts"],
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  outfile: "dist/server.mjs",
  external: ["express", "rss-parser", "vite"],
}).catch(() => process.exit(1));
