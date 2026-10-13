import type { FastifyInstance } from 'fastify'
import { eq } from 'drizzle-orm'
import { db } from '../../db/client'
import { courses, posts, siteSettings } from '../../db/schema/index'
import { env } from '../../config/env'
import { plainText } from '../../lib/rich-text'
import { signedUrl } from '../../lib/storage'

/**
 * What a crawler sees when somebody shares a link.
 *
 * The public site is a single-page app: the browser downloads one nearly
 * empty `index.html` and Vue fills it in. Facebook, LINE and X do not run
 * JavaScript — they read the HTML as it arrives — so a title set by Vue is a
 * title they never see, and every shared link previews as the same blank
 * page whatever it points at.
 *
 * So nginx sends crawlers here instead, and this answers with a small page
 * that is nothing but the tags they came for, plus a link out for the rare
 * person who lands on it. Readers never touch it; the app is unchanged.
 *
 * The alternative is server-rendering the whole site, which is a far larger
 * change and buys little else: the catalog is already indexed through its own
 * pages, and nothing here needs to be fast.
 */

/** The share image's shape, which every one of these services crops to. */
const CARD = { width: 1200, height: 630 }

/**
 * The site's languages, and what each is called in the tag.
 *
 * `og:locale` wants a language and a region. The region is a guess for three
 * of these — there is no Vietnamese-speaking region on this site, only
 * Vietnamese readers — but the tag has no form without one, and the services
 * use it to pick a translation of their own furniture, not to decide anything
 * about the page.
 */
const OG_LOCALES: Record<string, string> = {
  th: 'th_TH',
  en: 'en_US',
  jp: 'ja_JP',
  vn: 'vi_VN',
}

/** What is in the path, or Thai. Anything unknown is not a language here. */
function localeOf(value: unknown): string {
  const asked = String(value ?? '').toLowerCase()
  return asked in OG_LOCALES ? asked : 'th'
}

/**
 * A setting in one language.
 *
 * The unsuffixed key is Thai — the canonical one, the same arrangement as a
 * category's name — and `og_title_en` and friends sit on top of it. A
 * language with nothing of its own falls back rather than going blank, which
 * is what lets these be filled in one language at a time.
 */
