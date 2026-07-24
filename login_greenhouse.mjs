#!/usr/bin/env node
/**
 * login_greenhouse.mjs - open the bot's PERSISTENT Chrome profile to
 * my.greenhouse.io so Bunlong logs into MyGreenhouse ONCE. The session is saved
 * in ~/Sites/jobs/chrome-profile and reused by `apply_bot.mjs --profile`, so
 * every Greenhouse application then prefills + tracks in his account.
 *
 * Usage: node login_greenhouse.mjs   (log in, then close the window)
 */
import { createRequire } from 'module';
import os from 'os';
const require = createRequire(import.meta.url);
let chromium;
for (const p of ['playwright', os.homedir() + '/Sites/bheng/node_modules/playwright']) {
  try { ({ chromium } = require(p)); break; } catch (_) {}
}
if (!chromium) { console.error('playwright not found'); process.exit(1); }

const profDir = `${os.homedir()}/Sites/jobs/chrome-profile`;
let ctx;
for (const opts of [{ channel: 'chrome', headless: false, args: ['--start-maximized'], viewport: null },
                    { headless: false, args: ['--start-maximized'], viewport: null }]) {
  try { ctx = await chromium.launchPersistentContext(profDir, opts); break; } catch (_) {}
}
if (!ctx) { console.error('could not launch profile'); process.exit(1); }
const page = ctx.pages()[0] || await ctx.newPage();
await page.goto('https://my.greenhouse.io/', { waitUntil: 'domcontentloaded' }).catch(() => {});
console.log('\n>>> Log into MyGreenhouse in this window. When you see your dashboard, CLOSE the window.');
console.log('>>> Your session will be saved to the bot profile and reused for every Greenhouse apply.\n');
const browser = ctx.browser();
await new Promise((resolve) => (browser ? browser.on('disconnected', resolve) : ctx.on('close', resolve)));
console.log('saved - profile is now logged in.');
