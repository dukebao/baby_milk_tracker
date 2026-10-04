const fs = require("node:fs");
const path = require("node:path");
const build = path.resolve(__dirname, "../build");
// GitHub Pages serves this document for deep links. Absolute PUBLIC_URL assets
// and BrowserRouter's basename let invites, tracker reloads and OAuth returns work.
fs.copyFileSync(path.join(build, "index.html"), path.join(build, "404.html"));
fs.writeFileSync(path.join(build, ".nojekyll"), "");
console.log("GitHub Pages deep-link fallback prepared.");
