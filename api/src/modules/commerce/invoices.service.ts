import { and, desc, eq, sql } from 'drizzle-orm'
import { db } from '../../db/client'
import { invoices, orders, users } from '../../db/schema/index'
import { conflict, notFound, validationFailed } from '../../lib/errors'
import { HEAD_OFFICE_CODE, isValidBranchCode, isValidTaxId, normaliseTaxId } from '../../lib/thai-tax'
import { schoolMonthCompact } from '../../lib/time'

/**
 * Full tax invoices.
 *
 * Thailand distinguishes a receipt, which every buyer gets by email, from a
 * full tax invoice (ใบกำกับภาษีเต็มรูปแบบ), which only a buyer who asks for one
 * gets and which has to carry their registered name, thirteen-digit tax ID,
 * branch and address exactly as the Revenue Department holds them. Those
 * details are the buyer's to supply, so they are asked for at checkout, before
 * paying — which is the only moment the buyer is there to be asked.
 *
 * The request is stored with the order. The document number is allocated later,
 * when the order is actually paid, because an abandoned basket must not burn a
 * number out of a sequence that is supposed to have no gaps.
 */

export interface InvoiceInput {
  type: 'corporate' | 'individual'
  /** The registered company name, or the person's full name. */
  name: string
  taxId: string
  /** Companies only. A person has no branch. */
  branchType?: 'head' | 'branch' | null
  branchCode?: string | null
  address: string
}

/**
 * The rules that are about Thai tax documents rather than about field shapes.
 *
 * Checked on the server as well as in the form because the cost of getting one
 * wrong lands weeks later: an invoice with a mistyped tax ID is refused by the
 * buyer's accountant, and correcting it means cancelling the document and
 * issuing another.
 */
export function validateInvoice(input: InvoiceInput): InvoiceInput {
  const taxId = normaliseTaxId(input.taxId)
  const fields: Record<string, string> = {}

  if (!input.name.trim()) {
    fields.name =
      input.type === 'corporate'
        ? 'Enter the registered company name.'
        : 'Enter the name on the ID card.'
  }
  if (!isValidTaxId(taxId)) {
    fields.taxId =
      input.type === 'corporate'
        ? 'That is not a valid 13-digit tax ID.'
        : 'That is not a valid 13-digit national ID.'
  }
  if (!input.address.trim()) fields.address = 'Enter the address for the invoice.'

  let branchType: 'head' | 'branch' | null = null
  let branchCode: string | null = null

  if (input.type === 'corporate') {
    branchType = input.branchType ?? null
    if (branchType !== 'head' && branchType !== 'branch') {
      fields.branchType = 'Say whether this is the head office or a branch.'
    } else {
      // A head office is 00000 by law, so it is filled in rather than asked
      // for — the form shows it read-only and this does not trust what it sent.
      branchCode = branchType === 'head' ? HEAD_OFFICE_CODE : (input.branchCode ?? '').trim()
      if (!isValidBranchCode(branchCode, branchType)) {
        fields.branchCode = 'A branch code is five digits, and 00000 is the head office.'
      }
    }
  }

  if (Object.keys(fields).length) {
    // 422 rather than 409: these belong under the inputs that caused them.
    throw validationFailed(fields)
  }

  return {
    type: input.type,
    name: input.name.trim(),
    taxId,
    branchType,
    branchCode,
    address: input.address.trim(),
  }
}

/** Attaches the request to an order. One per order, replaced if asked twice. */
export async function request(orderId: number, input: InvoiceInput) {
  const clean = validateInvoice(input)

  const [existing] = await db
    .select({ id: invoices.id, documentNo: invoices.documentNo })
    .from(invoices)
    .where(eq(invoices.orderId, orderId))
    .limit(1)

  if (existing?.documentNo) {
    // Once a number is out, the document exists as far as the buyer's books are
    // concerned. Changing its details would make two different papers share a
    // number, which is the one thing the sequence must never allow.
    throw conflict('That invoice has already been issued and cannot be changed.')
  }

  if (existing) {
    await db
      .update(invoices)
      .set({
        type: clean.type,
        name: clean.name,
        taxId: clean.taxId,
        branchType: clean.branchType,
        branchCode: clean.branchCode,
        address: clean.address,
      })
      .where(eq(invoices.id, existing.id))
    return get(existing.id)
  }

  const [res] = await db.insert(invoices).values({
    orderId,
    type: clean.type,
    name: clean.name,
    taxId: clean.taxId,
    branchType: clean.branchType,
    branchCode: clean.branchCode,
    address: clean.address,
  })
  return get(Number(res.insertId))
}

/**
 * The next document number, as `INV-202610-0001`.
 *
 * Numbered within the month and from the numbers already out rather than from a
 * counter, so nothing needs to be kept in step with the table. The unique index
 * is what actually guarantees it: two payments landing in the same millisecond
 * both read the same maximum, one of them loses the insert, and the caller
 * tries again with the number that is now free.
 */
async function nextDocumentNo(when: Date): Promise<string> {
  // The school's month, so a payment taken on the morning of the 1st is not
  // numbered into the month that has just closed.
  const prefix = `INV-${schoolMonthCompact(when)}-`

  const [row] = await db
    .select({ last: sql<string | null>`MAX(${invoices.documentNo})` })
    .from(invoices)
    .where(sql`${invoices.documentNo} LIKE ${`${prefix}%`}`)

  const seq = row?.last ? Number(row.last.slice(prefix.length)) + 1 : 1
  return `${prefix}${String(seq).padStart(4, '0')}`
}

