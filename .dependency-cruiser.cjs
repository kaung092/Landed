/**
 * dependency-cruiser config for the auto-generated architecture diagram.
 * Tuned for a HIGH-LEVEL view: modules are collapsed to one box per
 * second-level folder (e.g. lib/jobs, app/api, components/board) so the
 * diagram shows architecture, not 400 individual files.
 *
 * Regenerated in CI on every push — see .github/workflows/architecture-diagram.yml
 * Run locally with: npm run diagram:arch
 */
module.exports = {
  forbidden: [],
  options: {
    // Only chart the source we author; skip framework/build noise.
    doNotFollow: { path: "node_modules" },
    exclude: {
      path: [
        "node_modules",
        "\\.next",
        "(^|/)tests/",
        "\\.test\\.(ts|tsx)$",
        "scripts/",
        "drizzle\\.config\\.ts",
        "next\\.config\\.ts",
        "postcss\\.config\\.mjs",
        "eslint\\.config\\.mjs",
      ],
    },
    // Chart only our own source — drops node builtins (fs, path) and deps.
    includeOnly: "^(app|components|lib|hooks)",
    // Collapse every module to its top-two path segments -> high-level boxes.
    collapse: "^(app|components|lib|hooks)/[^/]+",
    tsPreCompilationDeps: true,
    tsConfig: { fileName: "tsconfig.json" },
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "node", "default", "types"],
      extensions: [".ts", ".tsx", ".js", ".jsx", ".json"],
    },
  },
};
