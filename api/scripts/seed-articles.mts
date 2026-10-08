/**
 * Demonstration articles for the blog.
 *
 *   npx tsx scripts/seed-articles.mts        write them
 *   npx tsx scripts/seed-articles.mts down   take them away again
 *
 * Every slug starts `demo-`, which is what `down` matches on, so nothing the
 * school writes itself can be swept up by it.
 *
 * The bodies are written the way the admin's editor writes them — headings,
 * lists, a quote, a table, links — because the point of them is to be real
 * enough to lay the page out against. A column of lorem ipsum tells you
 * nothing about whether a table overflows on a phone.
 *
 * Each article is filed under a course category and written by the teacher who
 * teaches it, so the byline and the badge are as real as the rest.
 */
import { eq, like } from 'drizzle-orm'
import { db } from '../src/db/client'
import { categories, posts, users } from '../src/db/schema/index'
import { deleteFile, isStorageConfigured, uploadFile } from '../src/lib/storage'

const WIDTH = 1280
const HEIGHT = 720

interface Seed {
  slug: string
  title: string
  excerpt: string
  /** A category slug from the catalog. */
  category: string
  /** The teacher's account email. */
  author: string
  photoId: string
  /** Days back from today. Spreads them over a few months. */
  daysAgo: number
  /**
   * 'all' for writing that is not about one language — it then shows whichever
   * language the site is being read in. Defaults to Thai.
   */
  locale?: 'th' | 'en' | 'jp' | 'vn' | 'all'
  body: string
}

/* ---------------- the articles ---------------- */

