/**
 * Renders the advertising creatives.
 *
 *   node scripts/build-ads.mjs          (needs the dev server on 5174)
 *
 * Each campaign is laid out twice, because the reserved box is a different
 * shape on each: 4:1 across a desktop and 4:5 on a phone. A 4:1 banner shown on
 * a phone is either a thumbnail or a crop of its own middle, and neither keeps
 * the words on it readable — so the two are composed separately rather than one
 * being squeezed into the other.
 *
 * Laid out in HTML and photographed, rather than drawn: the type is Thai, it
 * has to wrap and sit on a baseline properly, and the browser already has the
 * font the site uses. The photographs are the advertiser's own, served from
 * `public/ads/`.
 *
 * Output goes to `public/ads/out/`. Those files are the deliverable — they get
 * uploaded through the admin like any other advertisement, and nothing on the
 * site reads them from `public/`.
 */
import { mkdirSync } from 'node:fs'
import { launchBrowser } from './browser.mjs'

const BASE = process.env.BASE ?? 'http://localhost:5174'
const OUT = 'public/ads/out'

const BROWSERS = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
]

/* ---------------- the advertiser's own material ---------------- */

const SRC = {
  banner: '/ads/1650428957.png', // 1800×700, holds the cut-out teacher and the media logos
  logo: '/ads/1791449390899.jpg', // 154×54
  classroom: '/ads/475018637_1597399387648313_9178396331260508012_n.jpg', // 1440×1440
  lesson: '/ads/481988724_1378806233350907_8294891528704807889_n.jpg', // 640×360
  studying: '/ads/487716282_1396430628255134_4386220945687846685_n.jpg', // 1080×1080
  // Portrait, which suits the one placement whose reader is already studying:
  // it is the only creative that has to sit quietly beside a lesson.
  tutor: '/ads/486252563_1392859171945613_3990354534417993764_n.jpg', // 1536×2048
}

/**
 * Learnsbuy's own colours, taken from their logo rather than from the red and
 * black of their existing banner: red on black beside this site's teal reads as
 * a broken page, and the brief was credible and modern. The green is the mark's
 * own, so it is still their brand.
 */
const INK = '#0B1220'
const INK_SOFT = '#141E31'
const GREEN = '#22C58B'
const GREEN_DEEP = '#0E8F63'

/**
 * The strip of broadcaster marks from the advertiser's banner, cropped out of
 * it rather than redrawn: they are other companies' trademarks and the
 * advertiser is the one with permission to use them.
 *
 * The strip sits at roughly x 445–815, y 592–642 of the 1800×700 original.
 */
const MEDIA_STRIP = `
  <div class="media-strip" role="img"
       aria-label="เคยออกสื่อ GMM, True ปลูกปัญญา, ETV และ Dek-D"></div>`

const MEDIA_CSS = `
  .media-strip {
    width: 370px; height: 50px;
    background-image: url('${SRC.banner}');
    background-size: 1800px 700px;
    background-position: -445px -592px;
    background-repeat: no-repeat;
    border-radius: 6px;
  }`

/**
 * A rectangle of a source picture, scaled to cover a box.
 *
 * Written as a positioned `<img>` rather than a background, because the
 * arithmetic is then one scale and two offsets and can be checked by eye
 * against the source.
 */
function crop({ src, sx, sy, sw, sh, w, h, srcW, srcH }) {
  const scale = Math.max(w / sw, h / sh)
  const left = Math.round(-sx * scale + (w - sw * scale) / 2)
  const top = Math.round(-sy * scale)
  return `<div style="position:absolute;inset:0;overflow:hidden">
    <img src="${src}" alt="" style="position:absolute;width:${Math.round(srcW * scale)}px;
      height:${Math.round(srcH * scale)}px;left:${left}px;top:${top}px;max-width:none">
  </div>`
}