function localised(map: Map<string, string>, key: string, locale: string): string {
  const own = locale === 'th' ? '' : (map.get(`${key}_${locale}`) ?? '').trim()
  return own || (map.get(key) ?? '').trim()
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Long enough to say something, short enough that nothing truncates it. */
function trim(value: string, max = 200): string {
  const clean = value.replace(/\s+/g, ' ').trim()
  return clean.length <= max ? clean : `${clean.slice(0, max - 1).trimEnd()}…`
}

interface Card {
  title: string
  description: string
  image: string | null
  url: string
  type: 'website' | 'article'
  locale: string
}

function render(card: Card, siteName: string): string {
  const t = escapeHtml(card.title)
  const d = escapeHtml(card.description)
  const u = escapeHtml(card.url)
  const image = card.image ? escapeHtml(card.image) : null

  return `<!doctype html>
<html lang="${card.locale === 'jp' ? 'ja' : card.locale === 'vn' ? 'vi' : card.locale}">
<head>
<meta charset="utf-8">
<title>${t}</title>
<meta name="description" content="${d}">
<link rel="canonical" href="${u}">

<meta property="og:site_name" content="${escapeHtml(siteName)}">
<meta property="og:type" content="${card.type}">
<meta property="og:title" content="${t}">
<meta property="og:description" content="${d}">
<meta property="og:url" content="${u}">
<meta property="og:locale" content="${OG_LOCALES[card.locale] ?? OG_LOCALES.th}">
${image ? `<meta property="og:image" content="${image}">
<meta property="og:image:width" content="${CARD.width}">
<meta property="og:image:height" content="${CARD.height}">` : ''}

<meta name="twitter:card" content="${image ? 'summary_large_image' : 'summary'}">
<meta name="twitter:title" content="${t}">
<meta name="twitter:description" content="${d}">
${image ? `<meta name="twitter:image" content="${image}">` : ''}
</head>
<body>
<h1>${t}</h1>
<p>${d}</p>
<p><a href="${u}">${u}</a></p>
</body>
</html>`
}

/**
 * The site-wide fallbacks, and the name every card is attributed to.
 *
 * Read on each request rather than cached: these change when somebody edits
 * them, and a share preview is not a hot path.
 */
async function siteDefaults(locale: string) {
  const rows = await db
    .select({ key: siteSettings.key, value: siteSettings.value })
    .from(siteSettings)
  const map = new Map(rows.map((r) => [r.key, r.value ?? '']))
  return {
    name: map.get('site_name')?.trim() || 'Minna No Nihongo',
    title: localised(map, 'og_title', locale),
    description: localised(map, 'og_description', locale),
    imagePath: localised(map, 'og_image_path', locale),
  }
}

/**
 * A stored path becomes a URL a crawler can fetch.
 *
 * Crawlers follow this without a session and without cookies, so it has to be
 * one that works on its own. `content/` is served openly; anything else is
 * signed, and a signed URL expires — which for a share card is acceptable,
 * because the services fetch it once at share time and keep their own copy.
 */
async function imageUrl(path: string | null | undefined): Promise<string | null> {
  const clean = String(path ?? '').trim()
  if (!clean) return null
  // An absolute URL is already one. The site-wide default is a file shipped
  // with the front end rather than something an editor uploaded, so it is
  // addressed as what it is instead of being pushed through storage to come
  // back out as a link that expires.
  if (/^https?:\/\//i.test(clean)) return clean
  try {
    return await signedUrl(clean)
  } catch {
    return null
  }
}

export default async function ogRoutes(app: FastifyInstance) {
  /**
   * One route per kind of page, rather than one that takes a path and guesses.
   * Guessing would mean this file needing to know the site's routing table,
   * and getting it wrong would show the home page's card for a course.
   */

  app.get<{ Params: { locale: string; slug: string } }>('/og/:locale/courses/:slug', async (req, reply) => {
    const locale = localeOf(req.params.locale)
    const site = await siteDefaults(locale)
    const [row] = await db
      .select({
        title: courses.title,
        slug: courses.slug,
        shortDesc: courses.shortDesc,
        description: courses.description,
        thumbnailPath: courses.thumbnailPath,
        ogTitle: courses.ogTitle,
        ogDescription: courses.ogDescription,
        ogImagePath: courses.ogImagePath,
        status: courses.status,
      })
      .from(courses)
      .where(eq(courses.slug, req.params.slug))
      .limit(1)

    // An unapproved course is not public, so its card is the site's. Saying
    // "no such course" would be worse: a crawler reporting a 404 is how a
    // shared link stops previewing at all, including after it goes live.
    const url = `${env.APP_URL}/${locale}/courses/${req.params.slug}`
    if (!row || row.status !== 'approved') {
      return send(reply, site, {
        title: site.title || site.name,
        description: site.description,
        image: await imageUrl(site.imagePath),
        url,
        type: 'website',

        locale,
      })
    }

    return send(reply, site, {
      title: row.ogTitle?.trim() || row.title,
      description: trim(
        row.ogDescription?.trim() || row.shortDesc?.trim() || plainText(row.description) || site.description,
      ),
      image: (await imageUrl(row.ogImagePath)) ?? (await imageUrl(row.thumbnailPath)) ?? (await imageUrl(site.imagePath)),
      url,
      type: 'website',

      locale,
    })
  })

  app.get<{ Params: { locale: string; slug: string } }>('/og/:locale/blog/:slug', async (req, reply) => {
    const locale = localeOf(req.params.locale)
    const site = await siteDefaults(locale)
    const [row] = await db
      .select({
        title: posts.title,
        excerpt: posts.excerpt,
        contentHtml: posts.contentHtml,
        coverPath: posts.coverPath,
        ogTitle: posts.ogTitle,
        ogDescription: posts.ogDescription,
        ogImagePath: posts.ogImagePath,
        status: posts.status,
      })
      .from(posts)
      .where(eq(posts.slug, req.params.slug))
      .limit(1)

    const url = `${env.APP_URL}/${locale}/blog/${req.params.slug}`
    if (!row || row.status !== 'published') {
      return send(reply, site, {
        title: site.title || site.name,
        description: site.description,
        image: await imageUrl(site.imagePath),
        url,
        type: 'website',

        locale,
      })
    }

    return send(reply, site, {
      title: row.ogTitle?.trim() || row.title,
      description: trim(
        row.ogDescription?.trim() || row.excerpt?.trim() || plainText(row.contentHtml) || site.description,
      ),
      image: (await imageUrl(row.ogImagePath)) ?? (await imageUrl(row.coverPath)) ?? (await imageUrl(site.imagePath)),
      url,
      // Articles are articles; the services show a byline and a date for this
      // type and not for the other.
      type: 'article',

      locale,
    })
  })

  /** Everything else: the home page, the catalog, about, the legal pages. */
  app.get<{ Params: { locale: string }; Querystring: { path?: string } }>(
    '/og/:locale/site',
    async (req, reply) => {
      const locale = localeOf(req.params.locale)
      const site = await siteDefaults(locale)
      // The path is echoed into the canonical link, so it is checked against a
      // pattern rather than trusted — an open redirect dressed as a share card
      // is still an open redirect.
      const asked = String(req.query.path ?? `/${locale}`)
      const path = /^\/[a-z0-9/_-]*$/i.test(asked) ? asked : `/${locale}`
      return send(reply, site, {
        title: site.title || site.name,
        description: site.description,
        image: await imageUrl(site.imagePath),
        url: `${env.APP_URL}${path}`,
        type: 'website',
        locale,
      })
    },
  )
}

function send(
  reply: { type: (t: string) => { header: (k: string, v: string) => { send: (b: string) => unknown } } },
  site: { name: string },
  card: Card,
) {
  return reply
    .type('text/html; charset=utf-8')
    // Crawlers re-fetch when a link is shared again, and an editor fixing a
    // typo wants the next share to show it. Five minutes is long enough to
    // absorb a link going round a group chat.
    .header('Cache-Control', 'public, max-age=300')
    .send(render(card, site.name))
}
