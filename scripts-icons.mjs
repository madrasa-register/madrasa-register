// Generates the Android launcher icons and splash screens (open book on teal).
// Run: node scripts-icons.mjs   (uses the bundled Chromium through Playwright)
import { chromium } from 'playwright'
import { readFileSync, writeFileSync } from 'fs'
const COVER = '#0f6e66', GOLD = '#c9973b'
// open book with a gold bookmark, centred at cx,cy, width ~2r
function wheel(cx, cy, r) {
  const k = r / 60
  return `<g transform="translate(${cx},${cy}) scale(${k})">
    <path d="M-50 -26 Q-25 -40 0 -26 Q25 -40 50 -26 V34 Q25 20 0 34 Q-25 20 -50 34 Z" fill="#fff"/>
    <path d="M0 -26 V34" stroke="${COVER}" stroke-width="3"/>
    <g stroke="${COVER}" stroke-opacity="0.35" stroke-width="3" stroke-linecap="round">
      <path d="M-40 -12 Q-25 -18 -10 -12"/><path d="M-40 0 Q-25 -6 -10 0"/><path d="M-40 12 Q-25 6 -10 12"/>
      <path d="M10 -12 Q25 -18 40 -12"/><path d="M10 0 Q25 -6 40 0"/></g>
    <path d="M18 -34 V2 L25 -5 L32 2 V-36" fill="${GOLD}"/></g>`
}
const svg = (w, h, body, bg) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${bg ?? ''}${body}</svg>`
const icon = {
  legacy: svg(512, 512, wheel(256, 256, 170), `<rect width="512" height="512" rx="110" fill="${COVER}"/><rect x="26" y="26" width="460" height="460" rx="90" fill="none" stroke="${GOLD}" stroke-width="10"/>`),
  round: svg(512, 512, wheel(256, 256, 160), `<circle cx="256" cy="256" r="256" fill="${COVER}"/><circle cx="256" cy="256" r="228" fill="none" stroke="${GOLD}" stroke-width="10"/>`),
  fg: svg(432, 432, wheel(216, 216, 120)), // adaptive foreground: 108dp canvas, content inside the 66dp safe zone
  store: svg(512, 512, wheel(256, 256, 180), `<rect width="512" height="512" fill="${COVER}"/>`),
}
const font = readFileSync('node_modules/@fontsource/noto-nastaliq-urdu/files/noto-nastaliq-urdu-arabic-700-normal.woff2').toString('base64')
const splash = (w, h) => {
  const s = Math.min(w, h), r1 = s * 0.24, cy = h * 0.42
  return `<html><head><style>@font-face{font-family:N;src:url(data:font/woff2;base64,${font})}html,body{margin:0}</style></head><body>
  <div style="width:${w}px;height:${h}px;background:linear-gradient(${COVER},#0b5a53);position:relative;overflow:hidden">
  ${svg(w, h, wheel(w / 2, cy, r1))}
  <div dir="rtl" style="position:absolute;left:0;right:0;top:${cy + r1 + s * 0.06}px;text-align:center;color:#fff;font-family:N;font-size:${Math.round(s * 0.075)}px;line-height:2">مدرسہ رجسٹر</div>
  </div></body></html>`
}
const RES = 'android/app/src/main/res'
const dens = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 }
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const shot = async (html, w, h, path, transparent = false) => {
  const p = await b.newPage({ viewport: { width: w, height: h } })
  await p.setContent(html.startsWith('<svg') ? `<html><body style="margin:0;background:transparent">${html.replace(/width="\d+" height="\d+"/, `width="${w}" height="${h}"`)}</body></html>` : html)
  await p.waitForTimeout(150)
  await p.screenshot({ path, omitBackground: transparent })
  await p.close()
}
for (const [d, k] of Object.entries(dens)) {
  await shot(icon.legacy, 48 * k, 48 * k, `${RES}/mipmap-${d}/ic_launcher.png`, true)
  await shot(icon.round, 48 * k, 48 * k, `${RES}/mipmap-${d}/ic_launcher_round.png`, true)
  await shot(icon.fg, 108 * k, 108 * k, `${RES}/mipmap-${d}/ic_launcher_foreground.png`, true)
}
const splashes = { 'drawable': [480, 320], 'drawable-land-mdpi': [480, 320], 'drawable-land-hdpi': [800, 480], 'drawable-land-xhdpi': [1280, 720], 'drawable-land-xxhdpi': [1600, 960], 'drawable-land-xxxhdpi': [1920, 1280],
  'drawable-port-mdpi': [320, 480], 'drawable-port-hdpi': [480, 800], 'drawable-port-xhdpi': [720, 1280], 'drawable-port-xxhdpi': [960, 1600], 'drawable-port-xxxhdpi': [1280, 1920] }
for (const [dir, [w, h]] of Object.entries(splashes)) await shot(splash(w, h), w, h, `${RES}/${dir}/splash.png`)
await shot(icon.store, 512, 512, 'assets/play-store-icon-512.png')
writeFileSync('assets/icon.svg', icon.store)
await b.close()
console.log('icons done')
