#!/usr/bin/env node
// Points this panel at your Firebase project and at the Admin + Backend deployment.
//   npm run configure -- <PROJECT_ID> [--site <hosting-site-id>] [--api-url <url>]
// The API is served by the admin site: https://<PROJECT_ID>-admin.web.app/api.
// If Admin + Backend lives in a different Firebase project, pass
//   --api-url https://<OTHER_PROJECT_ID>-admin.web.app
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const project = args.find((a, i) => !a.startsWith("--") && !(args[i - 1] || "").startsWith("--"));
const opt = (name, fallback) => {
  const i = args.indexOf("--" + name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
if (!project || !/^[a-z0-9-]{4,30}$/.test(project)) {
  console.error("Usage: npm run configure -- <PROJECT_ID> [--site <site>] [--api-url <admin site url>]");
  process.exit(1);
}
const site = opt("site", `${project}-user`);
const apiUrl = opt("api-url", `https://${project}-admin.web.app`).replace(/\/$/, "").replace(/\/api$/, "");
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

fs.writeFileSync(path.join(root, ".firebaserc"), JSON.stringify({ projects: { default: project } }, null, 2) + "\n");
const fbPath = path.join(root, "firebase.json");
const fb = JSON.parse(fs.readFileSync(fbPath, "utf8"));
fb.hosting.site = site;
fs.writeFileSync(fbPath, JSON.stringify(fb, null, 2) + "\n");
const envPath = path.join(root, ".env.production");
const env = fs.readFileSync(envPath, "utf8").replace(/^VITE_API_BASE_URL=.*$/m, `VITE_API_BASE_URL=${apiUrl}`);
fs.writeFileSync(envPath, env);

console.log(`User panel configured for "${project}".
  Hosting site   https://${site}.web.app
  Backend API    ${apiUrl}/api   (served by the Admin + Backend deployment)
Next: firebase hosting:sites:create ${site}   (first time only)
      firebase deploy --only hosting`);
