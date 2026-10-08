/**
 * Five teachers to work with, across the languages the school offers.
 *
 * Demo data, kept out of `db/seed.ts` because that file is the starting point
 * for a real database and these are not real people. Running it twice updates
 * rather than duplicates, so it is safe to re-run after changing the list.
 *
 *   npm run seed:teachers
 */
import 'dotenv/config'
import { eq } from 'drizzle-orm'
import { db } from '../src/db/client'
import { roles as rolesTable, teacherProfiles, userRoles, users } from '../src/db/schema/index'
import { hashPassword } from '../src/lib/password'

const PASSWORD = process.env.SEED_TEACHER_PASSWORD ?? 'TeachMe!2026'

const TEACHERS = [
  {
    email: 'aiko.tanaka@minna.local',
    firstName: 'Aiko',
    lastName: 'Tanaka',
    displayName: '田中 愛子 (Aiko Tanaka)',
    shortName: 'Aiko Tanaka',
    slug: 'aiko-tanaka',
    headline: 'ภาษาญี่ปุ่นสำหรับผู้เริ่มต้น · เตรียมสอบ JLPT N5–N3',
    bio: 'เจ้าของภาษาจากโอซาก้า สอนภาษาญี่ปุ่นให้ผู้เรียนชาวไทยมา 9 ปี ถนัดการปูพื้นฐานฮิรางานะ–คาตาคานะให้แน่นก่อนไปต่อ และเตรียมสอบ JLPT ตั้งแต่ N5 ถึง N3',
    languages: ['jp'],
    credentials: 'ปริญญาโทการสอนภาษาญี่ปุ่น มหาวิทยาลัยโอซาก้า · วุฒิบัตรครูสอนภาษาญี่ปุ่น (日本語教師養成講座 420 ชม.)',
    yearsExperience: 9,
  },
  {
    email: 'kenji.sato@minna.local',
    firstName: 'Kenji',
    lastName: 'Sato',
    displayName: '佐藤 健二 (Kenji Sato)',
    shortName: 'Kenji Sato',
    slug: 'kenji-sato',
    headline: 'ภาษาญี่ปุ่นธุรกิจ · อดีตล่ามประจำบริษัทญี่ปุ่นในไทย',
    bio: 'ทำงานเป็นล่ามและผู้ประสานงานในโรงงานญี่ปุ่นย่านอมตะนคร 12 ปี ก่อนมาสอนเต็มตัว เน้นภาษาที่ใช้ได้จริงในที่ทำงาน ตั้งแต่การประชุมจนถึงอีเมลและการรายงานหัวหน้า',
    languages: ['jp'],
    credentials: 'JLPT N1 · วุฒิบัตรล่ามธุรกิจญี่ปุ่น–ไทย',
    yearsExperience: 12,
  },
  {
    email: 'sarah.whitfield@minna.local',
    firstName: 'Sarah',
    lastName: 'Whitfield',
    displayName: 'Sarah Whitfield',
    shortName: 'Sarah Whitfield',
    slug: 'sarah-whitfield',
    headline: 'English conversation · IELTS preparation',
    bio: 'From Manchester, teaching in Bangkok since 2016. Works on the gap between knowing grammar and being able to use it — the one most Thai learners arrive with after years of school English.',
    languages: ['en'],
    credentials: 'CELTA (Cambridge) · BA English Literature, University of Leeds · IELTS examiner training',
    yearsExperience: 10,
  },
  {
    email: 'li.wei@minna.local',
    firstName: 'Wei',
    lastName: 'Li',
    displayName: '李伟 (Li Wei)',
    shortName: 'Li Wei',
    slug: 'li-wei',
    headline: 'ภาษาจีนกลาง · เตรียมสอบ HSK 1–5',
    bio: 'จากคุนหมิง สอนภาษาจีนในเชียงใหม่และกรุงเทพฯ รวม 7 ปี เริ่มจากการออกเสียงสี่เสียงให้ถูกก่อนเป็นอย่างอื่น เพราะเป็นจุดที่ผู้เรียนไทยติดกันมากที่สุด',
    languages: ['th'],
    credentials: 'ปริญญาตรีการสอนภาษาจีนสำหรับชาวต่างชาติ มหาวิทยาลัยยูนนาน · HSK ระดับครูผู้สอน',
    yearsExperience: 7,
  },
  {
    email: 'nguyen.thi.mai@minna.local',
    firstName: 'Mai',
    lastName: 'Nguyen',
    displayName: 'Nguyễn Thị Mai',
    shortName: 'Mai Nguyen',
    slug: 'mai-nguyen',
    headline: 'Tiếng Việt cho người Thái · ภาษาเวียดนามเพื่อการทำงาน',
    bio: 'จากฮานอย อาศัยในไทย 6 ปี สอนภาษาเวียดนามให้คนไทยที่ทำงานกับคู่ค้าเวียดนาม เน้นการออกเสียงและสำเนียงเหนือที่ใช้ในการติดต่อราชการและธุรกิจ',
    languages: ['vn'],
    credentials: 'ปริญญาตรีภาษาศาสตร์ มหาวิทยาลัยแห่งชาติฮานอย · วุฒิบัตรการสอนภาษาเวียดนามสำหรับชาวต่างชาติ',
    yearsExperience: 6,
  },
] as const

async function main() {
  const [teacherRole] = await db
    .select()
    .from(rolesTable)
    .where(eq(rolesTable.name, 'teacher'))
    .limit(1)
  if (!teacherRole) throw new Error('the teacher role is missing — run the main seed first')

  const passwordHash = await hashPassword(PASSWORD)

  for (const t of TEACHERS) {
    const [existing] = await db.select().from(users).where(eq(users.email, t.email)).limit(1)

    let userId: number
    if (existing) {
      userId = existing.id
      await db
        .update(users)
        .set({ firstName: t.firstName, lastName: t.lastName })
        .where(eq(users.id, userId))
    } else {
      await db.insert(users).values({
        email: t.email,
        passwordHash,
        firstName: t.firstName,
        lastName: t.lastName,
        locale: 'th',
        emailVerifiedAt: new Date(),
        privacyAcceptedAt: new Date(),
      })
      const [created] = await db.select().from(users).where(eq(users.email, t.email)).limit(1)
      userId = created!.id
    }

    const held = await db.select().from(userRoles).where(eq(userRoles.userId, userId))
    if (!held.some((r) => r.roleId === teacherRole.id)) {
      await db.insert(userRoles).values({ userId, roleId: teacherRole.id })
    }

    const profile = {
      displayName: t.displayName,
      shortName: t.shortName,
      slug: t.slug,
      headline: t.headline,
      bio: t.bio,
      languages: [...t.languages] as never,
      credentials: t.credentials,
      yearsExperience: t.yearsExperience,
      listed: true,
    }

    const [hasProfile] = await db
      .select({ userId: teacherProfiles.userId })
      .from(teacherProfiles)
      .where(eq(teacherProfiles.userId, userId))
      .limit(1)

    if (hasProfile) {
      await db.update(teacherProfiles).set(profile).where(eq(teacherProfiles.userId, userId))
    } else {
      await db.insert(teacherProfiles).values({ userId, ...profile })
    }

    console.log(`  ${existing ? 'updated' : 'created'}  ${t.email}  — ${t.headline}`)
  }

  console.log(`\n  ${TEACHERS.length} teachers ready. Password for all of them: ${PASSWORD}`)
  console.log('  They have no photo yet; add one from Teachers in the admin.\n')
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err)
    process.exit(1)
  },
)