const SEEDS: Seed[] = [
  {
    slug: 'demo-hiragana-in-a-week',
    title: 'จำฮิรางานะให้ครบใน 7 วัน โดยไม่ต้องท่องซ้ำจนเบื่อ',
    excerpt:
      'วิธีแบ่งตัวอักษร 46 ตัวออกเป็นชุดเล็ก ๆ แล้วทบทวนตามจังหวะที่สมองลืมพอดี พร้อมตารางแบ่งวันที่ใช้ได้ทันที',
    category: 'japanese',
    author: 'aiko.tanaka@minna.local',
    photoId: 'photo-1528164344705-47542687000d',
    daysAgo: 4,
    body: `
<p>คนส่วนใหญ่เริ่มเรียนภาษาญี่ปุ่นด้วยการเปิดตารางฮิรางานะทั้ง 46 ตัวพร้อมกัน แล้วท่องจากบนลงล่างวันละรอบ วิธีนี้ได้ผลช้าเพราะสมองไม่ได้ลืมทุกตัวพร้อมกัน ตัวที่หน้าตาเด่นอย่าง <strong>し</strong> หรือ <strong>つ</strong> จำได้ตั้งแต่วันแรก ส่วนตัวที่หน้าคล้ายกันอย่าง <strong>ね ・ れ ・ わ</strong> ต้องเจอซ้ำอีกหลายรอบ</p>

<h2>แบ่งเป็นชุดละ 7 ตัว ไม่ใช่ 46 ตัว</h2>
<p>สิ่งที่เปลี่ยนผลลัพธ์มากที่สุดคือขนาดของชุดที่เรียนต่อวัน ชุดละ 7 ตัวเล็กพอที่จะทบทวนครบใน 10 นาที และเล็กพอที่คุณจะรู้ตัวว่าตัวไหนยังไม่แน่น</p>

<h3>ตารางแบ่งวัน</h3>
<figure class="table"><table>
  <thead><tr><th>วัน</th><th>ชุดใหม่</th><th>ทบทวน</th></tr></thead>
  <tbody>
    <tr><td>1</td><td>あ い う え お</td><td>—</td></tr>
    <tr><td>2</td><td>か き く け こ</td><td>ชุดวันที่ 1</td></tr>
    <tr><td>3</td><td>さ し す せ そ</td><td>ชุดวันที่ 1–2</td></tr>
    <tr><td>4</td><td>た ち つ て と</td><td>ชุดวันที่ 2–3</td></tr>
    <tr><td>5</td><td>な に ぬ ね の</td><td>ชุดวันที่ 1, 3–4</td></tr>
    <tr><td>6</td><td>は ひ ふ へ ほ</td><td>ชุดวันที่ 2, 4–5</td></tr>
    <tr><td>7</td><td>ที่เหลือทั้งหมด</td><td>ทุกชุด</td></tr>
  </tbody>
</table></figure>

<h2>ทบทวนตอนกำลังจะลืม ไม่ใช่ตอนยังจำได้</h2>
<p>การเปิดดูตัวที่เพิ่งท่องไปเมื่อห้านาทีก่อนแทบไม่ช่วยอะไร เพราะสมองยังไม่ได้ออกแรงดึงมันขึ้นมา ช่วงที่คุ้มที่สุดคือตอนที่คุณ <em>เกือบ</em> จำไม่ได้</p>

<blockquote><p>ถ้านึกออกทันทีแปลว่าทบทวนเร็วเกินไป ถ้านึกไม่ออกเลยแปลว่าช้าเกินไป จังหวะที่ดีคือตอนที่ต้องหยุดคิดสักสองวินาที</p></blockquote>

<h2>สามจุดที่คนไทยพลาดบ่อย</h2>
<ol>
  <li><strong>ลำดับขีด</strong> — เขียนผิดลำดับแล้วตัวอักษรจะเบี้ยวเวลาเขียนเร็ว และจะอ่านลายมือคนอื่นยากขึ้นด้วย</li>
  <li><strong>เสียงยาว–สั้น</strong> — おばさん (ป้า) กับ おばあさん (ยาย) ต่างกันแค่เสียงยาว แต่ความหมายคนละคน</li>
  <li><strong>อ่านทับศัพท์ไทย</strong> — เขียนคำอ่านเป็นภาษาไทยกำกับไว้ช่วยได้ในสัปดาห์แรก แต่ถ้าติดนานกว่านั้นจะกลายเป็นการอ่านไทยแทนที่จะอ่านญี่ปุ่น</li>
</ol>

<h2>เครื่องมือที่ใช้จริงแค่สองอย่าง</h2>
<ul>
  <li>กระดาษกับปากกา สำหรับฝึกลำดับขีด — เขียนเองช้ากว่าแตะหน้าจอ แต่จำได้นานกว่า</li>
  <li>แอปแฟลชการ์ดที่มีระบบทบทวนตามเวลา สำหรับทบทวนระหว่างวัน</li>
</ul>

<p>ครบเจ็ดวันแล้วอย่าเพิ่งข้ามไปคาตาคานะทันที ใช้อีกสองสามวันอ่านคำง่าย ๆ ที่ประกอบจากตัวที่เรียนไปแล้ว เช่น ชื่ออาหารหรือชื่อสถานี ให้การอ่านกลายเป็นเรื่องอัตโนมัติก่อน</p>
`,
  },
  {
    slug: 'demo-jlpt-n5-study-plan',
    title: 'วางแผนอ่าน JLPT N5 ใน 3 เดือน สำหรับคนทำงาน',
    excerpt:
      'แผนอ่านหนังสือสอบที่ออกแบบจากเวลาว่างจริงของคนทำงาน วันละ 40 นาที เสาร์อาทิตย์เพิ่มอีกนิดหน่อย',
    category: 'japanese-jlpt',
    author: 'aiko.tanaka@minna.local',
    photoId: 'photo-1434030216411-0b793f4b4173',
    daysAgo: 11,
    body: `
<p>ข้อสอบ N5 ไม่ได้ยาก แต่คนทำงานส่วนใหญ่สอบไม่ผ่านเพราะอ่านไม่ทัน ไม่ใช่เพราะอ่านไม่เข้าใจ แผนข้างล่างนี้ตั้งอยู่บนเวลาว่างที่มีจริง คือวันธรรมดาวันละ 40 นาที และเสาร์อาทิตย์วันละชั่วโมงครึ่ง</p>

<h2>สิ่งที่ข้อสอบวัดจริง ๆ</h2>
<figure class="table"><table>
  <thead><tr><th>ส่วน</th><th>เวลา</th><th>สิ่งที่ต้องเตรียม</th></tr></thead>
  <tbody>
    <tr><td>คำศัพท์และตัวอักษร</td><td>20 นาที</td><td>ศัพท์ประมาณ 800 คำ · คันจิ 100 ตัว</td></tr>
    <tr><td>ไวยากรณ์และการอ่าน</td><td>40 นาที</td><td>รูปประโยคพื้นฐาน · อ่านข้อความสั้น</td></tr>
    <tr><td>การฟัง</td><td>30 นาที</td><td>บทสนทนาในชีวิตประจำวัน</td></tr>
  </tbody>
</table></figure>

<h2>เดือนที่ 1 — ปูพื้นให้ครบก่อน</h2>
<p>อย่าเพิ่งแตะข้อสอบเก่าในเดือนแรก ใช้เวลาทั้งเดือนไปกับตัวอักษรและรูปประโยคพื้นฐาน เป้าหมายคืออ่านประโยคสั้นได้โดยไม่ต้องหยุดแปลทีละคำ</p>
<ul>
  <li>สัปดาห์ที่ 1–2: ฮิรางานะ คาตาคานะ ให้คล่องถึงขั้นอ่านป้ายได้</li>
  <li>สัปดาห์ที่ 3–4: รูปประโยค です / ます และคำช่วยพื้นฐาน は を に で</li>
</ul>

<h2>เดือนที่ 2 — เพิ่มคำศัพท์และเริ่มฟัง</h2>
<p>ช่วงนี้คือช่วงที่คนเลิกกลางคันมากที่สุด เพราะศัพท์เยอะและยังไม่เห็นความคืบหน้าชัด วิธีที่ช่วยได้คือเปลี่ยนจากการท่องศัพท์เดี่ยว ๆ มาเป็นการจำทั้งประโยค</p>

<blockquote><p>จำคำว่า「駅」คำเดียวแล้วมักลืม แต่จำ「駅はどこですか」ทั้งประโยคแล้วได้ทั้งคำศัพท์ ไวยากรณ์ และประโยคที่ใช้ได้จริงไปพร้อมกัน</p></blockquote>

<h2>เดือนที่ 3 — จับเวลาทุกครั้ง</h2>
<p>เดือนสุดท้ายให้ทำข้อสอบเก่าอย่างน้อยสัปดาห์ละชุด และ<strong>จับเวลาเสมอ</strong> ถ้าทำโดยไม่จับเวลา คุณกำลังฝึกสิ่งที่ไม่ตรงกับสิ่งที่จะเจอในห้องสอบ</p>
<ol>
  <li>ทำครบทั้งชุดรวดเดียว ไม่พัก</li>
  <li>ตรวจคำตอบ แล้วจดเฉพาะข้อที่ผิด <em>พร้อมเหตุผลว่าทำไมถึงผิด</em></li>
  <li>สัปดาห์ถัดไปทำชุดใหม่ แล้วย้อนดูเฉพาะรายการที่จดไว้</li>
</ol>

<h2>หนึ่งสัปดาห์ก่อนสอบ</h2>
<p>อย่าเริ่มเนื้อหาใหม่ ใช้เวลาที่เหลือทบทวนสิ่งที่จดไว้ว่าผิดบ่อย และนอนให้พอ การฟังเป็นส่วนที่ได้รับผลจากความง่วงมากที่สุด</p>
`,
  },
  {
    slug: 'demo-keigo-at-work',
    title: 'เคโกะในที่ทำงาน: 6 ประโยคที่ใช้ได้ตั้งแต่วันแรก',
    excerpt:
      'ไม่ต้องรอจำระบบเคโกะทั้งหมดก่อนถึงจะพูดได้ เริ่มจากหกประโยคที่เจอทุกวันในออฟฟิศญี่ปุ่น',
    category: 'japanese-business',
    author: 'kenji.sato@minna.local',
    photoId: 'photo-1552664730-d307ca884978',
    daysAgo: 19,
    body: `
<p>เคโกะเป็นเรื่องที่คนเรียนภาษาญี่ปุ่นกลัวมากที่สุด เพราะตำราส่วนใหญ่อธิบายเป็นระบบทั้งก้อน ทั้ง 尊敬語 謙譲語 และ 丁寧語 พร้อมตารางผันยาวสองหน้า แต่ในออฟฟิศจริง คุณจะใช้ประโยคซ้ำ ๆ ไม่กี่ประโยคตลอดทั้งวัน</p>

<h2>หกประโยคที่ใช้ทุกวัน</h2>
<ol>
  <li><strong>お疲れさまです</strong> — ใช้ทักทายเพื่อนร่วมงานได้ทั้งวัน ตอนเจอหน้า ตอนเดินสวน ตอนกลับบ้าน</li>
  <li><strong>よろしくお願いします</strong> — ปิดท้ายการขอความช่วยเหลือ อีเมล และการแนะนำตัว</li>
  <li><strong>承知しました</strong> — "รับทราบ" ที่ใช้กับหัวหน้าและลูกค้าได้</li>
  <li><strong>確認いたします</strong> — "ขอตรวจสอบก่อน" ซื้อเวลาได้อย่างสุภาพเมื่อยังตอบไม่ได้</li>
  <li><strong>申し訳ございません</strong> — ขอโทษในระดับที่ใช้กับลูกค้าได้</li>
  <li><strong>お先に失礼します</strong> — บอกลาเมื่อกลับก่อนคนอื่น</li>
</ol>

<h2>ข้อผิดพลาดที่คนไทยเจอบ่อยที่สุด</h2>
<p>คือการใช้ <strong>尊敬語</strong> กับการกระทำของตัวเอง ซึ่งฟังแล้วเหมือนกำลังยกย่องตัวเอง</p>

<figure class="table"><table>
  <thead><tr><th>สถานการณ์</th><th>ผิด</th><th>ถูก</th></tr></thead>
  <tbody>
    <tr><td>ฉันจะดูเอกสาร</td><td>ご覧になります</td><td>拝見します</td></tr>
    <tr><td>ฉันจะไปหา</td><td>いらっしゃいます</td><td>伺います</td></tr>
    <tr><td>ฉันทราบแล้ว</td><td>ご存じです</td><td>存じております</td></tr>
  </tbody>
</table></figure>

<blockquote><p>หลักจำง่าย: ยกคนอื่นขึ้นด้วย 尊敬語 ถ่อมตัวเองลงด้วย 謙譲語 ถ้าไม่แน่ใจว่าประโยคนั้นพูดถึงใคร ให้ถามตัวเองว่า "ใครเป็นคนทำ"</p></blockquote>

<h2>อีเมลฉบับแรกของคุณ</h2>
<p>อีเมลธุรกิจญี่ปุ่นมีโครงที่ตายตัวมาก ซึ่งเป็นข้อดีสำหรับคนเริ่มต้น เพราะคุณลอกโครงแล้วเปลี่ยนแค่เนื้อหาตรงกลางได้</p>
<ul>
  <li>บรรทัดแรก: ชื่อบริษัทและชื่อผู้รับ</li>
  <li>บรรทัดที่สอง: いつもお世話になっております</li>
  <li>แนะนำตัว: บริษัทของคุณ แล้วตามด้วยชื่อ</li>
  <li>เนื้อหา: สั้น ตรงประเด็น หนึ่งเรื่องต่อหนึ่งย่อหน้า</li>
  <li>ปิดท้าย: よろしくお願いいたします</li>
</ul>

<p>เริ่มจากหกประโยคนี้ก่อน แล้วค่อยเพิ่มทีละประโยคเมื่อเจอสถานการณ์ใหม่ จะเร็วกว่าการนั่งท่องตารางผันให้ครบก่อนพูด</p>
`,
  },
  {
    slug: 'demo-kanji-radicals',
    title: 'อ่านคันจิที่ไม่เคยเห็นให้พอเดาได้ ด้วยการแยกส่วนประกอบ',
    excerpt:
      'คันจิส่วนใหญ่ประกอบจากชิ้นส่วนเดิมที่ใช้ซ้ำ รู้จักชิ้นส่วนสัก 40 ตัวแล้วตัวที่ไม่เคยเห็นจะเดาได้',
    category: 'japanese-kanji',
    author: 'aiko.tanaka@minna.local',
    photoId: 'photo-1546410531-bb4caa6b424d',
    daysAgo: 27,
    body: `
<p>คันจิ 2,136 ตัวในรายการที่ใช้ในชีวิตประจำวันฟังดูน่ากลัว จนกระทั่งคุณรู้ว่าทั้งหมดนั้นประกอบขึ้นจากชิ้นส่วนไม่ถึง 300 ชิ้น และชิ้นที่เจอบ่อยจริง ๆ มีราวสี่สิบชิ้น</p>

<h2>ชิ้นส่วนบอกความหมาย</h2>
<p>คันจิที่เกี่ยวกับน้ำมักมี 氵 อยู่ด้านซ้าย เช่น 海 (ทะเล) river 川 ไม่ใช่ แต่ 泳 (ว่ายน้ำ) และ 洗 (ล้าง) ใช่ เมื่อเห็นตัวที่ไม่รู้จักแต่มี 氵 คุณเดาได้ทันทีว่าน่าจะเกี่ยวกับของเหลว</p>

<figure class="table"><table>
  <thead><tr><th>ชิ้นส่วน</th><th>ความหมาย</th><th>ตัวอย่าง</th></tr></thead>
  <tbody>
    <tr><td>氵</td><td>น้ำ</td><td>海 泳 洗 酒</td></tr>
    <tr><td>木</td><td>ต้นไม้ ไม้</td><td>林 森 校 机</td></tr>
    <tr><td>言</td><td>คำพูด</td><td>話 語 読 説</td></tr>
    <tr><td>心 / 忄</td><td>ใจ ความรู้สึก</td><td>思 悲 怖 快</td></tr>
    <tr><td>手 / 扌</td><td>มือ การกระทำ</td><td>持 押 投 指</td></tr>
  </tbody>
</table></figure>

<h2>ชิ้นส่วนบอกเสียง</h2>
<p>ที่คนมักไม่ได้สอนคือชิ้นส่วนจำนวนมากบอก <em>เสียงอ่าน</em> ด้วย ไม่ใช่แค่ความหมาย ตัวอย่างที่ชัดที่สุดคือ 青 ซึ่งอ่านว่า セイ</p>
<ul>
  <li>晴 (แจ่มใส) — セイ</li>
  <li>清 (สะอาด) — セイ</li>
  <li>精 (ละเอียด) — セイ</li>
  <li>請 (ร้องขอ) — セイ</li>
</ul>
<p>เจอตัวใหม่ที่มี 青 อยู่ข้างใน เดาไว้ก่อนว่าอ่าน セイ แล้วถูกบ่อยกว่าผิด</p>

<blockquote><p>การเดาที่มีหลักดีกว่าการจำแบบไม่มีหลัก ถึงเดาผิดคุณก็จำตัวนั้นได้แม่นขึ้น เพราะได้คิดกับมันไปแล้วรอบหนึ่ง</p></blockquote>

<h2>เริ่มยังไง</h2>
<ol>
  <li>เรียนชิ้นส่วนที่เจอบ่อยที่สุด 40 ชิ้นก่อน ใช้เวลาประมาณสองสัปดาห์</li>
  <li>เวลาเจอคันจิใหม่ ให้แยกส่วนก่อนเสมอ อย่าจำเป็นภาพรวมทั้งตัว</li>
  <li>จดไว้ว่าตัวนี้ประกอบจากอะไร แล้วเล่าเป็นเรื่องสั้น ๆ ให้ตัวเองฟัง</li>
</ol>
<p>เรื่องที่แต่งเองจำได้ดีกว่าเรื่องที่อ่านจากหนังสือ เพราะมันผูกกับสิ่งที่คุณรู้อยู่แล้ว</p>
`,
  },
  {
    slug: 'demo-english-small-talk',
    title: 'คุยเล่นภาษาอังกฤษให้ไม่เงียบ: 5 คำถามที่ต่อบทสนทนาได้เสมอ',
    excerpt: 'ปัญหาของคนไทยส่วนใหญ่ไม่ใช่ไวยากรณ์ แต่คือไม่รู้จะพูดอะไรต่อหลังจากตอบคำถามแรกจบ',
    category: 'english-conversation',
    author: 'sarah.whitfield@minna.local',
    photoId: 'photo-1543269865-cbf427effbad',
    daysAgo: 33,
    body: `
<p>บทสนทนาภาษาอังกฤษของคนไทยมักจบลงภายในสามประโยค ไม่ใช่เพราะพูดผิด แต่เพราะตอบแบบปิด คำถามว่า "Did you have a good weekend?" ได้คำตอบว่า "Yes" แล้วก็เงียบ</p>

<h2>ปัญหาอยู่ที่คำตอบ ไม่ใช่คำถาม</h2>
<p>วิธีแก้ที่ง่ายที่สุดคือเติมข้อมูลหนึ่งอย่างเสมอ แม้ไม่มีใครถาม</p>

<figure class="table"><table>
  <thead><tr><th>คำถาม</th><th>คำตอบที่ทำให้เงียบ</th><th>คำตอบที่ไปต่อได้</th></tr></thead>
  <tbody>
    <tr><td>How was your weekend?</td><td>Good.</td><td>Good — I finally tried that ramen place near the office.</td></tr>
    <tr><td>Do you like your job?</td><td>Yes.</td><td>Yeah, mostly the people. The hours are rough though.</td></tr>
    <tr><td>Have you been to Japan?</td><td>No.</td><td>Not yet — it is the reason I started studying, actually.</td></tr>
  </tbody>
</table></figure>

<h2>ห้าคำถามที่ใช้ได้กับเกือบทุกคน</h2>
<ol>
  <li><strong>What have you been up to lately?</strong> — กว้างกว่า "How are you" และได้คำตอบที่ยาวกว่า</li>
  <li><strong>How did you get into that?</strong> — ใช้ต่อได้ทันทีเมื่อเขาเล่าเรื่องงานหรืองานอดิเรก</li>
  <li><strong>What is that like?</strong> — ชวนให้เล่าต่อโดยไม่ต้องรู้เรื่องนั้นมาก่อน</li>
  <li><strong>Have you always lived here?</strong> — เปิดเรื่องบ้านเกิด ซึ่งคนส่วนใหญ่อยากเล่า</li>
  <li><strong>What are you looking forward to?</strong> — เปลี่ยนบทสนทนาจากอดีตมาเป็นอนาคต ซึ่งมักสดใสกว่า</li>
</ol>

<blockquote><p>คำถามที่ดีไม่ใช่คำถามที่ฉลาด แต่คือคำถามที่อีกฝ่ายตอบได้ยาวโดยไม่ต้องคิดนาน</p></blockquote>

<h2>สิ่งที่ไม่ต้องกังวล</h2>
<ul>
  <li><strong>สำเนียง</strong> — เจ้าของภาษาฟังสำเนียงที่หลากหลายทุกวัน และแทบไม่สังเกต</li>
  <li><strong>ไวยากรณ์ตอนพูด</strong> — เจ้าของภาษาเองก็พูดผิดไวยากรณ์ตลอดเวลา</li>
  <li><strong>ความเงียบสั้น ๆ</strong> — การหยุดคิดสองวินาทีเป็นเรื่องปกติในทุกภาษา</li>
</ul>

<p>สิ่งที่ควรกังวลมีอย่างเดียวคือ การตอบสั้นจนอีกฝ่ายไม่รู้จะถามอะไรต่อ</p>
`,
  },
  {
    slug: 'demo-ielts-writing-task-2',
    title: 'IELTS Writing Task 2: โครงสร้างสี่ย่อหน้าที่ใช้ได้กับทุกคำถาม',
    excerpt: 'ไม่ต้องคิดโครงใหม่ทุกครั้ง ใช้โครงเดิมแล้วเอาเวลาที่เหลือไปคิดเนื้อหาแทน',
    category: 'english-exam',
    author: 'sarah.whitfield@minna.local',
    photoId: 'photo-1455390582262-044cdead277a',
    daysAgo: 41,
    body: `
<p>ผู้สอบส่วนใหญ่เสียเวลาสิบนาทีแรกไปกับการคิดว่าจะวางโครงเรียงความอย่างไร ทั้งที่เวลาทั้งหมดมีแค่สี่สิบนาที วิธีแก้คือเตรียมโครงไว้ล่วงหน้าแล้วใช้โครงเดิมทุกครั้ง</p>

<h2>สี่ย่อหน้า</h2>
<figure class="table"><table>
  <thead><tr><th>ย่อหน้า</th><th>ความยาว</th><th>หน้าที่</th></tr></thead>
  <tbody>
    <tr><td>เปิด</td><td>2 ประโยค</td><td>เขียนคำถามใหม่ด้วยคำของตัวเอง แล้วบอกจุดยืน</td></tr>
    <tr><td>เหตุผลที่ 1</td><td>5–6 ประโยค</td><td>ประเด็นหลัก + อธิบาย + ตัวอย่าง</td></tr>
    <tr><td>เหตุผลที่ 2</td><td>5–6 ประโยค</td><td>ประเด็นหลัก + อธิบาย + ตัวอย่าง</td></tr>
    <tr><td>ปิด</td><td>2 ประโยค</td><td>ย้ำจุดยืน ไม่เพิ่มประเด็นใหม่</td></tr>
  </tbody>
</table></figure>

<h2>จุดยืนต้องชัดตั้งแต่ย่อหน้าแรก</h2>
<p>คะแนน Task Response เสียมากที่สุดเมื่อกรรมการอ่านจบแล้วยังไม่แน่ใจว่าคุณเห็นด้วยหรือไม่เห็นด้วย การเขียนแบบ "มีทั้งข้อดีและข้อเสีย" โดยไม่สรุปคือการไม่ตอบคำถาม</p>

<blockquote><p>เลือกข้างที่คุณหาตัวอย่างได้ง่ายกว่า ไม่ใช่ข้างที่คุณเชื่อจริง ๆ นี่คือข้อสอบวัดภาษา ไม่ใช่การแสดงความคิดเห็น</p></blockquote>

<h2>ตัวอย่างต้องเฉพาะเจาะจง</h2>
<p>ประโยคอย่าง "Many studies have shown…" ไม่ได้คะแนน เพราะกรรมการเห็นประโยคนี้วันละร้อยครั้ง สิ่งที่ได้คะแนนคือตัวอย่างที่มีรายละเอียด แม้จะเป็นตัวอย่างจากชีวิตคุณเอง</p>
<ul>
  <li>อ่อน: Public transport reduces traffic.</li>
  <li>ดี: After the Bangkok metro extended to Lak Song, my own commute dropped from ninety minutes to forty.</li>
</ul>

<h2>แบ่งเวลาสี่สิบนาที</h2>
<ol>
  <li><strong>5 นาที</strong> — อ่านคำถาม ขีดเส้นใต้คำสำคัญ เลือกข้าง จดประเด็นสองข้อ</li>
  <li><strong>30 นาที</strong> — เขียนรวดเดียว ไม่หยุดแก้</li>
  <li><strong>5 นาที</strong> — อ่านทวนหาคำผิดและประโยคที่ขาดประธาน</li>
</ol>
<p>ห้านาทีสุดท้ายสำคัญกว่าที่คิด ความผิดพลาดที่พบบ่อยที่สุดคือลืม s ท้ายกริยาและลืม article ซึ่งแก้ได้หมดในรอบอ่านทวน</p>
`,
  },
  {
    slug: 'demo-chinese-tones',
    title: 'วรรณยุกต์จีนสำหรับคนไทย: สิ่งที่ง่ายกว่าที่คิด และสิ่งที่ยากกว่า',
    excerpt:
      'คนไทยได้เปรียบเรื่องวรรณยุกต์อยู่แล้ว แต่มีสองจุดที่ความคุ้นเคยกับภาษาไทยกลับทำให้ออกเสียงผิด',
    category: 'chinese',
    author: 'li.wei@minna.local',
    photoId: 'photo-1545048702-79362596cdc9',
    daysAgo: 52,
    body: `
<p>คนไทยเรียนวรรณยุกต์จีนได้เร็วกว่าคนยุโรปมาก เพราะภาษาไทยมีวรรณยุกต์อยู่แล้ว สมองคุณคุ้นเคยกับการที่ระดับเสียงเปลี่ยนความหมายของคำ ซึ่งเป็นแนวคิดที่คนพูดภาษาอังกฤษต้องใช้เวลาหลายเดือนกว่าจะยอมรับ</p>

<h2>สี่เสียง เทียบกับภาษาไทยคร่าว ๆ</h2>
<figure class="table"><table>
  <thead><tr><th>เสียง</th><th>สัญลักษณ์</th><th>ใกล้เคียงกับไทย</th></tr></thead>
  <tbody>
    <tr><td>เสียง 1</td><td>mā</td><td>เสียงสามัญ แต่ลากยาวและสูงกว่า</td></tr>
    <tr><td>เสียง 2</td><td>má</td><td>เสียงจัตวา</td></tr>
    <tr><td>เสียง 3</td><td>mǎ</td><td>ไม่มีในไทย — ลงแล้วขึ้น</td></tr>
    <tr><td>เสียง 4</td><td>mà</td><td>เสียงโท ตกเร็วและหนักแน่น</td></tr>
  </tbody>
</table></figure>

<h2>จุดที่ยากจริง ๆ มีสองจุด</h2>
<h3>1. เสียงสามเวลาอยู่ติดกัน</h3>
<p>เมื่อเสียงสามสองตัวอยู่ติดกัน ตัวแรกจะกลายเป็นเสียงสอง เช่น 你好 เขียน nǐ hǎo แต่พูดว่า ní hǎo กฎนี้ไม่มีข้อยกเว้น และคนไทยมักพูดผิดเพราะอ่านตามตัวเขียน</p>

<h3>2. เสียงกลืนในประโยคยาว</h3>
<p>ในภาษาไทย วรรณยุกต์ของแต่ละพยางค์ค่อนข้างคงที่แม้พูดเร็ว แต่ในภาษาจีน พยางค์ที่ไม่เน้นจะสั้นลงและกลางลงมาก</p>

<blockquote><p>ฟังเจ้าของภาษาพูดประโยคยาวแล้วคุณจะพบว่าเสียงไม่ได้ชัดเท่าในแบบฝึกหัด นั่นไม่ใช่เพราะเขาพูดผิด แต่เพราะแบบฝึกหัดพูดช้ากว่าชีวิตจริง</p></blockquote>

<h2>วิธีฝึกที่ได้ผลกว่าการท่องทีละพยางค์</h2>
<ul>
  <li><strong>ฝึกเป็นคู่คำ</strong> — ฝึก 买 mǎi (ซื้อ) คู่กับ 卖 mài (ขาย) จะจำได้ดีกว่าฝึกทีละตัว</li>
  <li><strong>อัดเสียงตัวเอง</strong> — คุณจะได้ยินสิ่งที่คุณไม่ได้ยินตอนพูด</li>
  <li><strong>พูดตามทันที (shadowing)</strong> — เปิดเสียงเจ้าของภาษาแล้วพูดตามโดยช้ากว่าครึ่งวินาที ไม่ต้องรอให้จบประโยค</li>
</ul>

<p>สองสัปดาห์แรกจะรู้สึกว่าเสียงสามยากมาก หลังจากนั้นมันจะกลายเป็นเรื่องอัตโนมัติ เหมือนที่คุณไม่เคยต้องคิดเลยว่าคำว่า "เสือ" กับ "เสื้อ" ต่างกันอย่างไร</p>
`,
  },
  {
    slug: 'demo-vietnamese-first-month',
    title: 'เรียนเวียดนามเดือนแรก: เริ่มจากอะไรก่อนถึงจะไม่ท้อ',
    excerpt: 'ภาษาเวียดนามใช้ตัวอักษรละติน ซึ่งทำให้ดูง่ายกว่าความจริง เดือนแรกควรลงแรงตรงไหน',
    category: 'vietnamese',
    author: 'nguyen.thi.mai@minna.local',
    photoId: 'photo-1583417319070-4a69db38a482',
    daysAgo: 60,
    body: `
<p>ข้อดีอย่างแรกของภาษาเวียดนามคือใช้ตัวอักษรละติน คุณอ่านป้ายได้ตั้งแต่วันแรกโดยไม่ต้องเรียนตัวอักษรใหม่ ข้อเสียคือสิ่งนี้ทำให้ประเมินความยากต่ำเกินไป เพราะสิ่งที่ยากจริงคือเสียง ไม่ใช่ตัวเขียน</p>

<h2>สามสิ่งที่ควรทำในเดือนแรก</h2>
<ol>
  <li><strong>เรียนเครื่องหมายเสียงให้ครบทั้งหก</strong> ก่อนจะเรียนคำศัพท์เยอะ ๆ</li>
  <li><strong>เลือกสำเนียงเดียว</strong> — เหนือ (ฮานอย) หรือใต้ (โฮจิมินห์) อย่าสลับไปมา</li>
  <li><strong>ฝึกสระคู่</strong> ที่ภาษาไทยไม่มี เช่น ư และ ơ ซึ่งคนไทยมักออกเสียงรวบเป็นเสียงเดียว</li>
</ol>

<h2>หกเสียง</h2>
<figure class="table"><table>
  <thead><tr><th>เสียง</th><th>ตัวอย่าง</th><th>ความหมาย</th></tr></thead>
  <tbody>
    <tr><td>ไม่มีเครื่องหมาย</td><td>ma</td><td>ผี</td></tr>
    <tr><td>huyền (ขีดลง)</td><td>mà</td><td>แต่</td></tr>
    <tr><td>sắc (ขีดขึ้น)</td><td>má</td><td>แม่</td></tr>
    <tr><td>hỏi (เครื่องหมายคำถาม)</td><td>mả</td><td>หลุมศพ</td></tr>
    <tr><td>ngã (ตัวหนอน)</td><td>mã</td><td>ม้า</td></tr>
    <tr><td>nặng (จุดล่าง)</td><td>mạ</td><td>ต้นกล้า</td></tr>
  </tbody>
</table></figure>

<blockquote><p>คนไทยได้เปรียบตรงที่เข้าใจอยู่แล้วว่าเสียงเปลี่ยนความหมาย สิ่งที่ต้องปรับคือจำนวนเสียงที่มากกว่า และเสียง ngã ซึ่งไม่มีคู่เทียบในภาษาไทยเลย</p></blockquote>

<h2>คำที่คล้ายภาษาไทยจนน่าตกใจ</h2>
<p>ทั้งสองภาษายืมคำจากจีนมาเหมือนกัน จึงมีคำที่ฟังคุ้นหูอยู่ไม่น้อย</p>
<ul>
  <li>quốc gia — ประเทศ (เทียบ "ชาติ" ในบริบทเดียวกัน)</li>
  <li>gia đình — ครอบครัว</li>
  <li>học sinh — นักเรียน</li>
  <li>bác sĩ — หมอ</li>
</ul>
<p>คำกลุ่มนี้ช่วยให้เดือนแรกผ่านไปได้เร็ว แต่อย่าชะล่าใจ เพราะคำที่ใช้บ่อยที่สุดในชีวิตประจำวันส่วนใหญ่เป็นคำเวียดนามแท้ ซึ่งไม่เหมือนภาษาไทยเลย</p>
`,
  },
  {
    slug: 'demo-how-long-to-learn',
    title: 'ใช้เวลานานแค่ไหนถึงจะพูดได้ คำตอบที่ตรงไปตรงมา',
    excerpt:
      'คำถามที่ถูกถามบ่อยที่สุด และคำตอบที่ขึ้นอยู่กับสองอย่างซึ่งไม่ใช่พรสวรรค์',
    category: 'japanese-conversation',
    author: 'kenji.sato@minna.local',
    photoId: 'photo-1522202176988-66273c2fd55f',
    daysAgo: 74,
    locale: 'all',
    body: `
<p>คำถามนี้ถูกถามในวันแรกของทุกคอร์ส และคำตอบที่ซื่อสัตย์ที่สุดคือ "ขึ้นอยู่กับว่าคุณหมายถึงพูดได้ระดับไหน" ซึ่งฟังดูเหมือนเลี่ยงตอบ แต่มันสำคัญจริง ๆ</p>

<h2>สามระดับที่คนมักเรียกรวมกันว่า "พูดได้"</h2>
<figure class="table"><table>
  <thead><tr><th>ระดับ</th><th>ทำอะไรได้</th><th>ชั่วโมงเรียนโดยประมาณ</th></tr></thead>
  <tbody>
    <tr><td>เอาตัวรอด</td><td>สั่งอาหาร ถามทาง เช็กอินโรงแรม</td><td>60–100</td></tr>
    <tr><td>คุยเล่นได้</td><td>แนะนำตัว เล่าเรื่องตัวเอง เข้าใจคำตอบ</td><td>250–400</td></tr>
    <tr><td>ใช้ทำงานได้</td><td>ประชุม อ่านอีเมล อธิบายปัญหา</td><td>900–1,500</td></tr>
  </tbody>
</table></figure>

<p>ตัวเลขเหล่านี้เป็นชั่วโมงที่ <em>ใช้ภาษาจริง</em> ไม่ใช่ชั่วโมงที่นั่งอยู่ในห้องเรียน การฟังครูอธิบายไวยากรณ์เป็นภาษาไทยหนึ่งชั่วโมงไม่ได้นับเต็มหนึ่งชั่วโมง</p>

<h2>สองอย่างที่กำหนดความเร็วจริง ๆ</h2>
<h3>1. ความสม่ำเสมอ ไม่ใช่ความหนัก</h3>
<p>วันละ 30 นาทีทุกวันเร็วกว่าสัปดาห์ละ 4 ชั่วโมงรวดเดียว ทั้งที่จำนวนชั่วโมงใกล้เคียงกัน เพราะภาษาสร้างจากการทบทวนซ้ำในช่วงที่กำลังจะลืม ไม่ใช่จากการอัดครั้งเดียว</p>

<h3>2. เวลาที่ใช้พูดจริง</h3>
<p>คนที่เรียนมาสองปีแต่ไม่เคยพูดกับใครเลย มักพูดได้แย่กว่าคนที่เรียนแปดเดือนแต่คุยกับเจ้าของภาษาสัปดาห์ละครั้ง</p>

<blockquote><p>พรสวรรค์มีผลน้อยกว่าที่คนคิดมาก สิ่งที่ดูเหมือนพรสวรรค์มักเป็นชั่วโมงที่คนอื่นไม่เห็น</p></blockquote>

<h2>สิ่งที่ควรคาดหวังในแต่ละช่วง</h2>
<ul>
  <li><strong>เดือนที่ 1–2</strong> — รู้สึกว่าก้าวหน้าเร็วมาก เพราะทุกอย่างเป็นของใหม่</li>
  <li><strong>เดือนที่ 3–6</strong> — ช่วงที่คนเลิกมากที่สุด เพราะรู้เยอะพอจะเห็นว่ายังไม่รู้อีกเท่าไหร่</li>
  <li><strong>เดือนที่ 7 เป็นต้นไป</strong> — ความก้าวหน้ากลับมาเห็นชัดอีกครั้ง เพราะเริ่มใช้ภาษาเพื่อทำอย่างอื่นได้แล้ว</li>
</ul>

<p>ถ้าคุณอยู่ในเดือนที่สี่แล้วรู้สึกว่าไม่ไปไหนเลย นั่นไม่ใช่สัญญาณว่าคุณไม่เหมาะกับภาษานี้ มันคือสัญญาณว่าคุณผ่านช่วงง่ายมาแล้ว</p>
`,
  },
]

