import puppeteer from "puppeteer";

const BASE = (process.env.BASE_URL || "http://localhost:5173").replace(/\/+$/, "");
const FILE = process.argv[2];
const K =
  "bbw_pub_23ac1e410efd14afd380458d3e78959c2bf22b0b87b1172d";
const FN = "https://babelbim-worker.datafiles.workers.dev/v1/bim/functions/v1/concepts-drive";

const browser = await puppeteer.launch({ headless: "new", args: ["--no-sandbox"] });
const page = await browser.newPage();
page.setDefaultTimeout(300000);
await page.goto(BASE, { waitUntil: "domcontentloaded" });
const r = await page.evaluate(
  async (url, headers) => {
    const mod = await import("/scripts/browser/dump-item8-payload.ts");
    return mod.dump(url, headers);
  },
  `${FN}?action=download&fileId=${FILE}`,
  { apikey: K, Authorization: `Bearer ${K}` }
);
console.log(JSON.stringify(r, null, 2));
await browser.close();