/**
 * The teacher, taken from the advertiser's own banner.
 *
 * Only down to his chest, and only right of x=790: below the chest the banner
 * draws its own white copy across his robe, and left of 790 its red wedge
 * reaches in at the top — both would put somebody else's design inside this
 * one.
 */
const teacher = (w, h) =>
  crop({ src: SRC.banner, srcW: 1800, srcH: 700, sx: 790, sy: 28, sw: 478, sh: 430, w, h })

/* ---------------- shared styling ---------------- */

const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+Thai:wght@400;600;700;800;900&display=swap');
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Noto Sans Thai', system-ui, sans-serif; -webkit-font-smoothing: antialiased; }

  .ad { position: relative; overflow: hidden; background: ${INK}; color: #fff; }

  /* A single diagonal, echoing the advertiser's own banner without its red. */
  .ad::before {
    content: ''; position: absolute; inset: 0;
    background: linear-gradient(118deg, ${INK_SOFT} 0%, ${INK_SOFT} 46%, ${INK} 46.2%, ${INK} 100%);
  }
  .ad::after {
    content: ''; position: absolute; inset: 0;
    background: radial-gradient(120% 90% at 8% 10%, rgba(34,197,139,.20) 0%, rgba(34,197,139,0) 58%);
  }
  .in { position: relative; z-index: 2; height: 100%; }

  .logo { height: 34px; width: auto; align-self: flex-start; flex: none; border-radius: 6px; display: block; }

  .kicker {
    display: inline-flex; align-items: center; gap: 8px; align-self: flex-start;
    padding: 6px 14px; border-radius: 999px;
    background: rgba(34,197,139,.14); border: 1px solid rgba(34,197,139,.42);
    color: ${GREEN}; font-size: 15px; font-weight: 700; letter-spacing: .01em;
  }
  .kicker .dot { width: 7px; height: 7px; border-radius: 50%; background: ${GREEN}; }

  h2 { font-weight: 800; letter-spacing: -.01em; line-height: 1.24; }
  .hl { color: ${GREEN}; }
  .sub { color: rgba(255,255,255,.76); line-height: 1.6; font-weight: 400; }

  /* Facts carry the credibility, so they are set as facts: a number and what
     it counts, not a sentence. */
  .facts { display: flex; gap: 26px; }
  .fact { display: flex; flex-direction: column; gap: 2px; }
  .fact b { font-weight: 900; color: #fff; line-height: 1; }
  .fact span { color: rgba(255,255,255,.62); font-weight: 600; }

  .cta {
    display: inline-flex; align-items: center; gap: 9px; align-self: flex-start;
    padding: 0 26px; border-radius: 999px;
    background: linear-gradient(135deg, ${GREEN} 0%, ${GREEN_DEEP} 100%);
    color: #06281C; font-weight: 800; white-space: nowrap;
    box-shadow: 0 10px 26px rgba(34,197,139,.34);
  }
  .site { color: rgba(255,255,255,.5); font-weight: 600; letter-spacing: .02em; }

  .photo { position: absolute; overflow: hidden; background-size: cover; background-position: center top; }
  .photo > div { z-index: 1; }
  /* Fades the photograph into the panel instead of ending on a hard edge. */
  .photo.feather::after {
    content: ''; position: absolute; inset: 0; z-index: 2;
    background: linear-gradient(90deg, ${INK} 0%, rgba(11,18,32,0) 42%);
  }
  ${MEDIA_CSS}
`

/* ---------------- the campaigns ---------------- */

/** Desktop is 1600×400 and mobile 800×1000 — the 4:1 and 4:5 the slot reserves,
 *  at a size that still looks sharp on a dense screen. */
const D = { w: 1600, h: 400 }
const M = { w: 800, h: 1000 }

const ADS = [
  {
    key: 'home-pat',
    name: 'ครูพี่โฮม · PAT 300 เต็ม',
    desktop: `
      <div class="in" style="display:grid;grid-template-columns:1fr 620px;align-items:center;padding:0 0 0 56px">
        <div style="display:flex;flex-direction:column;gap:18px;max-width:760px">
          <img class="logo" src="${SRC.logo}" alt="Learnsbuy">
          <span class="kicker"><span class="dot"></span>ติวภาษาญี่ปุ่น A-Level · PAT</span>
          <h2 style="font-size:40px">ครูพี่โฮม <span class="hl">PAT ญี่ปุ่น 300 เต็ม</span><br>เกียรตินิยมอันดับ 1 เหรียญทอง อักษรฯ จุฬาฯ</h2>
          <div class="facts" style="margin-top:2px">
            <div class="fact"><b style="font-size:30px">24 ปี</b><span style="font-size:14px">ประสบการณ์สอน</span></div>
            <div class="fact"><b style="font-size:30px">300</b><span style="font-size:14px">คะแนนเต็ม PAT ญี่ปุ่น</span></div>
            <div class="fact"><b style="font-size:30px">อันดับ 1</b><span style="font-size:14px">เกียรตินิยมเหรียญทอง</span></div>
          </div>
          <div style="display:flex;align-items:center;gap:22px;margin-top:6px">
            <span class="cta" style="height:48px;font-size:17px">ดูคอร์สติวญี่ปุ่น</span>
            ${MEDIA_STRIP}
          </div>
        </div>
        <div class="photo feather" style="inset:0 0 0 auto;width:620px">${teacher(620, 400)}</div>
      </div>`,
    mobile: `
      <div class="in" style="display:grid;grid-template-rows:520px 1fr">
        <div style="position:relative">
          <div class="photo" style="inset:0">${teacher(800, 470)}</div>
          <div style="position:absolute;inset:auto 0 0 0;height:160px;background:linear-gradient(180deg,rgba(11,18,32,0) 0%,${INK} 86%)"></div>
          <img class="logo" src="${SRC.logo}" alt="Learnsbuy" style="position:absolute;left:36px;top:34px;height:40px">
        </div>
        <div style="display:flex;flex-direction:column;justify-content:center;gap:18px;padding:4px 40px 40px">
          <span class="kicker" style="font-size:16px"><span class="dot"></span>ติวภาษาญี่ปุ่น A-Level · PAT</span>
          <h2 style="font-size:38px">ครูพี่โฮม<br><span class="hl">PAT ญี่ปุ่น 300 เต็ม</span></h2>
          <p class="sub" style="font-size:19px">เกียรตินิยมอันดับ 1 เหรียญทอง อักษรศาสตร์ จุฬาฯ · สอนมากว่า 24 ปี</p>
          ${MEDIA_STRIP}
          <span class="cta" style="height:56px;font-size:20px;align-self:stretch;justify-content:center">ดูคอร์สติวญี่ปุ่น</span>
          <span class="site" style="font-size:15px;text-align:center">learnsbuy.com</span>
        </div>
      </div>`,
  },

  {
    key: 'classroom-24y',
    name: 'ห้องเรียนจริง · 24 ปี',
    desktop: `
      <div class="in" style="display:grid;grid-template-columns:1fr 680px;align-items:center;padding:0 0 0 56px">
        <div style="display:flex;flex-direction:column;gap:18px;max-width:720px">
          <img class="logo" src="${SRC.logo}" alt="Learnsbuy">
          <h2 style="font-size:38px">สอนมา <span class="hl">24 ปี</span> กับนักเรียนหลายรุ่น<br>ที่สอบติดคณะที่ตั้งใจไว้</h2>
          <p class="sub" style="font-size:17px;max-width:600px">ห้องเรียนจริงของ ZA-SHI ครูพี่โฮม — ปูพื้นจากศูนย์ จนทำข้อสอบ A-Level และ PAT ญี่ปุ่นได้เต็มมือ</p>
          <div style="display:flex;align-items:center;gap:20px;margin-top:4px">
            <span class="cta" style="height:48px;font-size:17px">เริ่มเรียนกับครูพี่โฮม</span>
            <span class="site" style="font-size:15px">learnsbuy.com</span>
          </div>
        </div>
        <div class="photo feather" style="inset:0 0 0 auto;width:680px;background-image:url('${SRC.classroom}');background-position:center 72%"></div>
      </div>`,
    mobile: `
      <div class="in" style="display:grid;grid-template-rows:520px 1fr">
        <div style="position:relative">
          <div class="photo" style="inset:0;background-image:url('${SRC.classroom}');background-position:center 64%"></div>
          <div style="position:absolute;inset:auto 0 0 0;height:180px;background:linear-gradient(180deg,rgba(11,18,32,0) 0%,${INK} 88%)"></div>
          <img class="logo" src="${SRC.logo}" alt="Learnsbuy" style="position:absolute;left:36px;top:34px;height:40px">
        </div>
        <div style="display:flex;flex-direction:column;justify-content:center;gap:18px;padding:0 40px 40px">
          <h2 style="font-size:38px">สอนมา <span class="hl">24 ปี</span><br>กับนักเรียนหลายรุ่น</h2>
          <p class="sub" style="font-size:19px">ห้องเรียนจริงของ ZA-SHI ครูพี่โฮม — ปูพื้นจากศูนย์ จนทำข้อสอบ A-Level และ PAT ญี่ปุ่นได้เต็มมือ</p>
          <span class="cta" style="height:56px;font-size:20px;align-self:stretch;justify-content:center">เริ่มเรียนกับครูพี่โฮม</span>
          <span class="site" style="font-size:15px;text-align:center">learnsbuy.com</span>
        </div>
      </div>`,
  },

  {
    key: 'online-lesson',
    name: 'เรียนออนไลน์ · ย้อนหลังได้',
    desktop: `
      <div class="in" style="display:grid;grid-template-columns:1fr 640px;align-items:center;padding:0 0 0 56px">
        <div style="display:flex;flex-direction:column;gap:18px;max-width:700px">
          <img class="logo" src="${SRC.logo}" alt="Learnsbuy">
          <span class="kicker"><span class="dot"></span>เรียนออนไลน์ · ดูย้อนหลังได้</span>
          <h2 style="font-size:38px">ติว A-Level ญี่ปุ่น <span class="hl">ที่ไหนก็ได้</span><br>ดูซ้ำได้จนกว่าจะเข้าใจ</h2>
          <p class="sub" style="font-size:17px;max-width:580px">ไวยากรณ์ คำศัพท์ และเทคนิคทำข้อสอบ อธิบายทีละข้อแบบที่ครูพี่โฮมสอนในห้องจริง</p>
          <div style="display:flex;align-items:center;gap:20px;margin-top:4px">
            <span class="cta" style="height:48px;font-size:17px">ดูตัวอย่างบทเรียน</span>
            <span class="site" style="font-size:15px">learnsbuy.com</span>
          </div>
        </div>
        <div class="photo feather" style="inset:0 0 0 auto;width:640px;background-image:url('${SRC.lesson}');background-position:center"></div>
      </div>`,
    mobile: `
      <div class="in" style="display:grid;grid-template-rows:560px 1fr">
        <div style="position:relative">
          <div class="photo" style="inset:0;background-image:url('${SRC.lesson}');background-position:center"></div>
          <div style="position:absolute;inset:auto 0 0 0;height:170px;background:linear-gradient(180deg,rgba(11,18,32,0) 0%,${INK} 88%)"></div>
          <img class="logo" src="${SRC.logo}" alt="Learnsbuy" style="position:absolute;left:36px;top:34px;height:40px">
        </div>
        <div style="display:flex;flex-direction:column;justify-content:center;gap:18px;padding:8px 40px 40px">
          <span class="kicker" style="font-size:16px"><span class="dot"></span>เรียนออนไลน์ · ดูย้อนหลังได้</span>
          <h2 style="font-size:36px">ติว A-Level ญี่ปุ่น<br><span class="hl">ที่ไหนก็ได้</span></h2>
          <p class="sub" style="font-size:19px">ไวยากรณ์ คำศัพท์ และเทคนิคทำข้อสอบ อธิบายทีละข้อแบบที่ครูพี่โฮมสอนในห้องจริง</p>
          <span class="cta" style="height:56px;font-size:20px;align-self:stretch;justify-content:center">ดูตัวอย่างบทเรียน</span>
          <span class="site" style="font-size:15px;text-align:center">learnsbuy.com</span>
        </div>
      </div>`,
  },

  {
    key: 'intensive',
    name: 'ติวเข้ม · รอบสอบ',
    desktop: `
      <div class="in" style="display:grid;grid-template-columns:1fr 600px;align-items:center;padding:0 0 0 56px">
        <div style="display:flex;flex-direction:column;gap:18px;max-width:740px">
          <img class="logo" src="${SRC.logo}" alt="Learnsbuy">
          <span class="kicker"><span class="dot"></span>รอบติวเข้มก่อนสอบ</span>
          <h2 style="font-size:38px">เหลืออีกไม่กี่เดือน<br><span class="hl">ยังทันถ้าเริ่มวันนี้</span></h2>
          <p class="sub" style="font-size:17px;max-width:600px">ตะลุยโจทย์ A-Level และ PAT ญี่ปุ่นย้อนหลัง พร้อมสรุปไวยากรณ์ที่ออกสอบบ่อยที่สุด</p>
          <div style="display:flex;align-items:center;gap:20px;margin-top:4px">
            <span class="cta" style="height:48px;font-size:17px">ดูตารางติว</span>
            <span class="site" style="font-size:15px">learnsbuy.com</span>
          </div>
        </div>
        <div class="photo feather" style="inset:0 0 0 auto;width:600px;background-image:url('${SRC.studying}');background-position:center 40%"></div>
      </div>`,
    mobile: `
      <div class="in" style="display:grid;grid-template-rows:580px 1fr">
        <div style="position:relative">
          <div class="photo" style="inset:0;background-image:url('${SRC.studying}');background-position:center 42%"></div>
          <div style="position:absolute;inset:auto 0 0 0;height:170px;background:linear-gradient(180deg,rgba(11,18,32,0) 0%,${INK} 88%)"></div>
          <img class="logo" src="${SRC.logo}" alt="Learnsbuy" style="position:absolute;left:36px;top:34px;height:40px">
        </div>
        <div style="display:flex;flex-direction:column;justify-content:center;gap:18px;padding:8px 40px 40px">
          <span class="kicker" style="font-size:16px"><span class="dot"></span>รอบติวเข้มก่อนสอบ</span>
          <h2 style="font-size:36px">เหลืออีกไม่กี่เดือน<br><span class="hl">ยังทันถ้าเริ่มวันนี้</span></h2>
          <p class="sub" style="font-size:19px">ตะลุยโจทย์ A-Level และ PAT ญี่ปุ่นย้อนหลัง พร้อมสรุปไวยากรณ์ที่ออกสอบบ่อยที่สุด</p>
          <span class="cta" style="height:56px;font-size:20px;align-self:stretch;justify-content:center">ดูตารางติว</span>
          <span class="site" style="font-size:15px;text-align:center">learnsbuy.com</span>
        </div>
      </div>`,
  },

  /**
   * The one that runs inside the learning room, under a lesson somebody is in
   * the middle of. So it is the quietest of the five: no countdown, no exam
   * date, no second call to action competing with the lesson. It offers the
   * next thing to a person already studying, which is the only honest pitch to
   * make to somebody mid-sentence.
   */
  {
    key: 'learn-next',
    name: 'เรียนต่อระดับถัดไป',
    desktop: `
      <div class="in" style="display:grid;grid-template-columns:1fr 560px;align-items:center;padding:0 0 0 56px">
        <div style="display:flex;flex-direction:column;gap:16px;max-width:700px">
          <img class="logo" src="${SRC.logo}" alt="Learnsbuy">
          <span class="kicker"><span class="dot"></span>เรียนจบบทนี้แล้วไปต่อ</span>
          <h2 style="font-size:36px">อ่านคันจิออกแล้ว <span class="hl">ขั้นต่อไปคือพูดให้ได้</span></h2>
          <p class="sub" style="font-size:17px;max-width:620px">คอร์สสนทนาและติวสอบของครูพี่โฮม ต่อจากพื้นฐานที่คุณกำลังเรียนอยู่ ดูย้อนหลังได้ไม่จำกัด</p>
          <div style="display:flex;align-items:center;gap:20px;margin-top:4px">
            <span class="cta" style="height:46px;font-size:16px">ดูคอร์สระดับถัดไป</span>
            <span class="site" style="font-size:15px">learnsbuy.com</span>
          </div>
        </div>
        <div class="photo feather" style="inset:0 0 0 auto;width:560px;background-image:url('${SRC.tutor}');background-position:76% 62%"></div>
      </div>`,
    mobile: `
      <div class="in" style="display:grid;grid-template-rows:540px 1fr">
        <div style="position:relative">
          <div class="photo" style="inset:0;background-image:url('${SRC.tutor}');background-position:76% 58%"></div>
          <div style="position:absolute;inset:auto 0 0 0;height:170px;background:linear-gradient(180deg,rgba(11,18,32,0) 0%,${INK} 88%)"></div>
          <img class="logo" src="${SRC.logo}" alt="Learnsbuy" style="position:absolute;left:36px;top:34px;height:40px">
        </div>
        <div style="display:flex;flex-direction:column;justify-content:center;gap:16px;padding:8px 40px 40px">
          <span class="kicker" style="font-size:16px"><span class="dot"></span>เรียนจบบทนี้แล้วไปต่อ</span>
          <h2 style="font-size:35px">อ่านคันจิออกแล้ว<br><span class="hl">ขั้นต่อไปคือพูดให้ได้</span></h2>
          <p class="sub" style="font-size:19px">คอร์สสนทนาและติวสอบของครูพี่โฮม ดูย้อนหลังได้ไม่จำกัด</p>
          <span class="cta" style="height:56px;font-size:20px;align-self:stretch;justify-content:center">ดูคอร์สระดับถัดไป</span>
          <span class="site" style="font-size:15px;text-align:center">learnsbuy.com</span>
        </div>
      </div>`,
  },

]

/* ---------------- rendering ---------------- */

mkdirSync(OUT, { recursive: true })

const browser = await launchBrowser({
  headless: true,
  args: ['--no-sandbox', '--disable-gpu', '--font-render-hinting=none'],
})
const page = await browser.newPage()

async function shoot(markup, { w, h }, file) {
  await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 })
  // Served through the dev server so the photographs in `public/ads/` and the
  // webfont both resolve the way they will on the site.
  await page.goto(`${BASE}/ads/_blank.html`, { waitUntil: 'domcontentloaded' }).catch(() => {})
  await page.setContent(
    `<!doctype html><html lang="th"><head><meta charset="utf-8"><base href="${BASE}/">
     <style>${CSS}</style></head>
     <body><div class="ad" style="width:${w}px;height:${h}px">${markup}</div></body></html>`,
    { waitUntil: 'networkidle0' },
  )
  await page.evaluate(() => document.fonts.ready)
  await new Promise((r) => setTimeout(r, 350))
  await page.screenshot({ path: `${OUT}/${file}`, clip: { x: 0, y: 0, width: w, height: h } })
  console.log(`  ${file}  ${w}×${h}`)
}

for (const ad of ADS) {
  console.log(`\n${ad.name}`)
  await shoot(ad.desktop, D, `${ad.key}-desktop.png`)
  await shoot(ad.mobile, M, `${ad.key}-mobile.png`)
}

await browser.close()
console.log(`\n${ADS.length} campaigns, ${ADS.length * 2} files in ${OUT}\n`)