/* ---------------- running it ---------------- */

const down = process.argv[2] === 'down'

if (down) {
  const rows = await db.select().from(posts).where(like(posts.slug, 'demo-%'))
  for (const row of rows) {
    if (row.coverPath && isStorageConfigured()) {
      try {
        await deleteFile(row.coverPath)
      } catch {
        // A cover already gone is not a reason to leave the row behind.
      }
    }
    await db.delete(posts).where(eq(posts.id, row.id))
  }
  console.log(`\n  removed ${rows.length} demonstration articles\n`)
  process.exit(0)
}

const allCategories = await db
  .select({ id: categories.id, slug: categories.slug })
  .from(categories)
const categoryId = (slug: string) => allCategories.find((c) => c.slug === slug)?.id ?? null

const allUsers = await db.select({ id: users.id, email: users.email }).from(users)
const authorId = (email: string) => allUsers.find((u) => u.email === email)?.id ?? null

let made = 0
for (const seed of SEEDS) {
  const [exists] = await db
    .select({ id: posts.id })
    .from(posts)
    .where(eq(posts.slug, seed.slug))
    .limit(1)
  if (exists) {
    console.log(`  — ${seed.slug} is already there`)
    continue
  }

  const author = authorId(seed.author)
  if (!author) {
    console.warn(`  ! no account ${seed.author} — skipped ${seed.slug}`)
    continue
  }
  const category = categoryId(seed.category)
  if (!category) console.warn(`  ! no category "${seed.category}" — ${seed.slug} filed under none`)

  const publishedAt = new Date(Date.now() - seed.daysAgo * 86400 * 1000)

  const [res] = await db.insert(posts).values({
    title: seed.title,
    slug: seed.slug,
    categoryId: category,
    excerpt: seed.excerpt,
    contentHtml: seed.body.trim(),
    contentLocale: seed.locale ?? 'th',
    status: 'published',
    publishedAt,
    authorId: author,
  })
  const id = Number(res.insertId)

  // Into `content/`, the one folder served without a signature — an article
  // cover has to load for a reader who has never signed in.
  if (isStorageConfigured()) {
    const url = `https://images.unsplash.com/${seed.photoId}?auto=format&fit=crop&w=${WIDTH}&h=${HEIGHT}&q=72`
    const picture = await fetch(url)
    if (picture.ok) {
      const stored = await uploadFile({
        folder: `content/posts/${id}`,
        filename: `${seed.photoId}.jpg`,
        body: new Uint8Array(await picture.arrayBuffer()),
        contentType: 'image/jpeg',
      })
      await db.update(posts).set({ coverPath: stored.path }).where(eq(posts.id, id))
    } else {
      console.warn(`  ! could not fetch ${seed.photoId}: ${picture.status}`)
    }
  }

  made += 1
  console.log(`  ${String(made).padStart(2)}. ${seed.title}`)
}

console.log(`\n  ${made} articles published. See them under Articles in the admin.\n`)
process.exit(0)
