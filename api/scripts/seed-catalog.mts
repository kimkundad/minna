/**
 * Twelve courses across the four languages the school teaches, with their
 * modules, lessons and cover pictures.
 *
 *   npm run seed:catalog        — create them
 *   npm run seed:catalog down   — remove them again
 *
 * Demo data, kept out of `db/seed.ts` because that file is the starting point
 * for a real database and these are not real courses. They exist so the catalog
 * has enough in it to tell whether the filters, the sorting, the grid and the
 * paging work — none of which can be judged against one course.
 *
 * Every course made here has a slug starting `demo-`, and `down` removes
 * exactly those, their lessons, their pictures and the categories added for
 * them. Nothing it did not create is touched.
 *
 * The pictures come from Unsplash, which licenses them for commercial use
 * without attribution, and are uploaded into the school's own store under
 * `content/courses/` — the folder served without a signature, because a cover
 * has to load for somebody who has not signed in.
 */
import { and, eq, inArray, like } from 'drizzle-orm'
import { db } from '../src/db/client'
import {
  categories,
  courseInstructors,
  courseModules,
  courses,
  lessons,
  teacherProfiles,
  users,
} from '../src/db/schema/index'
import { deleteFile, isStorageConfigured, uploadFile } from '../src/lib/storage'

const DOWN = process.argv[2] === 'down'

/* ---------------- what to build ---------------- */

interface LessonSeed {
  title: string
  type?: 'video' | 'document' | 'quiz'
  minutes?: number
  preview?: boolean
}

interface ModuleSeed {
  title: string
  lessons: LessonSeed[]
}

interface CourseSeed {
  slug: string
  title: string
  shortDesc: string
  description: string
  outcomes: string[]
  audience: string[]
  /** The teacher's account, from seed-teachers. */
  teacher: string
  /** The category's slug, so the ids are looked up rather than guessed. */
  category: string
  level: 'beginner' | 'intermediate' | 'advanced'
  locale: 'th' | 'en' | 'jp' | 'vn'
  /** Baht. Converted to satang on the way in. */
  price: number
  normalPrice?: number
  accessDays?: number
  badge?: 'bestseller' | 'recommended' | 'new' | 'free'
  featured?: boolean
  /** Lower sorts first on "recommended" after featured. */
  popularity: number
  /** An Unsplash photo, chosen by looking at it rather than by its name. */
  photoId: string
  modules: ModuleSeed[]
}

/** Categories these courses need that the database does not have yet. */
const EXTRA_CATEGORIES = [
  { slug: 'japanese-business', name: 'ภาษาญี่ปุ่นธุรกิจ', parent: 'japanese', sortOrder: 5 },
  { slug: 'vietnamese', name: 'ภาษาเวียดนาม', parent: null, sortOrder: 4 },
  { slug: 'vietnamese-conversation', name: 'สนทนา', parent: 'vietnamese', sortOrder: 1 },
]

