import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { audit, diff } from '../../lib/audit'
import { AppError, forbidden } from '../../lib/errors'
import { isStorageConfigured, signedUrl } from '../../lib/storage'
import { LOCALES } from '../../db/schema/auth'
import * as schemas from './catalog.schemas'
import * as service from './catalog.service'
import * as quizSchemas from './quiz.schemas'
import * as quiz from './quiz.service'

/**
 * The catalog: categories and courses.
 *
 * Reads are public but only ever return approved courses. Writes need a staff
 * role, and a teacher is further limited to the courses they are actually on —
 * checked per request against the pivot, not taken from the body.
 */

const idParam = z.object({ id: z.coerce.number().int().positive() })

/** An id or a slug. Only the two public course reads take one. */
/** How long a free sample's link stays good: long enough to watch a lesson,
 *  not long enough to be worth passing around. */
const PREVIEW_TTL = 3600

const refParam = z.object({ id: z.string().min(1).max(255) })

/** True when the caller may see drafts: staff only. */
function staff(req: FastifyRequest): boolean {
  const roles = req.user?.roles ?? []
  return roles.includes('admin') || roles.includes('teacher')
}

function isAdmin(req: FastifyRequest): boolean {
  return (req.user?.roles ?? []).includes('admin')
}

/** A teacher may only touch a course they teach. Admins may touch any. */
async function assertMayEditCourse(req: FastifyRequest, courseId: number) {
  if (isAdmin(req)) return
  if (await service.isCourseInstructor(courseId, req.user.sub)) return
  throw forbidden('You are not an instructor on this course.')
}

/**
 * Whether this reader may see a course that is not published yet.
 *
 * An admin may; so may the teacher who teaches it. Everybody else — including
 * a teacher with a course of their own elsewhere — sees what a visitor sees.
 *
 * This used to ask only whether the reader was staff, which made every draft
 * in the school readable by any teacher who tried an id: the list was already
 * narrowed to their own courses, so the front door was shut while this window
 * stood open. Nothing was editable through it and the quiz answer keys have
 * their own guard, but somebody's unfinished course and its price are still
 * theirs until they publish it.
 */
async function maySeeUnpublished(req: FastifyRequest, courseId: number): Promise<boolean> {
  if (isAdmin(req)) return true
  if (!(req.user?.roles ?? []).includes('teacher')) return false
  return service.isCourseInstructor(courseId, req.user.sub)
}

