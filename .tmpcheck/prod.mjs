import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
const exe = await chromium.executablePath();
const browser = await puppeteer.launch({
  args: [...chromium.args, '--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding'],
  executablePath: exe, headless: 'shell',
  env: { ...process.env, LD_LIBRARY_PATH: '/tmp/al2023/lib' },
  defaultViewport: { width: 1440, height: 900 },
});
const page = await browser.newPage();
const errs = [];
page.on('pageerror', e => errs.push(e.message));
page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
page.on('requestfailed', r => errs.push('REQ FAIL ' + r.url() + ' ' + r.failure()?.errorText));
await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle0', timeout: 60000 });
await new Promise(r => setTimeout(r, 3000));
const st = await page.evaluate(() => ({
  pct: document.getElementById('boot-pct').textContent,
  enter: !document.getElementById('boot-start').classList.contains('hidden'),
  bg: getComputedStyle(document.body).backgroundColor,
  font: getComputedStyle(document.querySelector('.boot-logo')).fontFamily,
  sheets: [...document.styleSheets].map(s => (s.href || 'inline').split('/').pop()),
}));
console.log(JSON.stringify(st));
await page.screenshot({ path: '/home/user/preview-boot.png' });
await page.evaluate(() => document.getElementById('boot-start')?.click());
await new Promise(r => setTimeout(r, 1500));
await page.screenshot({ path: '/home/user/preview-menu.png' });
await page.evaluate(() => document.getElementById('btn-start')?.click());
await new Promise(r => setTimeout(r, 4000));
await page.screenshot({ path: '/home/user/preview-game.png' });
console.log('ERRORS:', errs.slice(0, 6).join('\n') || 'none');
await browser.close();