const COURSES: CourseSeed[] = [
  {
    slug: 'demo-japanese-kanji-300',
    title: 'คันจิ 300 ตัวแรก เขียนได้ อ่านออก',
    shortDesc:
      'จำคันจิด้วยการแยกส่วนประกอบและเรื่องเล่า ไม่ใช่ท่องซ้ำ ครบ 300 ตัวที่เจอบ่อยที่สุดในชีวิตประจำวันและข้อสอบ N5–N4',
    description:
      '<p>คอร์สนี้สอนคันจิด้วยวิธีที่ใช้ได้จริง คือแยกตัวอักษรออกเป็นส่วนประกอบ แล้วผูกเป็นเรื่องให้จำได้โดยไม่ต้องเขียนซ้ำร้อยรอบ</p><p>แต่ละบทจบด้วยแบบฝึกเขียนและแบบทดสอบสั้น เพื่อให้รู้ว่าตัวไหนยังไม่แน่นก่อนไปต่อ</p>',
    outcomes: [
      'อ่านคันจิ 300 ตัวที่พบบ่อยที่สุดได้',
      'เขียนตามลำดับขีดที่ถูกต้อง',
      'แยกส่วนประกอบของคันจิเพื่อเดาความหมายตัวที่ไม่เคยเห็น',
      'อ่านป้ายและเมนูพื้นฐานในญี่ปุ่นได้',
    ],
    audience: [
      'ผู้ที่อ่านฮิรางานะและคาตาคานะได้แล้ว',
      'ผู้ที่เตรียมสอบ JLPT N5 หรือ N4',
      'ผู้ที่เคยท่องคันจิแล้วลืมเร็ว',
    ],
    teacher: 'aiko.tanaka@minna.local',
    category: 'japanese-kanji',
    level: 'beginner',
    locale: 'th',
    price: 1490,
    normalPrice: 1990,
    accessDays: 365,
    badge: 'bestseller',
    featured: true,
    popularity: 2,
    photoId: 'photo-1434030216411-0b793f4b4173',
    modules: [
      {
        title: 'ก่อนเริ่มเขียน',
        lessons: [
          { title: 'คันจิคืออะไร และทำไมต้องรู้ส่วนประกอบ', minutes: 12, preview: true },
          { title: 'ลำดับขีด: กฎ 7 ข้อที่ใช้ได้กับทุกตัว', minutes: 16 },
          { title: 'ตารางส่วนประกอบที่ใช้บ่อย', type: 'document' },
        ],
      },
      {
        title: 'คันจิหมวดตัวเลขและเวลา',
        lessons: [
          { title: 'หนึ่งถึงสิบ และหลักพัน หลักหมื่น', minutes: 18 },
          { title: 'วัน เดือน ปี', minutes: 20 },
          { title: 'เวลาและช่วงของวัน', minutes: 15 },
        ],
      },
      {
        title: 'คันจิหมวดคนและสถานที่',
        lessons: [
          { title: 'คน ครอบครัว และคำเรียกญาติ', minutes: 22 },
          { title: 'สถานที่ที่เจอในเมือง', minutes: 24 },
          { title: 'ทิศทางและการบอกทาง', minutes: 19 },
        ],
      },
      {
        title: 'ทบทวนและวัดผล',
        lessons: [
          { title: 'สรุป 300 ตัว พร้อมตารางทบทวน', type: 'document' },
          { title: 'แบบทดสอบท้ายคอร์ส', type: 'quiz' },
        ],
      },
    ],
  },
  {
    slug: 'demo-jlpt-n5',
    title: 'ติวสอบ JLPT N5 ให้ผ่านรอบเดียว',
    shortDesc:
      'ติวตามโครงสร้างข้อสอบจริงทั้ง 3 ส่วน พร้อมแบบทดสอบจับเวลาและสรุปจุดที่ผู้สอบไทยมักพลาด',
    description:
      '<p>N5 ไม่ได้วัดว่ารู้มากแค่ไหน แต่วัดว่าทำข้อสอบในเวลาที่กำหนดได้ไหม คอร์สนี้จึงติวตามโครงสร้างข้อสอบจริง ไม่ใช่ตามลำดับไวยากรณ์ในตำรา</p><p>ทุกบทจบด้วยชุดข้อสอบจับเวลา และเฉลยที่อธิบายว่าทำไมตัวเลือกที่เหลือถึงผิด</p>',
    outcomes: [
      'รู้โครงสร้างข้อสอบและเวลาที่ใช้ในแต่ละส่วน',
      'ทำโจทย์คำศัพท์และคันจิได้เร็วขึ้น',
      'จับใจความบทสนทนาสั้นในส่วนการฟังได้',
      'บริหารเวลาในห้องสอบได้จริง',
    ],
    audience: ['ผู้ที่เรียนภาษาญี่ปุ่นมาแล้วประมาณ 150 ชั่วโมง', 'ผู้ที่สมัครสอบ N5 รอบถัดไป'],
    teacher: 'aiko.tanaka@minna.local',
    category: 'japanese-jlpt',
    level: 'beginner',
    locale: 'th',
    price: 1890,
    normalPrice: 2490,
    accessDays: 365,
    badge: 'recommended',
    featured: true,
    popularity: 1,
    photoId: 'photo-1524178232363-1fb2b075b655',
    modules: [
      {
        title: 'รู้จักข้อสอบก่อน',
        lessons: [
          { title: 'โครงสร้าง N5 และเกณฑ์ผ่าน', minutes: 14, preview: true },
          { title: 'วางแผนอ่าน 8 สัปดาห์', type: 'document' },
        ],
      },
      {
        title: 'ส่วนที่ 1 คำศัพท์และคันจิ',
        lessons: [
          { title: 'รูปแบบโจทย์ทั้ง 4 แบบ', minutes: 20 },
          { title: 'คำศัพท์ที่ออกบ่อยที่สุด 200 คำ', minutes: 26 },
          { title: 'กับดักที่คนไทยมักตอบผิด', minutes: 18 },
        ],
      },
      {
        title: 'ส่วนที่ 2 ไวยากรณ์และการอ่าน',
        lessons: [
          { title: 'ไวยากรณ์ N5 ที่ออกข้อสอบจริง', minutes: 28 },
          { title: 'อ่านบทความสั้นให้ทันเวลา', minutes: 24 },
        ],
      },
      {
        title: 'ส่วนที่ 3 การฟัง',
        lessons: [
          { title: 'ฟังจับใจความ ไม่ต้องฟังทุกคำ', minutes: 22 },
          { title: 'ฝึกฟังชุดที่ 1', minutes: 18 },
          { title: 'แบบทดสอบจับเวลา', type: 'quiz' },
        ],
      },
    ],
  },
  {
    slug: 'demo-jlpt-n4',
    title: 'ติวสอบ JLPT N4 ต่อยอดจาก N5',
    shortDesc:
      'ไวยากรณ์ที่ซับซ้อนขึ้น รูปสุภาพ รูปกริยาที่ N4 ออกแน่ และบทอ่านยาวที่ต้องจับประเด็นให้ทัน',
    description:
      '<p>ช่องว่างระหว่าง N5 กับ N4 กว้างกว่าที่หลายคนคิด โดยเฉพาะรูปกริยาและบทอ่านที่ยาวขึ้นเท่าตัว</p><p>คอร์สนี้ไล่เรียงเฉพาะสิ่งที่เพิ่มขึ้นจาก N5 เพื่อไม่ให้เสียเวลาทบทวนสิ่งที่แน่นอยู่แล้ว</p>',
    outcomes: [
      'ใช้รูปกริยา te / ta / nai ได้คล่อง',
      'แยกระดับความสุภาพได้ถูกสถานการณ์',
      'อ่านบทความระดับ N4 จบในเวลาที่กำหนด',
    ],
    audience: ['ผู้ที่สอบผ่าน N5 แล้ว', 'ผู้ที่เรียนมินนะโนะนิฮงโกะจบเล่ม 2'],
    teacher: 'aiko.tanaka@minna.local',
    category: 'japanese-jlpt',
    level: 'intermediate',
    locale: 'th',
    price: 2290,
    accessDays: 365,
    popularity: 5,
    photoId: 'photo-1517842645767-c639042777db',
    modules: [
      {
        title: 'รูปกริยาที่ต้องแม่น',
        lessons: [
          { title: 'รูป te และการต่อประโยค', minutes: 26, preview: true },
          { title: 'รูป ta และการเล่าอดีต', minutes: 24 },
          { title: 'รูป nai และการปฏิเสธ', minutes: 22 },
        ],
      },
      {
        title: 'ความสุภาพและบริบท',
        lessons: [
          { title: 'พูดกับใคร ใช้รูปไหน', minutes: 25 },
          { title: 'คำขอร้องและการปฏิเสธอย่างสุภาพ', minutes: 21 },
        ],
      },
      {
        title: 'การอ่านระดับ N4',
        lessons: [
          { title: 'บทอ่านยาว: จับประเด็นใน 3 นาที', minutes: 28 },
          { title: 'แบบทดสอบท้ายคอร์ส', type: 'quiz' },
        ],
      },
    ],
  },
  {
    slug: 'demo-japanese-business',
    title: 'ภาษาญี่ปุ่นธุรกิจ สำหรับคนทำงานกับบริษัทญี่ปุ่น',
    shortDesc:
      'เคอิโกะ อีเมลธุรกิจ การประชุม และมารยาทที่คนไทยมักพลาด สอนโดยอดีตล่ามประจำบริษัทญี่ปุ่นในไทย',
    description:
      '<p>ภาษาญี่ปุ่นในที่ทำงานต่างจากในห้องเรียนมาก สิ่งที่ตัดสินว่าสื่อสารได้หรือไม่คือระดับความสุภาพและมารยาท ไม่ใช่จำนวนคำศัพท์</p><p>คอร์สนี้มาจากประสบการณ์ล่ามจริงในบริษัทญี่ปุ่นในไทย ทุกตัวอย่างเป็นสถานการณ์ที่เกิดขึ้นจริง</p>',
    outcomes: [
      'ใช้เคอิโกะได้ถูกระดับกับคู่สนทนาแต่ละฝ่าย',
      'เขียนอีเมลธุรกิจตามรูปแบบที่บริษัทญี่ปุ่นคาดหวัง',
      'แนะนำตัวและนำเสนอในที่ประชุมได้',
      'เข้าใจมารยาทการแลกนามบัตรและการนั่งในห้องประชุม',
    ],
    audience: [
      'พนักงานบริษัทญี่ปุ่นในไทย',
      'ผู้ที่เตรียมสัมภาษณ์งานกับบริษัทญี่ปุ่น',
      'ผู้ที่มีพื้นฐาน N4 ขึ้นไป',
    ],
    teacher: 'kenji.sato@minna.local',
    category: 'japanese-business',
    level: 'intermediate',
    locale: 'th',
    price: 2990,
    normalPrice: 3490,
    accessDays: 365,
    featured: true,
    popularity: 3,
    photoId: 'photo-1517048676732-d65bc937f952',
    modules: [
      {
        title: 'เคอิโกะที่ใช้จริง',
        lessons: [
          { title: 'สามระดับของเคอิโกะ และใครใช้กับใคร', minutes: 24, preview: true },
          { title: 'คำที่เปลี่ยนรูปทั้งคำ', minutes: 22 },
          { title: 'ตารางเคอิโกะสำหรับพิมพ์ติดโต๊ะ', type: 'document' },
        ],
      },
      {
        title: 'อีเมลและเอกสาร',
        lessons: [
          { title: 'โครงอีเมลธุรกิจแบบญี่ปุ่น', minutes: 26 },
          { title: 'แจ้ง ขอ ปฏิเสธ และขอโทษ', minutes: 28 },
          { title: 'ตัวอย่างอีเมล 20 แบบ', type: 'document' },
        ],
      },
      {
        title: 'ในที่ประชุม',
        lessons: [
          { title: 'แนะนำตัวและแลกนามบัตร', minutes: 18 },
          { title: 'เสนอความเห็นโดยไม่เสียมารยาท', minutes: 25 },
          { title: 'แบบทดสอบท้ายคอร์ส', type: 'quiz' },
        ],
      },
    ],
  },
  {
    slug: 'demo-japanese-daily-conversation',
    title: 'สนทนาญี่ปุ่นในชีวิตประจำวัน',
    shortDesc:
      'ประโยคที่ใช้จริงตั้งแต่ทักทาย สั่งอาหาร ถามทาง จนถึงคุยเล่นกับเพื่อนร่วมงาน ฝึกออกเสียงตามเจ้าของภาษา',
    description:
      '<p>คอร์สนี้ไม่ไล่ตามไวยากรณ์ แต่ไล่ตามสถานการณ์ที่เกิดขึ้นจริงในหนึ่งวัน ตั้งแต่ตื่นนอนจนกลับบ้าน</p><p>แต่ละบทมีบทสนทนาเต็มให้ฟังซ้ำ และแบบฝึกพูดตามที่เน้นจังหวะมากกว่าความถูกต้องทางไวยากรณ์</p>',
    outcomes: [
      'ทักทายและแนะนำตัวได้อย่างเป็นธรรมชาติ',
      'สั่งอาหารและถามราคาได้',
      'ถามทางและเข้าใจคำตอบ',
      'คุยเรื่องทั่วไปกับคนญี่ปุ่นได้โดยไม่ติดขัด',
    ],
    audience: ['ผู้เริ่มต้นที่อ่านฮิรางานะได้', 'ผู้ที่เตรียมไปเที่ยวหรือทำงานที่ญี่ปุ่น'],
    teacher: 'aiko.tanaka@minna.local',
    category: 'japanese-conversation',
    level: 'beginner',
    locale: 'th',
    price: 1290,
    accessDays: 365,
    badge: 'new',
    popularity: 4,
    photoId: 'photo-1521737711867-e3b97375f902',
    modules: [
      {
        title: 'เริ่มต้นบทสนทนา',
        lessons: [
          { title: 'ทักทายตามช่วงเวลา', minutes: 14, preview: true },
          { title: 'แนะนำตัวและถามชื่อ', minutes: 18 },
          { title: 'คำตอบรับและปฏิเสธอย่างสุภาพ', minutes: 16 },
        ],
      },
      {
        title: 'นอกบ้าน',
        lessons: [
          { title: 'สั่งอาหารในร้าน', minutes: 22 },
          { title: 'ซื้อของและถามราคา', minutes: 20 },
          { title: 'ถามทางและขึ้นรถไฟ', minutes: 24 },
        ],
      },
      {
        title: 'คุยให้ต่อเนื่อง',
        lessons: [
          { title: 'เล่าเรื่องของตัวเอง', minutes: 21 },
          { title: 'แบบทดสอบท้ายคอร์ส', type: 'quiz' },
        ],
      },
    ],
  },
  {
    slug: 'demo-japanese-travel',
    title: 'ภาษาญี่ปุ่นเพื่อการท่องเที่ยว 30 ประโยค',
    shortDesc:
      'สั้น ตรง ใช้ได้ทันที 30 ประโยคที่พอสำหรับทริปแรก พร้อมไฟล์เสียงให้ฟังระหว่างเดินทาง',
    description:
      '<p>ไม่ต้องเรียนไวยากรณ์ก่อนก็ไปเที่ยวได้ คอร์สนี้ให้ 30 ประโยคที่ใช้ได้ทันทีตั้งแต่ลงเครื่อง</p><p>แต่ละประโยคมีไฟล์เสียงแยก ฟังซ้ำบนเครื่องบินหรือระหว่างเดินทางได้</p>',
    outcomes: [
      'เช็กอินโรงแรมและขอของเพิ่มได้',
      'สั่งอาหารและบอกข้อจำกัดด้านอาหารได้',
      'ถามทางและขอความช่วยเหลือเมื่อหลง',
    ],
    audience: ['ผู้ที่ไปญี่ปุ่นครั้งแรก', 'ผู้ที่ไม่มีพื้นฐานภาษาญี่ปุ่นเลย'],
    teacher: 'aiko.tanaka@minna.local',
    category: 'japanese-conversation',
    level: 'beginner',
    locale: 'th',
    price: 0,
    accessDays: 0,
    badge: 'free',
    popularity: 6,
    photoId: 'photo-1473186578172-c141e6798cf4',
    modules: [
      {
        title: '30 ประโยคที่ต้องรู้',
        lessons: [
          { title: 'ที่สนามบินและบนรถไฟ', minutes: 16, preview: true },
          { title: 'ที่โรงแรม', minutes: 14 },
          { title: 'ที่ร้านอาหาร', minutes: 18 },
          { title: 'เมื่อหลงทางหรือต้องการความช่วยเหลือ', minutes: 12 },
          { title: 'ไฟล์เสียงทั้ง 30 ประโยค', type: 'document' },
        ],
      },
    ],
  },
  {
    slug: 'demo-english-conversation',
    title: 'English Conversation for Beginners',
    shortDesc:
      'Build the sentences you actually need before you worry about grammar. Everyday situations, recorded by a native speaker.',
    description:
      '<p>Most beginners can read more English than they can say. This course closes that gap by starting from situations rather than from rules.</p><p>Every lesson ends with a full conversation to shadow, because speaking at the right speed matters more than speaking perfectly.</p>',
    outcomes: [
      'Introduce yourself and keep a conversation going',
      'Order, ask for help and give directions',
      'Hear the difference between sounds Thai speakers often merge',
    ],
    audience: ['Learners who can read English but freeze when speaking', 'Anyone preparing to travel or work abroad'],
    teacher: 'sarah.whitfield@minna.local',
    category: 'english-conversation',
    level: 'beginner',
    locale: 'en',
    price: 1190,
    normalPrice: 1590,
    accessDays: 365,
    popularity: 7,
    photoId: 'photo-1555431189-0fabf2667795',
    modules: [
      {
        title: 'Getting started',
        lessons: [
          { title: 'Introducing yourself', minutes: 15, preview: true },
          { title: 'Small talk that is not awkward', minutes: 20 },
          { title: 'Sounds Thai speakers merge', minutes: 18 },
        ],
      },
      {
        title: 'Out and about',
        lessons: [
          { title: 'Ordering food and drinks', minutes: 19 },
          { title: 'Shopping and asking prices', minutes: 17 },
          { title: 'Asking for directions', minutes: 21 },
        ],
      },
      {
        title: 'Keeping it going',
        lessons: [
          { title: 'Telling a short story', minutes: 23 },
          { title: 'End of course quiz', type: 'quiz' },
        ],
      },
    ],
  },
  {
    slug: 'demo-english-business',
    title: 'Business English for the Workplace',
    shortDesc:
      'Email, meetings and presentations that sound professional without sounding stiff. Written for people who already work in English.',
    description:
      '<p>Workplace English is a narrow set of patterns used again and again. Learn those patterns and most of the day becomes easy.</p><p>Every lesson uses real documents: a real agenda, a real follow-up email, a real set of slides.</p>',
    outcomes: [
      'Write email that gets a reply',
      'Run and take part in a meeting',
      'Present for ten minutes without reading a script',
      'Disagree politely',
    ],
    audience: ['Office workers using English daily', 'Anyone moving into a role with international colleagues'],
    teacher: 'sarah.whitfield@minna.local',
    category: 'english-business',
    level: 'intermediate',
    locale: 'en',
    price: 2590,
    accessDays: 365,
    popularity: 8,
    photoId: 'photo-1516542076529-1ea3854896f2',
    modules: [
      {
        title: 'Email',
        lessons: [
          { title: 'Subject lines that get opened', minutes: 14, preview: true },
          { title: 'Asking, refusing and apologising', minutes: 24 },
          { title: 'Twenty email templates', type: 'document' },
        ],
      },
      {
        title: 'Meetings',
        lessons: [
          { title: 'Opening and keeping to an agenda', minutes: 22 },
          { title: 'Disagreeing without causing offence', minutes: 20 },
        ],
      },
      {
        title: 'Presenting',
        lessons: [
          { title: 'Structure for a ten minute talk', minutes: 26 },
          { title: 'Handling questions', minutes: 18 },
          { title: 'End of course quiz', type: 'quiz' },
        ],
      },
    ],
  },
  {
    slug: 'demo-ielts-preparation',
    title: 'IELTS Preparation: Band 6.5 and above',
    shortDesc:
      'All four papers, with the marking criteria explained from the examiner side and timed practice for each.',
    description:
      '<p>IELTS rewards technique as much as English. This course works through each paper the way it is marked, so time goes where the band descriptors actually put it.</p><p>Writing tasks are marked against the public criteria with the reasoning shown.</p>',
    outcomes: [
      'Know what each band descriptor is asking for',
      'Finish Reading inside the hour',
      'Structure Writing Task 2 in five minutes',
      'Speak for two minutes without running dry',
    ],
    audience: ['Candidates targeting 6.5 or 7.0', 'Anyone who has taken IELTS and plateaued'],
    teacher: 'sarah.whitfield@minna.local',
    category: 'english-exam',
    level: 'advanced',
    locale: 'en',
    price: 3290,
    normalPrice: 3990,
    accessDays: 365,
    badge: 'bestseller',
    popularity: 9,
    photoId: 'photo-1544716278-ca5e3f4abd8c',
    modules: [
      {
        title: 'How it is marked',
        lessons: [
          { title: 'The four papers and the band descriptors', minutes: 20, preview: true },
          { title: 'Where candidates lose the most marks', minutes: 22 },
        ],
      },
      {
        title: 'Reading and Listening',
        lessons: [
          { title: 'Reading: finding answers without reading everything', minutes: 28 },
          { title: 'Listening: the traps in Section 3', minutes: 24 },
        ],
      },
      {
        title: 'Writing and Speaking',
        lessons: [
          { title: 'Task 1: describing data', minutes: 26 },
          { title: 'Task 2: a structure that always works', minutes: 30 },
          { title: 'Speaking Part 2: two minutes without drying up', minutes: 25 },
          { title: 'End of course quiz', type: 'quiz' },
        ],
      },
    ],
  },
  {
    slug: 'demo-chinese-beginner',
    title: 'ภาษาจีนกลางเบื้องต้น เริ่มจากพินอินและวรรณยุกต์',
    shortDesc:
      'ปูพื้นฐานการออกเสียงให้แม่นก่อน เพราะวรรณยุกต์ผิดคือความหมายเปลี่ยน ไม่ใช่แค่สำเนียงเพี้ยน',
    description:
      '<p>คนไทยได้เปรียบเรื่องวรรณยุกต์ แต่เสียเปรียบตรงที่วรรณยุกต์จีนไม่ตรงกับไทย คอร์สนี้จึงเริ่มจากการแยกเสียงให้ออกก่อน</p><p>เมื่อออกเสียงแม่นแล้ว คำศัพท์และประโยคจะตามมาเร็วกว่าที่คิด</p>',
    outcomes: [
      'อ่านพินอินและออกเสียงวรรณยุกต์ทั้ง 4 ได้',
      'แนะนำตัวและนับเลขได้',
      'สั่งอาหารและซื้อของได้',
      'อ่านอักษรจีนพื้นฐาน 150 ตัว',
    ],
    audience: ['ผู้เริ่มต้นที่ไม่มีพื้นฐานภาษาจีน', 'ผู้ที่เตรียมสอบ HSK 1'],
    teacher: 'li.wei@minna.local',
    category: 'chinese-conversation',
    level: 'beginner',
    locale: 'th',
    price: 1390,
    accessDays: 365,
    badge: 'new',
    popularity: 10,
    photoId: 'photo-1546410531-bb4caa6b424d',
    modules: [
      {
        title: 'เสียงต้องมาก่อน',
        lessons: [
          { title: 'พินอินคืออะไร', minutes: 16, preview: true },
          { title: 'วรรณยุกต์ทั้ง 4 และเสียงเบา', minutes: 24 },
          { title: 'เสียงที่คนไทยมักสับสน', minutes: 20 },
        ],
      },
      {
        title: 'ประโยคแรกของคุณ',
        lessons: [
          { title: 'ทักทายและแนะนำตัว', minutes: 18 },
          { title: 'ตัวเลขและการนับ', minutes: 16 },
          { title: 'สั่งอาหารและซื้อของ', minutes: 22 },
        ],
      },
      {
        title: 'เริ่มอ่านอักษรจีน',
        lessons: [
          { title: 'อักษรพื้นฐาน 150 ตัว', minutes: 28 },
          { title: 'แบบทดสอบท้ายคอร์ส', type: 'quiz' },
        ],
      },
    ],
  },
  {
    slug: 'demo-hsk-1-3',
    title: 'เตรียมสอบ HSK 1–3 ครบในคอร์สเดียว',
    shortDesc:
      'คำศัพท์ครบตามเกณฑ์ทั้ง 3 ระดับ พร้อมแนวข้อสอบและเทคนิคจับเวลาในแต่ละพาร์ต',
    description:
      '<p>HSK 1 ถึง 3 มีคำศัพท์รวมกัน 600 คำ และโครงสร้างข้อสอบที่ซ้ำเดิมทุกปี คอร์สนี้ไล่ทั้งสามระดับต่อเนื่อง เพราะเนื้อหาซ้อนกันมาก</p>',
    outcomes: [
      'จำคำศัพท์ครบ 600 คำตามเกณฑ์',
      'ทำข้อสอบการฟังได้ทันเวลา',
      'อ่านประโยคระดับ HSK 3 ได้คล่อง',
    ],
    audience: ['ผู้ที่เรียนภาษาจีนมาแล้วประมาณ 1 ปี', 'ผู้ที่ต้องใช้ผล HSK สมัครเรียนหรือทำงาน'],
    teacher: 'li.wei@minna.local',
    category: 'chinese-hsk',
    level: 'intermediate',
    locale: 'th',
    price: 2190,
    normalPrice: 2690,
    accessDays: 365,
    popularity: 11,
    photoId: 'photo-1507842217343-583bb7270b66',
    modules: [
      {
        title: 'HSK 1 และ 2',
        lessons: [
          { title: 'โครงสร้างข้อสอบและเกณฑ์ผ่าน', minutes: 15, preview: true },
          { title: 'คำศัพท์ 300 คำแรก', minutes: 30 },
          { title: 'แนวข้อสอบการฟัง', minutes: 24 },
        ],
      },
      {
        title: 'HSK 3',
        lessons: [
          { title: 'คำศัพท์เพิ่มอีก 300 คำ', minutes: 32 },
          { title: 'การอ่านและการเขียนระดับ 3', minutes: 28 },
          { title: 'แบบทดสอบจับเวลา', type: 'quiz' },
        ],
      },
    ],
  },
  {
    slug: 'demo-vietnamese-beginner',
    title: 'ภาษาเวียดนามสำหรับผู้เริ่มต้น',
    shortDesc:
      'เริ่มจากระบบเสียงและวรรณยุกต์ 6 เสียง แล้วต่อด้วยประโยคที่ใช้ได้จริงในการทำงานและเดินทาง',
    description:
      '<p>ภาษาเวียดนามเขียนด้วยอักษรโรมัน จึงอ่านได้เร็วกว่าที่คิด แต่มีวรรณยุกต์ 6 เสียงซึ่งมากกว่าไทย</p><p>คอร์สนี้ปูเสียงให้แม่นก่อน แล้วค่อยต่อด้วยประโยคที่ใช้ได้ทันทีในที่ทำงานและระหว่างเดินทาง</p>',
    outcomes: [
      'อ่านออกเสียงภาษาเวียดนามได้ถูกวรรณยุกต์',
      'แนะนำตัวและสนทนาเบื้องต้นได้',
      'ใช้ประโยคพื้นฐานในที่ทำงานได้',
    ],
    audience: ['ผู้ที่ทำงานกับคู่ค้าเวียดนาม', 'ผู้ที่เตรียมไปทำงานหรือเที่ยวเวียดนาม'],
    teacher: 'nguyen.thi.mai@minna.local',
    category: 'vietnamese-conversation',
    level: 'beginner',
    locale: 'th',
    price: 1590,
    accessDays: 365,
    popularity: 12,
    photoId: 'photo-1491841550275-ad7854e35ca6',
    modules: [
      {
        title: 'ระบบเสียง',
        lessons: [
          { title: 'ตัวอักษรและการออกเสียง', minutes: 18, preview: true },
          { title: 'วรรณยุกต์ทั้ง 6 เสียง', minutes: 26 },
          { title: 'เสียงที่คนไทยมักออกผิด', minutes: 20 },
        ],
      },
      {
        title: 'ประโยคที่ใช้ได้จริง',
        lessons: [
          { title: 'ทักทายและแนะนำตัว', minutes: 17 },
          { title: 'ในที่ทำงาน', minutes: 23 },
          { title: 'ระหว่างเดินทาง', minutes: 19 },
          { title: 'แบบทดสอบท้ายคอร์ส', type: 'quiz' },
        ],
      },
    ],
  },
]

