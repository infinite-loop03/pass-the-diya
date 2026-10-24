// Runs before every deploy. Warns (doesn't block) if link previews still have no site URL.
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
if (html.includes("__SITE_URL__")) {
  console.warn(
    "\n  Note: link previews (the image in WhatsApp) won't show until you run\n" +
      "        npm run set-url -- <your site address>   and deploy again.\n"
  );
}
