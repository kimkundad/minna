import { relations, sql } from 'drizzle-orm'
import {
  bigint,
  datetime,
  index,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  tinyint,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/mysql-core'
import { LOCALES, users } from './auth'
import { categories } from './catalog'

export const NOTIFICATION_TYPES = [
  'purchase',
  'expiry',
  'essay_submitted',
  'essay_reviewed',
  'question_answered',
  'welcome',
] as const

/** The four languages, plus 'all' for an article that belongs to every one. */
export const POST_LOCALES = [...LOCALES, 'all'] as const

export const posts = mysqlTable(
  'posts',
  {
    id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    title: varchar('title', { length: 255 }).notNull(),
    slug: varchar('slug', { length: 255 }).notNull(),
    /**
     * The same categories the courses use, rather than a list of its own.
     *
     * An article about kanji and a course about kanji are about the same thing,
     * so they file under the same heading — which is what lets a course page
     * offer the articles near it, and the other way round. Nullable: an article
     * that fits nowhere in particular is still an article.
     */
    categoryId: bigint('category_id', { mode: 'number', unsigned: true }).references(
      () => categories.id,
      { onDelete: 'set null' },
    ),
    excerpt: varchar('excerpt', { length: 500 }),
    coverPath: varchar('cover_path', { length: 512 }),
    contentHtml: text('content_html'),
    /**
     * The language the article is written in, or 'all'.
     *
     * Most articles are about one language and belong to readers of that one.
     * Some are not — how long learning takes, how to revise, how the school
     * works — and filing those under Thai hides them from everyone reading the
     * site in English. 'all' is for those: shown whichever language the site
     * is being read in.
     */
    contentLocale: mysqlEnum('content_locale', POST_LOCALES).default('th').notNull(),
    status: mysqlEnum('status', ['draft', 'published']).default('draft').notNull(),
    publishedAt: datetime('published_at'),
    authorId: bigint('author_id', { mode: 'number', unsigned: true }).references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: datetime('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
    updatedAt: datetime('updated_at')
      .default(sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (t) => [
    uniqueIndex('posts_slug_unique').on(t.slug),
    index('posts_published_idx').on(t.status, t.publishedAt),
    index('posts_locale_idx').on(t.contentLocale),
    index('posts_category_idx').on(t.categoryId),
  ],
)

/**
 * Where an advertisement can go. One key per reserved box on the site, so the
 * school sells a position rather than "somewhere on the site" — the box above
 * the catalog's results and the one under them are worth different money.
 */
export const AD_PLACEMENTS = [
  'home-top',
  'home-bottom',
  'catalog-inline',
  'catalog-bottom',
  'course',
  'blog',
  'article',
  'account',
  'learn',
] as const

export const AD_LOCALES = [...LOCALES, 'all'] as const

export const ads = mysqlTable(
  'ads',
  {
    id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    /** What the school calls this campaign in the admin. Never shown. */
    name: varchar('name', { length: 150 }).notNull(),
    placement: mysqlEnum('placement', AD_PLACEMENTS).notNull(),
    /** Who bought it. For the admin's own list, not for the page. */
    advertiser: varchar('advertiser', { length: 150 }),
    href: varchar('href', { length: 512 }).notNull(),

    /**
     * Two pictures, because the box is a different shape on each: 4:1 across a
     * desktop, 4:5 on a phone. A banner that is 4:1 either fits a phone at
     * thumbnail size or is cropped to its middle, and neither keeps the words
     * on it readable.
     */
    imageDesktopPath: varchar('image_desktop_path', { length: 512 }),
    imageMobilePath: varchar('image_mobile_path', { length: 512 }),
    /** Read out in place of the picture, so the advertisement is not silent. */
    imageAlt: varchar('image_alt', { length: 255 }),

    /** 'all' by default: an advertiser usually buys the whole site. */
    locale: mysqlEnum('locale', AD_LOCALES).default('all').notNull(),
    status: mysqlEnum('status', ['draft', 'published']).default('draft').notNull(),
    /** A campaign runs between dates. Either end may be open. */
    startsAt: datetime('starts_at'),
    endsAt: datetime('ends_at'),
    /** Lower first, where several are live in one placement at once. */
    sortOrder: int('sort_order').default(0).notNull(),

    createdAt: datetime('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
    updatedAt: datetime('updated_at')
      .default(sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (t) => [
    index('ads_live_idx').on(t.placement, t.status, t.startsAt, t.endsAt),
    index('ads_locale_idx').on(t.locale),
  ],
)

export const testimonials = mysqlTable(
  'testimonials',
  {
    id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    name: varchar('name', { length: 150 }).notNull(),
    designation: varchar('designation', { length: 150 }),
    content: text('content').notNull(),
    rating: tinyint('rating', { unsigned: true }).default(5).notNull(),
    avatarPath: varchar('avatar_path', { length: 512 }),
    status: mysqlEnum('status', ['draft', 'published']).default('published').notNull(),
    sortOrder: int('sort_order').default(0).notNull(),
    createdAt: datetime('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  },
  (t) => [index('testimonials_status_idx').on(t.status, t.sortOrder)],
)

export const contactMessages = mysqlTable(
  'contact_messages',
  {
    id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    name: varchar('name', { length: 150 }).notNull(),
    email: varchar('email', { length: 255 }).notNull(),
    subject: varchar('subject', { length: 255 }).notNull(),
    message: text('message'),
    readAt: datetime('read_at'),
    createdAt: datetime('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  },
  (t) => [index('contact_messages_read_idx').on(t.readAt, t.createdAt)],
)

export const subscribers = mysqlTable(
  'subscribers',
  {
    id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    email: varchar('email', { length: 255 }).notNull(),
    confirmedAt: datetime('confirmed_at'),
    unsubscribedAt: datetime('unsubscribed_at'),
    createdAt: datetime('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  },
  (t) => [uniqueIndex('subscribers_email_unique').on(t.email)],
)

export const teacherApplications = mysqlTable(
  'teacher_applications',
  {
    id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    name: varchar('name', { length: 150 }).notNull(),
    email: varchar('email', { length: 255 }).notNull(),
    phone: varchar('phone', { length: 32 }),
    /** What they said they want to teach, in their own words. Free text,
     *  because someone applying does not know our category tree and should not
     *  have to pick the nearest wrong answer. */
    subject: varchar('subject', { length: 150 }),
    /** Filled in by whoever reviews the application, mapping the subject above
     *  onto a real category. Null until then. */
    categoryId: bigint('category_id', { mode: 'number', unsigned: true }).references(
      () => categories.id,
      { onDelete: 'set null' },
    ),
    experience: text('experience'),
    reason: text('reason'),
    /** Object key in Spaces, not a public URL. */
    resumePath: varchar('resume_path', { length: 512 }),
    contactTime: varchar('contact_time', { length: 120 }),
    agreedAt: datetime('agreed_at'),
    status: mysqlEnum('status', ['pending', 'approved', 'rejected']).default('pending').notNull(),
    approvedBy: bigint('approved_by', { mode: 'number', unsigned: true }).references(
      () => users.id,
      { onDelete: 'set null' },
    ),
    approvedAt: datetime('approved_at'),
    createdAt: datetime('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  },
  (t) => [index('teacher_applications_status_idx').on(t.status, t.createdAt)],
)

export const notifications = mysqlTable(
  'notifications',
  {
    id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    userId: bigint('user_id', { mode: 'number', unsigned: true })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: mysqlEnum('type', NOTIFICATION_TYPES).notNull(),
    title: varchar('title', { length: 255 }).notNull(),
    body: varchar('body', { length: 500 }),
    ctaUrl: varchar('cta_url', { length: 512 }),
    readAt: datetime('read_at'),
    createdAt: datetime('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  },
  (t) => [index('notifications_user_idx').on(t.userId, t.readAt, t.createdAt)],
)

/**
 * Loose key/value settings, including `vat_percent` and `vat_inclusive`.
 * `group` keeps the admin screen tidy once there are a few dozen of them.
 */
export const siteSettings = mysqlTable(
  'site_settings',
  {
    id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    key: varchar('key', { length: 100 }).notNull(),
    value: text('value'),
    group: varchar('group', { length: 50 }).default('general').notNull(),
    updatedAt: datetime('updated_at')
      .default(sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (t) => [uniqueIndex('site_settings_key_unique').on(t.key)],
)

export const postsRelations = relations(posts, ({ one }) => ({
  author: one(users, { fields: [posts.authorId], references: [users.id] }),
  category: one(categories, { fields: [posts.categoryId], references: [categories.id] }),
}))

export const teacherApplicationsRelations = relations(teacherApplications, ({ one }) => ({
  category: one(categories, {
    fields: [teacherApplications.categoryId],
    references: [categories.id],
  }),
  approver: one(users, { fields: [teacherApplications.approvedBy], references: [users.id] }),
}))

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, { fields: [notifications.userId], references: [users.id] }),
}))

/**
 * The slides on the home page.
 *
 * One row is one slide: a line of copy, a picture, and up to two buttons.
 *
 * Written per language, the way articles are. A carousel of Thai headlines
 * shown to somebody reading the English site is worse than no carousel, and the
 * copy is short enough that writing it twice is not a burden.
 *
 * `startsAt` and `endsAt` are here because a slideshow is where a promotion
 * goes, and a promotion has dates. Without them somebody has to remember to
 * come back and switch it off, which is the kind of thing that is remembered
 * three weeks late.
 */
/**
 * A slide is written for one language, or for all of them.
 *
 * 'all' is for a slide whose words work everywhere — a picture with a short
 * line on it, a promotion with a price. Most slides are not that: a headline is
 * language-specific, which is why the default is one language at a time.
 */
export const HERO_LOCALES = [...LOCALES, 'all'] as const

export const heroSlides = mysqlTable(
  'hero_slides',
  {
    id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    locale: mysqlEnum('locale', HERO_LOCALES).default('th').notNull(),
    /** The small line above the headline. */
    eyebrow: varchar('eyebrow', { length: 120 }),
    /** The headline is two lines by design: the second is styled differently. */
    titleA: varchar('title_a', { length: 200 }).notNull(),
    titleB: varchar('title_b', { length: 200 }),
    subtitle: varchar('subtitle', { length: 500 }),
    imagePath: varchar('image_path', { length: 512 }),
    /** Read out by screen readers, so it describes the picture rather than
     *  repeating the headline. */
    imageAlt: varchar('image_alt', { length: 255 }),
    /**
     * Which part of the picture to keep when it is cropped, as percentages.
     * The box is a tall column on a desktop and a wide strip on a phone, so
     * every picture is cropped twice and the middle is rarely the right answer.
     */
    focalX: tinyint('focal_x', { unsigned: true }).default(50).notNull(),
    focalY: tinyint('focal_y', { unsigned: true }).default(50).notNull(),
    ctaLabel: varchar('cta_label', { length: 80 }),
    ctaHref: varchar('cta_href', { length: 512 }),
    cta2Label: varchar('cta2_label', { length: 80 }),
    cta2Href: varchar('cta2_href', { length: 512 }),
    status: mysqlEnum('status', ['draft', 'published']).default('draft').notNull(),
    sortOrder: int('sort_order').default(0).notNull(),
    startsAt: datetime('starts_at'),
    endsAt: datetime('ends_at'),
    createdAt: datetime('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
    updatedAt: datetime('updated_at')
      .default(sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (t) => [index('hero_slides_shown_idx').on(t.locale, t.status, t.sortOrder)],
)
