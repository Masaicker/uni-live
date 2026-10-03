const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");

function sourceFingerprint(root) {
  const hash = createHash("sha256").update(`production-v1\0${process.version}\0`);
  const add = (relative) => {
    const filename = path.join(root, relative);
    if (!fs.existsSync(filename)) return;
    const stat = fs.lstatSync(filename);
    if (stat.isSymbolicLink()) throw new Error(`Build input must be a regular file or directory: ${relative}`);
    if (stat.isDirectory()) {
      for (const name of fs.readdirSync(filename).sort()) add(path.join(relative, name));
    } else if (stat.isFile()) {
      let content = fs.readFileSync(filename);
      if (relative === "tsconfig.json") {
        const config = JSON.parse(content.toString("utf8").replace(/^\uFEFF/, ""));
        // Next adds its selected output's type directory during each build.
        config.include = config.include?.filter(value => !value.replaceAll("\\", "/").startsWith(".cache/"));
        content = Buffer.from(JSON.stringify(config));
      }
      hash.update(relative.replaceAll("\\", "/")).update("\0").update(content).update("\0");
    }
  };
  for (const relative of ["app", "src", "public", "scripts", "package.json", "package-lock.json", "next.config.ts", "tsconfig.json", "tailwind.config.ts", "postcss.config.mjs", "eslint.config.mjs", ".eslintrc.json", ".npmrc"]) add(relative);
  return hash.digest("hex");
}

function needsBuild(root) {
  const buildDir = path.join(root, ".cache", "production");
  if (!fs.existsSync(path.join(buildDir, "BUILD_ID")) || !fs.existsSync(path.join(buildDir, "standalone", "server.js"))) return true;
  let stamp;
  try { stamp = JSON.parse(fs.readFileSync(path.join(root, ".cache", "production-source.json"), "utf8")); } catch { return true; }
  return stamp.fingerprint !== sourceFingerprint(root) || stamp.buildId !== fs.readFileSync(path.join(buildDir, "BUILD_ID"), "utf8").trim();
}

if (require.main === module) {
  const root = path.resolve(__dirname, "..");
  const cache = path.join(root, ".cache");
  try {
    const command = process.argv[2];
    if (command === "check") process.exitCode = needsBuild(root) ? 2 : 0;
    else if (command === "prepare") {
      fs.mkdirSync(cache, { recursive: true });
      fs.writeFileSync(path.join(cache, "production-source.pending.json"), JSON.stringify({ fingerprint: sourceFingerprint(root) }));
    } else if (command === "stamp") {
      const pending = JSON.parse(fs.readFileSync(path.join(cache, "production-source.pending.json"), "utf8"));
      if (pending.fingerprint !== sourceFingerprint(root)) throw new Error("Source changed during the build. Run the build again.");
      fs.writeFileSync(path.join(cache, "production-source.json"), JSON.stringify({ fingerprint: pending.fingerprint, buildId: fs.readFileSync(path.join(cache, "production", "BUILD_ID"), "utf8").trim() }));
    } else throw new Error("Expected check, prepare or stamp.");
  } catch (error) { console.error(`ERROR: ${error.message}`); process.exitCode = 1; }
}

module.exports = { sourceFingerprint, needsBuild };