export default async function catalogRoutes(app: FastifyInstance) {
  const staffOnly = { preHandler: app.requireRole('admin', 'teacher') }
  const adminOnly = { preHandler: app.requireRole('admin') }

  /* ---------------- categories ---------------- */

  app.get('/categories', async (req) => {
    const query = schemas.listQuery.parse(req.query)
    // The public site and every select box want the whole list; the admin
    // table wants a page of it. `all=1` is which.
    if ((req.query as { all?: string }).all) {
      /**
       * `locale` narrows the course counts to what a reader of that language
       * can take. The public site sends it; the admin's select boxes do not,
       * and get the counts across every language.
       *
       * Validated against the known list rather than passed through: it lands
       * in a SQL comparison, and an unknown value would silently count nothing
       * instead of everything.
       */
      const asked = (req.query as { locale?: string }).locale
      const locale = asked && (LOCALES as readonly string[]).includes(asked) ? asked : undefined
      return { data: await service.listCategories(locale) }
    }
    return service.listCategoriesPaged(query)
  })

  app.post('/categories', adminOnly, async (req, reply) => {
    const body = schemas.categoryBody.parse(req.body)
    const created = await service.createCategory(body)

    audit(req, {
      action: 'category.created',
      subjectType: 'category',
      subjectId: created.id,
      summary: created.name,
    })
    return reply.status(201).send({ data: created })
  })

  app.patch('/categories/:id', adminOnly, async (req) => {
    const { id } = idParam.parse(req.params)
    const body = schemas.categoryPatch.parse(req.body)
    const { before, after } = await service.updateCategory(id, body)

    audit(req, {
      action: 'category.updated',
      subjectType: 'category',
      subjectId: id,
      summary: after.name,
      changes: diff(before as never, body as never),
    })
    return { data: after }
  })

  app.delete('/categories/:id', adminOnly, async (req, reply) => {
    const { id } = idParam.parse(req.params)
    const removed = await service.deleteCategory(id)

    audit(req, {
      action: 'category.deleted',
      subjectType: 'category',
      subjectId: id,
      summary: removed.name,
    })
    return reply.status(204).send()
  })

  /* ---------------- courses ---------------- */

  app.get('/courses', { preHandler: app.optionalAuth }, async (req) => {
    const { facets, ...query } = schemas.courseListQuery.parse(req.query)
    const canSeeDrafts = staff(req)

    const opts = {
      ...query,
      includeUnpublished: canSeeDrafts,
      // A teacher's list is their own courses. An admin's is everything.
      instructorId: canSeeDrafts && !isAdmin(req) ? req.user.sub : undefined,
    }

    const page = await service.listCourses(opts)
    if (!facets) return page

    // Alongside the page, not instead of it: the catalog draws both at once.
    return { ...page, facets: await service.courseFacets(opts) }
  })

  // The only two reads a visitor makes by name rather than by number. See
  // `resolveCourseRef` for why both are allowed.
  app.get('/courses/:id', { preHandler: app.optionalAuth }, async (req) => {
    const { id } = refParam.parse(req.params)
    const courseId = await service.resolveCourseRef(id)
    return { data: await service.getCourse(courseId, await maySeeUnpublished(req, courseId)) }
  })

  app.post('/courses', staffOnly, async (req, reply) => {
    const body = schemas.courseBody.parse(req.body)

    /**
     * Whose course this is.
     *
     * A teacher's is their own, and they do not get to say otherwise: putting
     * it under somebody else's name would make a course they cannot open and
     * hand work to a colleague who never agreed to it. The picker they would
     * choose from is an admin-only list anyway.
     *
     * An admin has to name somebody. There is no sensible default — an admin
     * creating a course is rarely the one who will teach it.
     */
    let instructorIds: number[]
    if (isAdmin(req)) {
      if (!body.instructorIds?.length) {
        throw new AppError(422, 'validation_failed', 'Some fields need fixing.', {
          instructorIds: 'Choose who teaches this course.',
        })
      }
      instructorIds = body.instructorIds
    } else {
      instructorIds = [req.user.sub]
    }

    // Same rule as on the patch: the share is not the teacher's to name. Here
    // it is dropped rather than refused, because a teacher's form never offers
    // the field — a value arriving from one is a stale client or a hand-made
    // request, and neither is worth failing a course they have just written.
    const created = await service.createCourse(
      { ...body, instructorIds },
      req.user.sub,
    )

    audit(req, {
      action: 'course.created',
      subjectType: 'course',
      subjectId: created.id,
      summary: created.title,
    })
    return reply.status(201).send({ data: created })
  })

  app.patch('/courses/:id', staffOnly, async (req) => {
    const { id } = idParam.parse(req.params)
    await assertMayEditCourse(req, id)

    const body = schemas.coursePatch.parse(req.body)

    // Approving is a decision about what the public sees and what can be sold.
    // A teacher proposes by setting 'pending'; only an admin approves.
    if (body.status && !isAdmin(req) && !['draft', 'pending'].includes(body.status)) {
      throw forbidden('Only an administrator can approve or end a course.')
    }

    // The note is the reviewer's verdict on the work, so it is not the
    // author's to write — a teacher could otherwise answer their own review,
    // and the next administrator to open the course would read it as theirs.
    if (body.reviewNote !== undefined && !isAdmin(req)) {
      throw forbidden('Only an administrator can write a review note.')
    }

    // Who teaches it is an admin's decision too. A teacher handing their course
    // to somebody else locks themselves out of it in the same request, and
    // taking somebody else's course is not theirs to do either.
    if (body.instructorIds && !isAdmin(req)) {
      throw forbidden('Only an administrator can change who teaches a course.')
    }

    const { before, after } = await service.updateCourse(id, body, { sub: req.user.sub })
    const changes = diff(before as never, body as never)

    audit(req, {
      // Price, share and status changes are the ones people come looking for,
      // so they get their own action rather than hiding inside
      // 'course.updated'. The share is named ahead of the price because it is
      // what a payout dispute is argued over, and the full diff is recorded
      // either way.
      action:
        changes && 'status' in changes
          ? 'course.status_changed'
          : changes && ('price' in changes || 'normalPrice' in changes)
            ? 'course.price_changed'
            : 'course.updated',
      subjectType: 'course',
      subjectId: id,
      summary: after.title,
      changes,
    })
    return { data: after }
  })

  app.delete('/courses/:id', adminOnly, async (req, reply) => {
    const { id } = idParam.parse(req.params)
    const removed = await service.deleteCourse(id)

    audit(req, {
      action: 'course.deleted',
      subjectType: 'course',
      subjectId: id,
      summary: removed.title,
    })
    return reply.status(204).send()
  })
  /* ---------------- curriculum ---------------- */

  // Guests see the curriculum of a published course, which is how a sales page
  // lists what is inside before anyone pays. getCourse does the status check.
  /**
   * A free sample lesson, playable by anybody.
   *
   * Public on purpose: the point of a sample is that somebody who has not
   * bought the course can watch it. The file itself stays private — what this
   * hands back is a signature for one file that expires within the hour, which
   * is long enough to watch a lesson and not long enough to pass around.
   */
  app.get('/courses/:id/lessons/:lessonId/preview', async (req) => {
    const { id, lessonId } = z
      .object({ id: z.string().min(1).max(255), lessonId: z.coerce.number().int().positive() })
      .parse(req.params)

    const courseId = await service.resolveCourseRef(id)
    const lesson = await service.getPreviewLesson(courseId, lessonId)

    if (!lesson.videoPath || !isStorageConfigured()) {
      // The lesson is a sample, but nothing has been uploaded to it yet. Said
      // plainly, because "not found" would send the reader looking for a typo.
      return {
        data: {
          id: lesson.id,
          title: lesson.title,
          subtitle: lesson.subtitle,
          courseTitle: lesson.courseTitle,
          durationSeconds: lesson.durationSeconds,
          url: null,
        },
      }
    }

    return {
      data: {
        id: lesson.id,
        title: lesson.title,
        subtitle: lesson.subtitle,
        courseTitle: lesson.courseTitle,
        durationSeconds: lesson.durationSeconds,
        url: signedUrl(lesson.videoPath, PREVIEW_TTL),
      },
    }
  })

  app.get('/courses/:id/curriculum', { preHandler: app.optionalAuth }, async (req) => {
    const { id } = refParam.parse(req.params)
    const courseId = await service.resolveCourseRef(id)
    // Read for the side effect: it is what refuses a course this reader may
    // not see, before its lessons are handed over.
    await service.getCourse(courseId, await maySeeUnpublished(req, courseId))
    return { data: await service.getCurriculum(courseId) }
  })

  /* ---------------- the course's own handouts ---------------- */

  /**
   * Files that belong to the course rather than to one lesson.
   *
   * They appear in the learning room's documents tab under every lesson, so a
   * handbook is to hand wherever the reader is. Listing is staff-only here; the
   * student's copy of this list comes with the curriculum, where the
   * entitlement has already been checked.
   */
  app.get('/courses/:id/documents', staffOnly, async (req) => {
    const { id } = idParam.parse(req.params)
    await assertMayEditCourse(req, id)
    return { data: await service.listDocuments(id) }
  })

  app.post('/courses/:id/documents', staffOnly, async (req, reply) => {
    const { id } = idParam.parse(req.params)
    await assertMayEditCourse(req, id)
    const body = z
      .object({
        fileName: z.string().trim().min(1, 'Give the file a name.').max(255),
        /** What the upload returned. A path, never a URL: a URL expires. */
        filePath: z.string().trim().min(1).max(512),
        sizeBytes: z.coerce.number().int().min(0).nullish(),
      })
      .parse(req.body)

    const created = await service.addDocument(id, body)
    audit(req, {
      action: 'course_document.added',
      subjectType: 'course',
      subjectId: id,
      summary: created.fileName,
    })
    return reply.status(201).send({ data: created })
  })

  /** The name only. Swapping the file means removing one and adding another,
   *  so that a link somebody already has does not become another document. */
  app.patch('/courses/:id/documents/:documentId', staffOnly, async (req) => {
    const { id, documentId } = z
      .object({
        id: z.coerce.number().int().positive(),
        documentId: z.coerce.number().int().positive(),
      })
      .parse(req.params)
    await assertMayEditCourse(req, id)
    const { fileName } = z
      .object({ fileName: z.string().trim().min(1, 'Give the file a name.').max(255) })
      .parse(req.body)

    const row = await service.renameDocument(id, documentId, fileName)
    audit(req, {
      action: 'course_document.renamed',
      subjectType: 'course',
      subjectId: id,
      summary: fileName,
    })
    return { data: row }
  })

  app.delete('/courses/:id/documents/:documentId', staffOnly, async (req, reply) => {
    const { id, documentId } = z
      .object({
        id: z.coerce.number().int().positive(),
        documentId: z.coerce.number().int().positive(),
      })
      .parse(req.params)
    await assertMayEditCourse(req, id)

    const row = await service.deleteDocument(id, documentId)
    audit(req, {
      action: 'course_document.removed',
      subjectType: 'course',
      subjectId: id,
      summary: row.fileName,
    })
    return reply.status(204).send()
  })

  app.post('/courses/:id/modules', staffOnly, async (req, reply) => {
    const { id } = idParam.parse(req.params)
    await assertMayEditCourse(req, id)
    const body = schemas.moduleBody.parse(req.body)
    const created = await service.createModule(id, body)

    audit(req, {
      action: 'module.created',
      subjectType: 'course',
      subjectId: id,
      summary: created.title,
    })
    return reply.status(201).send({ data: created })
  })

  app.patch('/courses/:id/modules/:moduleId', staffOnly, async (req) => {
    const { id } = idParam.parse(req.params)
    const { moduleId } = z.object({ moduleId: z.coerce.number().int().positive() }).parse(req.params)
    await assertMayEditCourse(req, id)

    const body = schemas.modulePatch.parse(req.body)
    const { before, after } = await service.updateModule(id, moduleId, body)

    audit(req, {
      action: 'module.updated',
      subjectType: 'course',
      subjectId: id,
      summary: after.title,
      changes: diff(before as never, body as never),
    })
    return { data: after }
  })

  app.delete('/courses/:id/modules/:moduleId', staffOnly, async (req, reply) => {
    const { id } = idParam.parse(req.params)
    const { moduleId } = z.object({ moduleId: z.coerce.number().int().positive() }).parse(req.params)
    await assertMayEditCourse(req, id)

    const removed = await service.deleteModule(id, moduleId)
    audit(req, {
      action: 'module.deleted',
      subjectType: 'course',
      subjectId: id,
      summary: removed.title,
    })
    return reply.status(204).send()
  })

  app.post('/courses/:id/lessons', staffOnly, async (req, reply) => {
    const { id } = idParam.parse(req.params)
    await assertMayEditCourse(req, id)
    const body = schemas.lessonBody.parse(req.body)
    const created = await service.createLesson(id, body)

    audit(req, {
      action: 'lesson.created',
      subjectType: 'course',
      subjectId: id,
      summary: created.title,
    })
    return reply.status(201).send({ data: created })
  })

  app.patch('/courses/:id/lessons/:lessonId', staffOnly, async (req) => {
    const { id } = idParam.parse(req.params)
    const { lessonId } = z.object({ lessonId: z.coerce.number().int().positive() }).parse(req.params)
    await assertMayEditCourse(req, id)

    const body = schemas.lessonPatch.parse(req.body)
    const { before, after } = await service.updateLesson(id, lessonId, body)

    audit(req, {
      action: 'lesson.updated',
      subjectType: 'course',
      subjectId: id,
      summary: after.title,
      changes: diff(before as never, body as never),
    })
    return { data: after }
  })

  app.delete('/courses/:id/lessons/:lessonId', staffOnly, async (req, reply) => {
    const { id } = idParam.parse(req.params)
    const { lessonId } = z.object({ lessonId: z.coerce.number().int().positive() }).parse(req.params)
    await assertMayEditCourse(req, id)

    const removed = await service.deleteLesson(id, lessonId)
    audit(req, {
      action: 'lesson.deleted',
      subjectType: 'course',
      subjectId: id,
      summary: removed.title,
    })
    return reply.status(204).send()
  })

  // Reordering is its own call rather than a patch per row: dragging a lesson
  // up a list changes the position of everything it passes, and sending those
  // one at a time leaves the order wrong if the tab closes halfway.
  app.post('/courses/:id/reorder/:what', staffOnly, async (req, reply) => {
    const { id } = idParam.parse(req.params)
    const { what } = z.object({ what: z.enum(['modules', 'lessons']) }).parse(req.params)
    await assertMayEditCourse(req, id)

    const { ids } = schemas.reorderBody.parse(req.body)
    await service.reorder(what, id, ids)

    audit(req, {
      action: what === 'modules' ? 'module.reordered' : 'lesson.reordered',
      subjectType: 'course',
      subjectId: id,
    })
    return reply.status(204).send()
  })
  /* ---------------- quiz ---------------- */

  // Every course and the state of its quiz, including the ones with none:
  // "which courses still need a test" is the question this answers.
  app.get('/quizzes', staffOnly, async (req) => {
    const query = z
      .object({
        page: z.coerce.number().int().min(1).default(1),
        perPage: z.coerce.number().int().min(1).max(100).default(20),
        q: z.string().max(200).optional(),
        has: z.enum(['with', 'without']).optional(),
      })
      .parse(req.query)

    return quiz.listQuizzes({
      ...query,
      instructorId: isAdmin(req) ? undefined : req.user.sub,
    })
  })

  // Staff only, including the read: this returns which choices are correct,
  // and the learner's side of the app must never see that.
  app.get('/courses/:id/quiz', staffOnly, async (req) => {
    const { id } = idParam.parse(req.params)
    await assertMayEditCourse(req, id)
    return { data: await quiz.getQuiz(id) }
  })

  app.put('/courses/:id/quiz', staffOnly, async (req) => {
    const { id } = idParam.parse(req.params)
    await assertMayEditCourse(req, id)

    const body = quizSchemas.quizBody.parse(req.body)
    const existed = Boolean(await quiz.getQuiz(id))
    const saved = await quiz.saveQuiz(id, body)

    audit(req, {
      action: existed ? 'quiz.updated' : 'quiz.created',
      subjectType: 'course',
      subjectId: id,
      summary: saved.title,
    })
    return { data: saved }
  })

  app.delete('/courses/:id/quiz', adminOnly, async (req, reply) => {
    const { id } = idParam.parse(req.params)
    const removed = await quiz.deleteQuiz(id)

    audit(req, {
      action: 'quiz.deleted',
      subjectType: 'course',
      subjectId: id,
      // Worth spelling out in the record: this took the attempts with it.
      summary: `${removed.title} — ${removed.questions.length} question(s) and every attempt`,
    })
    return reply.status(204).send()
  })

  app.post('/courses/:id/quiz/questions', staffOnly, async (req, reply) => {
    const { id } = idParam.parse(req.params)
    await assertMayEditCourse(req, id)

    const body = quizSchemas.questionBody.parse(req.body)
    const created = await quiz.createQuestion(id, body)

    audit(req, {
      action: 'quiz.question_added',
      subjectType: 'course',
      subjectId: id,
      summary: created.text.slice(0, 120),
    })
    return reply.status(201).send({ data: created })
  })

  app.put('/courses/:id/quiz/questions/:questionId', staffOnly, async (req) => {
    const { id } = idParam.parse(req.params)
    const { questionId } = z
      .object({ questionId: z.coerce.number().int().positive() })
      .parse(req.params)
    await assertMayEditCourse(req, id)

    const body = quizSchemas.questionBody.parse(req.body)
    const { after } = await quiz.updateQuestion(id, questionId, body)

    audit(req, {
      action: 'quiz.question_updated',
      subjectType: 'course',
      subjectId: id,
      summary: after.text.slice(0, 120),
    })
    return { data: after }
  })

  app.delete('/courses/:id/quiz/questions/:questionId', staffOnly, async (req, reply) => {
    const { id } = idParam.parse(req.params)
    const { questionId } = z
      .object({ questionId: z.coerce.number().int().positive() })
      .parse(req.params)
    await assertMayEditCourse(req, id)

    const removed = await quiz.deleteQuestion(id, questionId)

    audit(req, {
      action: 'quiz.question_deleted',
      subjectType: 'course',
      subjectId: id,
      summary: removed.text.slice(0, 120),
    })
    return reply.status(204).send()
  })

  app.post('/courses/:id/quiz/reorder', staffOnly, async (req, reply) => {
    const { id } = idParam.parse(req.params)
    await assertMayEditCourse(req, id)

    const { ids } = quizSchemas.reorderQuestionsBody.parse(req.body)
    await quiz.reorderQuestions(id, ids)

    audit(req, { action: 'quiz.reordered', subjectType: 'course', subjectId: id })
    return reply.status(204).send()
  })
}