/* ---------------- removing ---------------- */

if (DOWN) {
  const mine = await db
    .select({ id: courses.id, thumbnailPath: courses.thumbnailPath })
    .from(courses)
    .where(like(courses.slug, 'demo-%'))
  const ids = mine.map((c) => c.id)

  if (ids.length) {
    await db.delete(lessons).where(inArray(lessons.courseId, ids))
    await db.delete(courseModules).where(inArray(courseModules.courseId, ids))
    await db.delete(courseInstructors).where(inArray(courseInstructors.courseId, ids))
    await db.delete(courses).where(inArray(courses.id, ids))
  }

  for (const c of mine) {
    if (!c.thumbnailPath) continue
    try {
      await deleteFile(c.thumbnailPath)
    } catch {
      // A picture already gone is not a problem worth stopping for.
    }
  }

  // Children first: a parent with a course still under it would not be ours to
  // remove anyway, and the delete would be refused.
  for (const slug of [...EXTRA_CATEGORIES].reverse().map((c) => c.slug)) {
    const [cat] = await db.select({ id: categories.id }).from(categories).where(eq(categories.slug, slug)).limit(1)
    if (!cat) continue
    const [stillUsed] = await db
      .select({ id: courses.id })
      .from(courses)
      .where(eq(courses.categoryId, cat.id))
      .limit(1)
    if (stillUsed) {
      console.log(`  kept category ${slug} — something else is filed under it`)
      continue
    }
    await db.delete(categories).where(eq(categories.id, cat.id))
  }

  console.log(`  removed ${ids.length} demo course(s) and their pictures`)
  process.exit(0)
}

