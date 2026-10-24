// Recorder config for the product-demo-recording skill (see STORYBOARD.md).
// Assets are written outside the repo so videos never enter git.
const path = require("path")
const OUT = process.env.DEMO_ASSETS_DIR || path.join(require("os").homedir(), "projects/demo-assets/trust-sprint")

module.exports = {
  url: "http://localhost:3107/trust",
  viewport: { width: 1920, height: 1080 },
  outDir: OUT,
  heroPath: path.join(OUT, "trust-sprint-hero.png"),
  colorScheme: "light",
  hideSelectors: ["nextjs-portal"],
  redact: [],
  scenes: [
    { name: "S1 inputs", actions: [{ goto: { ready: "illustrative, synthetic data" } }, { mark: "inputs" }, { wait: 5000 }] },
    ...["evaluation", "risk", "recommendations", "evidence"].map((id, i) => ({
      name: `S${i + 2} ${id}`,
      actions: [
        { eval: `document.getElementById("${id}").scrollIntoView({ behavior: "smooth", block: "start" })` },
        { wait: 1400 },
        { mark: id },
        ...(id === "risk" ? [{ hero: true }] : []),
        { wait: 5000 },
      ],
    })),
  ],
}
