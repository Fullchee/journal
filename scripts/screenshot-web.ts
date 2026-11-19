// Screenshots web routes from a running web-preview.sh. Usage: screenshot-web.ts [route…] [--all-widths] [--full-page]
// Prints each image path, plus the page's console errors and failed requests.
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";
import { chromium } from "playwright";
import * as z from "zod/mini";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    "all-widths": { type: "boolean", default: false },
    "full-page": { type: "boolean", default: false },
    out: { type: "string", default: path.join(tmpdir(), "journal-web-shots") },
  },
});

const UNSET = "PREVIEW_URL is unset: run this through scripts/web-preview.sh.";

const Env = z.object({ PREVIEW_URL: z.string({ error: UNSET }).check(z.minLength(1, UNSET)) });

const { PREVIEW_URL: baseUrl } = Env.parse(process.env);

const routes = positionals.length > 0 ? positionals : ["/"];

// Desktop, the wide-layout breakpoint's lower side, and a phone.
const widths = values["all-widths"] ? [1440, 1024, 390] : [1440];

mkdirSync(values.out, { recursive: true });

const browser = await chromium.launch();

try {
  for (const width of widths) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    page.on("console", (message) => {
      if (message.type() === "error")
        console.warn(`console error (${width}px): ${message.text().slice(0, 300)}`);
    });
    page.on("requestfailed", (request) =>
      console.warn(`request failed: ${request.url()} ${request.failure()?.errorText}`),
    );
    page.on("response", (response) => {
      if (response.status() >= 400) console.warn(`HTTP ${response.status()}: ${response.url()}`);
    });

    for (const route of routes) {
      await page.goto(baseUrl + route, { waitUntil: "networkidle" });
      // Queries settle after the network goes idle; give React a moment to paint them.
      await page.waitForTimeout(1000);
      const slug = route.replaceAll(/\W/g, "_").replace(/^_+/, "");
      const name = `${slug === "" ? "root" : slug}-${width}.png`;
      const file = path.join(values.out, name);
      await page.screenshot({ path: file, fullPage: values["full-page"] });
      process.stdout.write(`${file}\n`);
    }

    await page.close();
  }
} finally {
  await browser.close();
}
