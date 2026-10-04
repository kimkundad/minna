import { relations, sql } from 'drizzle-orm'
import {
  bigint,
  boolean,
  datetime,
  index,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  primaryKey,
  smallint,
  text,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/mysql-core'
import { users } from './auth'
import { courses } from './catalog'

/** Where a learner's access came from. */
export const ENTITLEMENT_SOURCES = ['purchase', 'package', 'free', 'admin'] as const

export const ORDER_STATUSES = [
  'pending',
  'paid',
  'failed',
  'cancelled',
  'refunded',
] as const

export const packages = mysqlTable(
  'packages',
  {
    id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    name: varchar('name', { length: 150 }).notNull(),
    slug: varchar('slug', { length: 150 }).notNull(),
    description: text('description'),
    /** Satang. */
    price: int('price').default(0).notNull(),
    durationDays: smallint('duration_days', { unsigned: true }).default(365).notNull(),
    /** Checklist rows shown on the pricing card. */
    benefits: json('benefits').$type<{ text: string; included: boolean }[]>(),
    isPopular: boolean('is_popular').default(false).notNull(),
    sortOrder: int('sort_order').default(0).notNull(),
    active: boolean('active').default(true).notNull(),
    createdAt: datetime('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
    updatedAt: datetime('updated_at')
      .default(sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (t) => [uniqueIndex('packages_slug_unique').on(t.slug)],
)

/** Each package picks its own courses, rather than all of them sharing one flag. */
export const packageCourses = mysqlTable(
  'package_courses',
  {
    packageId: bigint('package_id', { mode: 'number', unsigned: true })
      .notNull()
      .references(() => packages.id, { onDelete: 'cascade' }),
    courseId: bigint('course_id', { mode: 'number', unsigned: true })
      .notNull()
      .references(() => courses.id, { onDelete: 'cascade' }),
  },
  (t) => [
    primaryKey({ columns: [t.packageId, t.courseId] }),
    index('package_courses_course_idx').on(t.courseId),
  ],
)

export const orders = mysqlTable(
  'orders',
  {
    id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    orderNo: varchar('order_no', { length: 32 }).notNull(),
    userId: bigint('user_id', { mode: 'number', unsigned: true })
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    /** All amounts in satang. */
    subtotal: int('subtotal').default(0).notNull(),
    courseDiscount: int('course_discount').default(0).notNull(),
    orderDiscount: int('order_discount').default(0).notNull(),
    vatAmount: int('vat_amount').default(0).notNull(),
    total: int('total').default(0).notNull(),
    currency: varchar('currency', { length: 3 }).default('THB').notNull(),
    status: mysqlEnum('status', ORDER_STATUSES).default('pending').notNull(),
    paymentMethod: mysqlEnum('payment_method', ['card', 'promptpay', 'free']),
    provider: varchar('provider', { length: 32 }).default('stripe').notNull(),
    /** Stripe checkout session id. */
    providerRef: varchar('provider_ref', { length: 255 }),
    providerPayload: json('provider_payload'),
    paidAt: datetime('paid_at'),
    createdAt: datetime('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
    updatedAt: datetime('updated_at')
      .default(sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (t) => [
    uniqueIndex('orders_no_unique').on(t.orderNo),
    index('orders_user_idx').on(t.userId, t.createdAt),
    index('orders_status_idx').on(t.status),
    index('orders_provider_ref_idx').on(t.providerRef),
  ],
)

export const coupons = mysqlTable(
  'coupons',
  {
    id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    code: varchar('code', { length: 50 }).notNull(),
    /** A course coupon discounts one course; an order coupon discounts the cart. */
    scope: mysqlEnum('scope', ['course', 'order']).notNull(),
    courseId: bigint('course_id', { mode: 'number', unsigned: true }).references(() => courses.id, {
      onDelete: 'cascade',
    }),
    discountType: mysqlEnum('discount_type', ['percent', 'fixed']).notNull(),
    /** Percent as whole points (10 = 10%), or satang for a fixed amount. */
    value: int('value').notNull(),
    /** Ceiling on a percent discount, in satang. */
    maxDiscount: int('max_discount'),
    /** Order coupons only, and measured after course coupons come off. */
    minSubtotal: int('min_subtotal'),
    startsAt: datetime('starts_at'),
    expiresAt: datetime('expires_at'),
    usageLimit: int('usage_limit'),
    usedCount: int('used_count').default(0).notNull(),
    active: boolean('active').default(true).notNull(),
    createdAt: datetime('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  },
  (t) => [
    uniqueIndex('coupons_code_unique').on(t.code),
    index('coupons_scope_idx').on(t.scope, t.active),
  ],
)

export const orderItems = mysqlTable(
  'order_items',
  {
    id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    orderId: bigint('order_id', { mode: 'number', unsigned: true })
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    courseId: bigint('course_id', { mode: 'number', unsigned: true }).references(() => courses.id, {
      onDelete: 'set null',
    }),
    packageId: bigint('package_id', { mode: 'number', unsigned: true }).references(
      () => packages.id,
      { onDelete: 'set null' },
    ),
    /** Everything below is frozen at purchase time, so later edits to the course
     *  never change what someone bought or what their receipt says. */
    titleSnapshot: varchar('title_snapshot', { length: 255 }).notNull(),
    unitPrice: int('unit_price').notNull(),
    discount: int('discount').default(0).notNull(),
    couponId: bigint('coupon_id', { mode: 'number', unsigned: true }).references(() => coupons.id, {
      onDelete: 'set null',
    }),
    accessType: mysqlEnum('access_type', ['lifetime', 'limited']).default('lifetime').notNull(),
    accessDurationDays: smallint('access_duration_days', { unsigned: true }),
  },
  (t) => [
    index('order_items_order_idx').on(t.orderId),
    index('order_items_course_idx').on(t.courseId),
  ],
)

export const subscriptions = mysqlTable(
  'subscriptions',
  {
    id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    userId: bigint('user_id', { mode: 'number', unsigned: true })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    packageId: bigint('package_id', { mode: 'number', unsigned: true })
      .notNull()
      .references(() => packages.id, { onDelete: 'restrict' }),
    orderId: bigint('order_id', { mode: 'number', unsigned: true }).references(() => orders.id, {
      onDelete: 'set null',
    }),
    startsAt: datetime('starts_at').notNull(),
    expiresAt: datetime('expires_at').notNull(),
    status: mysqlEnum('status', ['active', 'expired', 'cancelled']).default('active').notNull(),
    autoRenew: boolean('auto_renew').default(false).notNull(),
    createdAt: datetime('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  },
  (t) => [
    index('subscriptions_user_idx').on(t.userId, t.status),
    index('subscriptions_expires_idx').on(t.expiresAt),
  ],
)

/**
 * The one table that answers "can this person open this course?".
 * Buying, subscribing, claiming a free course and an admin grant all end here,
 * so every access check reads a single place. Progress lives elsewhere on
 * purpose: when access expires, what the learner already watched must survive.
 */
export const entitlements = mysqlTable(
  'entitlements',
  {
    id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    userId: bigint('user_id', { mode: 'number', unsigned: true })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    courseId: bigint('course_id', { mode: 'number', unsigned: true })
      .notNull()
      .references(() => courses.id, { onDelete: 'cascade' }),
    source: mysqlEnum('source', ENTITLEMENT_SOURCES).notNull(),
    orderItemId: bigint('order_item_id', { mode: 'number', unsigned: true }).references(
      () => orderItems.id,
      { onDelete: 'set null' },
    ),
    subscriptionId: bigint('subscription_id', { mode: 'number', unsigned: true }).references(
      () => subscriptions.id,
      { onDelete: 'set null' },
    ),
    grantedAt: datetime('granted_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
    /** Null means lifetime. */
    expiresAt: datetime('expires_at'),
    status: mysqlEnum('status', ['active', 'expired', 'revoked']).default('active').notNull(),
  },
  (t) => [
    index('entitlements_user_course_idx').on(t.userId, t.courseId),
    index('entitlements_status_idx').on(t.status, t.expiresAt),
    index('entitlements_course_idx').on(t.courseId),
  ],
)

export const carts = mysqlTable(
  'carts',
  {
    id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    userId: bigint('user_id', { mode: 'number', unsigned: true }).references(() => users.id, {
      onDelete: 'cascade',
    }),
    /** Holds a guest cart until they log in, when it merges into their account. */
    sessionToken: varchar('session_token', { length: 64 }),
    createdAt: datetime('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
    updatedAt: datetime('updated_at')
      .default(sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (t) => [
    uniqueIndex('carts_user_unique').on(t.userId),
    uniqueIndex('carts_session_unique').on(t.sessionToken),
  ],
)

export const cartItems = mysqlTable(
  'cart_items',
  {
    id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    cartId: bigint('cart_id', { mode: 'number', unsigned: true })
      .notNull()
      .references(() => carts.id, { onDelete: 'cascade' }),
    courseId: bigint('course_id', { mode: 'number', unsigned: true }).references(() => courses.id, {
      onDelete: 'cascade',
    }),
    packageId: bigint('package_id', { mode: 'number', unsigned: true }).references(
      () => packages.id,
      { onDelete: 'cascade' },
    ),
    /** Unticked rows stay in the cart after the rest is paid for. */
    selected: boolean('selected').default(true).notNull(),
    couponId: bigint('coupon_id', { mode: 'number', unsigned: true }).references(() => coupons.id, {
      onDelete: 'set null',
    }),
    addedAt: datetime('added_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  },
  (t) => [
    index('cart_items_cart_idx').on(t.cartId),
    uniqueIndex('cart_items_course_unique').on(t.cartId, t.courseId),
  ],
)

export const couponRedemptions = mysqlTable(
  'coupon_redemptions',
  {
    id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    couponId: bigint('coupon_id', { mode: 'number', unsigned: true })
      .notNull()
      .references(() => coupons.id, { onDelete: 'cascade' }),
    userId: bigint('user_id', { mode: 'number', unsigned: true })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    orderId: bigint('order_id', { mode: 'number', unsigned: true })
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    discountAmount: int('discount_amount').notNull(),
    redeemedAt: datetime('redeemed_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  },
  (t) => [
    index('coupon_redemptions_coupon_idx').on(t.couponId),
    index('coupon_redemptions_user_idx').on(t.userId),
  ],
)

export const invoices = mysqlTable(
  'invoices',
  {
    id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    orderId: bigint('order_id', { mode: 'number', unsigned: true })
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    type: mysqlEnum('type', ['corporate', 'individual']).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    /** Thai tax ID or national ID: 13 digits either way. */
    taxId: varchar('tax_id', { length: 13 }).notNull(),
    branchType: mysqlEnum('branch_type', ['head', 'branch']),
    branchCode: varchar('branch_code', { length: 10 }),
    address: text('address').notNull(),
    documentNo: varchar('document_no', { length: 32 }),
    issuedAt: datetime('issued_at'),
    createdAt: datetime('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  },
  (t) => [uniqueIndex('invoices_order_unique').on(t.orderId)],
)

export const packagesRelations = relations(packages, ({ many }) => ({
  courses: many(packageCourses),
  subscriptions: many(subscriptions),
}))

export const packageCoursesRelations = relations(packageCourses, ({ one }) => ({
  package: one(packages, { fields: [packageCourses.packageId], references: [packages.id] }),
  course: one(courses, { fields: [packageCourses.courseId], references: [courses.id] }),
}))

export const ordersRelations = relations(orders, ({ one, many }) => ({
  user: one(users, { fields: [orders.userId], references: [users.id] }),
  items: many(orderItems),
  invoice: one(invoices),
}))

export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, { fields: [orderItems.orderId], references: [orders.id] }),
  course: one(courses, { fields: [orderItems.courseId], references: [courses.id] }),
  package: one(packages, { fields: [orderItems.packageId], references: [packages.id] }),
  coupon: one(coupons, { fields: [orderItems.couponId], references: [coupons.id] }),
}))

export const subscriptionsRelations = relations(subscriptions, ({ one }) => ({
  user: one(users, { fields: [subscriptions.userId], references: [users.id] }),
  package: one(packages, { fields: [subscriptions.packageId], references: [packages.id] }),
  order: one(orders, { fields: [subscriptions.orderId], references: [orders.id] }),
}))

export const entitlementsRelations = relations(entitlements, ({ one }) => ({
  user: one(users, { fields: [entitlements.userId], references: [users.id] }),
  course: one(courses, { fields: [entitlements.courseId], references: [courses.id] }),
  orderItem: one(orderItems, {
    fields: [entitlements.orderItemId],
    references: [orderItems.id],
  }),
  subscription: one(subscriptions, {
    fields: [entitlements.subscriptionId],
    references: [subscriptions.id],
  }),
}))

export const cartsRelations = relations(carts, ({ one, many }) => ({
  user: one(users, { fields: [carts.userId], references: [users.id] }),
  items: many(cartItems),
}))

export const cartItemsRelations = relations(cartItems, ({ one }) => ({
  cart: one(carts, { fields: [cartItems.cartId], references: [carts.id] }),
  course: one(courses, { fields: [cartItems.courseId], references: [courses.id] }),
  package: one(packages, { fields: [cartItems.packageId], references: [packages.id] }),
}))

export const couponsRelations = relations(coupons, ({ one, many }) => ({
  course: one(courses, { fields: [coupons.courseId], references: [courses.id] }),
  redemptions: many(couponRedemptions),
}))

export const couponRedemptionsRelations = relations(couponRedemptions, ({ one }) => ({
  coupon: one(coupons, { fields: [couponRedemptions.couponId], references: [coupons.id] }),
  user: one(users, { fields: [couponRedemptions.userId], references: [users.id] }),
  order: one(orders, { fields: [couponRedemptions.orderId], references: [orders.id] }),
}))

export const invoicesRelations = relations(invoices, ({ one }) => ({
  order: one(orders, { fields: [invoices.orderId], references: [orders.id] }),
}))
