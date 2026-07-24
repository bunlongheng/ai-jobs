#!/usr/bin/env node
// ONE-TIME: open the background chrome-profile VISIBLY so you can log into LinkedIn.
// After this, detect_easy_headless.mjs reuses the saved session forever, fully headless.
import { createRequire } from "module"; import os from "os"; import path from "path";
const require = createRequire(import.meta.url);
const { chromium } = require(path.join(os.homedir(), "Sites/jobs/web/node_modules/playwright"));
const PROFILE = path.join(os.homedir(), "Sites/jobs/chrome-profile");
const ctx = await chromium.launchPersistentContext(PROFILE, { headless: false, channel: "chrome", args: ["--start-maximized"] })
  .catch(() => chromium.launchPersistentContext(PROFILE, { headless: false }));
const page = ctx.pages()[0] || await ctx.newPage();
await page.goto("https://www.linkedin.com/login");
console.log("Log into LinkedIn in the window that opened. Cookies save automatically.");
console.log("When you see your feed, close the window (or press Ctrl-C here).");
await new Promise((r) => ctx.on("close", r));