/* ---------------- building ---------------- */

if (!isStorageConfigured()) {
  console.error('File storage is not configured, so the cover pictures cannot be uploaded.')
  process.exit(1)
}

const already = await db.select({ id: courses.id }).from(courses).where(like(courses.slug, 'demo-%'))
if (already.length) {
  console.log(`  ${already.length} demo course(s) already exist — run \`down\` first to replace them.\n`)
  process.exit(0)
}

/** The categories these courses file under, by slug. */
const catBySlug = new Map<string, number>()
for (const row of await db.select({ id: categories.id, slug: categories.slug }).from(categories)) {
  catBySlug.set(row.slug, row.id)
}

for (const extra of EXTRA_CATEGORIES) {
  if (catBySlug.has(extra.slug)) continue
  const parentId = extra.parent ? (catBySlug.get(extra.parent) ?? null) : null
  const [res] = await db.insert(categories).values({
    name: extra.name,
    slug: extra.slug,
    parentId,
    sortOrder: extra.sortOrder,
  })
  catBySlug.set(extra.slug, Number(res.insertId))
  console.log(`  + category ${extra.name} (${extra.slug})`)
}

/** The teachers, by the email the seed gives them. */
const teacherByEmail = new Map<string, number>()
for (const row of await db
  .select({ id: users.id, email: users.email })
  .from(users)
  .innerJoin(teacherProfiles, eq(teacherProfiles.userId, users.id))) {
  teacherByEmail.set(row.email, row.id)
}

