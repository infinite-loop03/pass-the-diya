// Usage: npm run set-url -- https://pass-the-diya.your-subdomain.workers.dev
// WhatsApp and Instagram need absolute URLs in link-preview tags, so this writes
// your site's address into public/index.html.
import { readFileSync, writeFileSync } from "node:fs";

const file = new URL("../public/index.html", import.meta.url);
const arg = process.argv[2];

let site;
try {
  site = new URL(arg).origin;
} catch {
  console.error("Give the full address, e.g. npm run set-url -- https://pass-the-diya.you.workers.dev");
  process.exit(1);
}

const html = readFileSync(file, "utf8")
  .replace(/(<meta property="og:url" content=")[^"]*(")/, `$1${site}/$2`)
  .replace(/(<meta property="og:image" content=")[^"]*(")/, `$1${site}/og.jpg$2`);

writeFileSync(file, html);
console.log(`Link previews now point at ${site}. Run npm run deploy to publish.`);
