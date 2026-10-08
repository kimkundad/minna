/**
 * Checks that the two new article fields survive a round trip.
 *
 *   npx tsx scripts/smoke-post-fields.mts
 *
 * `category_id` and the widened `content_locale` were added by hand rather than
 * by a migration, so what the schema file says and what the table accepts could
 * disagree. This writes a real row through the service, reads it back through
 * the public reads, and deletes it again.
 */
import { eq } from 'drizzle-orm'
import { db } from '../src/db/client'
import { categories, posts, users } from '../src/db/schema/index'
import * as service from '../src/modules/content/content.service'

let failed = 0
function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`)
  if (!ok) failed += 1
}

const [cat] = await db.select({ id: categories.id, name: categories.name }).from(categories).limit(1)
const [author] = await db.select({ id: users.id }).from(users).limit(1)
if (!cat || !author) throw new Error('need at least one category and one account')

const slug = `smoke-post-${Date.now()}`
let id = 0

try {
  const created = await service.createPost(
    {
      title: 'Smoke test article',
      slug,
      excerpt: 'Written by a test and deleted again.',
      coverPath: null,
      contentHtml: '<h2>One</h2><p>Body.</p><h2>Two</h2><p>More.</p>',
      contentLocale: 'all',
      status: 'published',
      categoryId: cat.id,
    },
    author.id,
  )
  id = created.id

  check('a category is stored', created.categoryId === cat.id, `${created.categoryId}`)
  check("content_locale accepts 'all'", created.contentLocale === 'all', created.contentLocale)

  // Every language means every language: asked for Thai, and for English.
  for (const locale of ['th', 'en', 'jp', 'vn'] as const) {
    const list = await service.listPublishedPosts({ page: 1, perPage: 50, locale })
    check(
      `  and the article shows for a ${locale} reader`,
      list.data.some((p) => p.slug === slug),
    )
  }

  const byCategory = await service.listPublishedPosts({
    page: 1,
    perPage: 50,
    categoryId: cat.id,
  })
  check(
    'filtering by its category finds it',
    byCategory.data.some((p) => p.slug === slug),
    `category ${cat.name}`,
  )

  const read = await service.getPublishedPost(slug)
  check('the public read carries the category name', read.categoryName === cat.name, String(read.categoryName))
  check('and the body', (read.contentHtml ?? '').includes('<h2>Two</h2>'))

  // Changing the category and narrowing the language both have to take.
  await service.updatePost(id, {
    title: 'Smoke test article',
    slug,
    excerpt: null,
    coverPath: null,
    contentHtml: '<p>Changed.</p>',
    contentLocale: 'th',
    status: 'published',
    categoryId: null,
  })
  const after = await service.getPost(id)
  check('a category can be cleared', after.categoryId === null, String(after.categoryId))
  check('and the language narrowed again', after.contentLocale === 'th', after.contentLocale)

  const enOnly = await service.listPublishedPosts({ page: 1, perPage: 50, locale: 'en' })
  check(
    'after which an English reader no longer sees it',
    !enOnly.data.some((p) => p.slug === slug),
  )
} finally {
  if (id) {
    await db.delete(posts).where(eq(posts.id, id))
    console.log(`\n  cleaned up ${slug}`)
  }
}

console.log(failed ? `\n  ${failed} failing\n` : '\n  all good\n')
process.exit(failed ? 1 : 0)