/**
 * Turns a requested invoice into an issued one.
 *
 * Called when an order is paid. Does nothing if there was no request, or if the
 * number is already out — a webhook arrives more than once, and the second
 * delivery must not produce a second document.
 */
export async function issueForOrder(orderId: number): Promise<string | null> {
  const [row] = await db
    .select({ id: invoices.id, documentNo: invoices.documentNo })
    .from(invoices)
    .where(eq(invoices.orderId, orderId))
    .limit(1)

  if (!row) return null
  if (row.documentNo) return row.documentNo

  const now = new Date()
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const documentNo = await nextDocumentNo(now)
    try {
      await db
        .update(invoices)
        .set({ documentNo, issuedAt: now })
        .where(and(eq(invoices.id, row.id), sql`${invoices.documentNo} IS NULL`))

      const [after] = await db
        .select({ documentNo: invoices.documentNo })
        .from(invoices)
        .where(eq(invoices.id, row.id))
        .limit(1)
      if (after?.documentNo) return after.documentNo
    } catch {
      // The unique index refused it: somebody else took that number between the
      // read and the write. Round again and the next one will be free.
    }
  }

  // Five collisions is not contention, it is a fault. The order is paid and the
  // access is granted; the invoice can be issued from the admin.
  return null
}

export async function get(id: number) {
  const [row] = await db
    .select({
      id: invoices.id,
      orderId: invoices.orderId,
      orderNo: orders.orderNo,
      orderStatus: orders.status,
      orderTotal: orders.total,
      orderVat: orders.vatAmount,
      paidAt: orders.paidAt,
      type: invoices.type,
      name: invoices.name,
      taxId: invoices.taxId,
      branchType: invoices.branchType,
      branchCode: invoices.branchCode,
      address: invoices.address,
      documentNo: invoices.documentNo,
      issuedAt: invoices.issuedAt,
      createdAt: invoices.createdAt,
      buyerEmail: users.email,
      buyerFirstName: users.firstName,
      buyerLastName: users.lastName,
    })
    .from(invoices)
    .innerJoin(orders, eq(orders.id, invoices.orderId))
    .innerJoin(users, eq(users.id, orders.userId))
    .where(eq(invoices.id, id))
    .limit(1)
  if (!row) throw notFound('That invoice does not exist.')
  return row
}

/**
 * The admin list.
 *
 * `status` is about the document rather than the order: `requested` is one
 * waiting on payment, `issued` has its number. They are different piles of
 * work — the first is nothing to do yet, the second is something to send.
 */
export async function list(opts: {
  page: number
  perPage: number
  status?: 'requested' | 'issued' | undefined
  type?: 'corporate' | 'individual' | undefined
  q?: string | undefined
}) {
  const term = `%${opts.q ?? ''}%`
  const where = [
    opts.status === 'issued' ? sql`${invoices.documentNo} IS NOT NULL` : undefined,
    opts.status === 'requested' ? sql`${invoices.documentNo} IS NULL` : undefined,
    opts.type ? eq(invoices.type, opts.type) : undefined,
    opts.q
      ? sql`(${invoices.name} LIKE ${term} OR ${invoices.taxId} LIKE ${term}
             OR ${invoices.documentNo} LIKE ${term} OR ${orders.orderNo} LIKE ${term})`
      : undefined,
  ].filter(Boolean)
  const filter = where.length ? and(...(where as never[])) : undefined

  const [{ value: total } = { value: 0 }] = await db
    .select({ value: sql<number>`COUNT(*)` })
    .from(invoices)
    .innerJoin(orders, eq(orders.id, invoices.orderId))
    .where(filter)

  const rows = await db
    .select({
      id: invoices.id,
      orderId: invoices.orderId,
      orderNo: orders.orderNo,
      orderStatus: orders.status,
      orderTotal: orders.total,
      orderVat: orders.vatAmount,
      paidAt: orders.paidAt,
      type: invoices.type,
      name: invoices.name,
      taxId: invoices.taxId,
      branchType: invoices.branchType,
      branchCode: invoices.branchCode,
      documentNo: invoices.documentNo,
      issuedAt: invoices.issuedAt,
      createdAt: invoices.createdAt,
      buyerEmail: users.email,
    })
    .from(invoices)
    .innerJoin(orders, eq(orders.id, invoices.orderId))
    .innerJoin(users, eq(users.id, orders.userId))
    .where(filter)
    .orderBy(desc(invoices.createdAt))
    .limit(opts.perPage)
    .offset((opts.page - 1) * opts.perPage)

  return {
    data: rows,
    meta: {
      page: opts.page,
      perPage: opts.perPage,
      total: Number(total),
      totalPages: Math.max(1, Math.ceil(Number(total) / opts.perPage)),
    },
  }
}

/**
 * Issuing by hand, for the order that was paid while something was wrong.
 *
 * Only a paid order: a document number against an unpaid basket is a tax
 * document for a sale that has not happened.
 */
export async function issueManually(id: number) {
  const invoice = await get(id)
  if (invoice.documentNo) throw conflict('That invoice already has a number.')
  if (invoice.orderStatus !== 'paid') {
    throw conflict('Only a paid order can have a tax invoice issued against it.')
  }

  const documentNo = await issueForOrder(invoice.orderId)
  if (!documentNo) throw conflict('Could not allocate a document number. Try again.')
  return get(id)
}

/** Correcting the details, while the document has not gone out. */
export async function amend(id: number, input: InvoiceInput) {
  const before = await get(id)
  if (before.documentNo) {
    throw conflict(
      'That invoice has been issued. Its details cannot be changed — cancel it and issue a new one.',
    )
  }
  await request(before.orderId, input)
  return { before, after: await get(id) }
}