const WIDTH = 1280
const HEIGHT = 720

let made = 0
for (const seed of COURSES) {
  const categoryId = catBySlug.get(seed.category)
  const teacherId = teacherByEmail.get(seed.teacher)
  if (!categoryId) {
    console.log(`  SKIP ${seed.slug} — no category ${seed.category}`)
    continue
  }
  if (!teacherId) {
    console.log(`  SKIP ${seed.slug} — no teacher ${seed.teacher} (run seed:teachers first)`)
    continue
  }

  // Published a few weeks apart, so "newest" has something to sort.
  const publishedAt = new Date(Date.now() - made * 6 * 86400000)

  const [res] = await db.insert(courses).values({
    categoryId,
    title: seed.title,
    slug: seed.slug,
    shortDesc: seed.shortDesc,
    description: seed.description,
    outcomes: seed.outcomes,
    audience: seed.audience,
    level: seed.level,
    contentLocale: seed.locale,
    price: seed.price * 100,
    normalPrice: seed.normalPrice ? seed.normalPrice * 100 : null,
    accessType: seed.accessDays ? 'limited' : 'lifetime',
    accessDurationDays: seed.accessDays || null,
    status: 'approved',
    sellable: true,
    repurchase: true,
    badge: seed.badge ?? null,
    popularity: seed.popularity,
    featured: seed.featured ?? false,
    publishedAt,
  })
  const courseId = Number(res.insertId)

  await db.insert(courseInstructors).values({ courseId, userId: teacherId, sortOrder: 0 })

  let totalSeconds = 0
  let moduleOrder = 0
  for (const mod of seed.modules) {
    moduleOrder += 1
    const [modRes] = await db.insert(courseModules).values({
      courseId,
      title: mod.title,
      sortOrder: moduleOrder,
    })
    const moduleId = Number(modRes.insertId)

    let lessonOrder = 0
    for (const l of mod.lessons) {
      lessonOrder += 1
      const seconds = (l.minutes ?? 0) * 60
      totalSeconds += seconds
      await db.insert(lessons).values({
        courseId,
        moduleId,
        type: l.type ?? 'video',
        title: l.title,
        durationSeconds: seconds,
        isPreview: l.preview ?? false,
        sortOrder: lessonOrder,
      })
    }
  }

  // Into `content/`, the folder served without a signature: a cover has to load
  // for somebody who has not signed in and may never buy.
  const url = `https://images.unsplash.com/${seed.photoId}?auto=format&fit=crop&w=${WIDTH}&h=${HEIGHT}&q=72`
  const picture = await fetch(url)
  if (!picture.ok) throw new Error(`could not fetch ${seed.photoId}: ${picture.status}`)
  const stored = await uploadFile({
    folder: `content/courses/${courseId}`,
    filename: `${seed.photoId}.jpg`,
    body: new Uint8Array(await picture.arrayBuffer()),
    contentType: 'image/jpeg',
  })

  await db
    .update(courses)
    .set({ thumbnailPath: stored.path, durationSeconds: totalSeconds })
    .where(eq(courses.id, courseId))

  made += 1
  const lessonCount = seed.modules.reduce((n, m) => n + m.lessons.length, 0)
  console.log(
    `  ${String(made).padStart(2)}. ${seed.title}` +
      `\n      ${seed.modules.length} modules · ${lessonCount} lessons · ` +
      `${Math.round(totalSeconds / 60)} min · ` +
      (seed.price ? `฿${seed.price.toLocaleString()}` : 'free'),
  )
}

console.log(`\n  ${made} courses published. See them under Courses in the admin.\n`)
process.exit(0)
