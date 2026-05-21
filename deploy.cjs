#!/usr/bin/env node
/**
 * deploy.cjs — Déploie la dernière version depuis GitHub.
 * Utilisation : `npm run deploy` ou `node deploy.cjs`
 */
const { execSync } = require("child_process");
const path = require("path");

const ROOT = __dirname;
const log = (msg) => console.log(`\n→ ${msg}`);
const run = (cmd, cwd = ROOT) => {
  log(`$ ${cmd}  (in ${path.relative(ROOT, cwd) || "."})`);
  execSync(cmd, { cwd, stdio: "inherit" });
};

try {
  log("1/4 git pull");
  run("git pull --ff-only");
  log("2/4 npm install (Client + Server)");
  run("npm install --no-audit --silent", path.join(ROOT, "Client"));
  run("npm install --no-audit --silent", path.join(ROOT, "Server"));
  log("3/4 vite build (Client)");
  run("npm run build", path.join(ROOT, "Client"));
  log("4/4 pm2 reload ecosystem");
  run("npx pm2 reload ecosystem.config.cjs");
  console.log("\n✅ Deploy OK — apps live");
} catch (err) {
  console.error("\n❌ Deploy FAILED :", err.message);
  process.exit(1);
}
