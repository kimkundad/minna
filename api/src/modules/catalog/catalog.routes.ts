import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { audit, diff } from '../../lib/audit'
import { forbidden } from '../../lib/errors'
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

export default async function catalogRoutes(app: FastifyInstance) {
  const staffOnly = { preHandler: app.requireRole('admin', 'teacher') }
  const adminOnly = { preHandler: app.requireRole('admin') }

  /* ---------------- categories ---------------- */

  app.get('/categories', async (req) => {
    const query = schemas.listQuery.parse(req.query)
    // The public site and every select box want the whole list; the admin
    // table wants a page of it. `all=1` is which.
    if ((req.query as { all?: string }).all) return { data: await service.listCategories() }
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
    return { data: await service.getCourse(await service.resolveCourseRef(id), staff(req)) }
  })

  app.post('/courses', staffOnly, async (req, reply) => {
    const body = schemas.courseBody.parse(req.body)

    // A teacher who leaves themselves off their own course cannot open it
    // again, so they are added when they did not say otherwise. An admin has
    // to pick somebody; the schema already refused an empty list.
    const instructorIds = body.instructorIds?.length
      ? body.instructorIds
      : [req.user.sub]

    const created = await service.createCourse({ ...body, instructorIds }, req.user.sub)

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

    const { before, after } = await service.updateCourse(id, body)
    const changes = diff(before as never, body as never)

    audit(req, {
      // Price and status changes are the ones people come looking for, so they
      // get their own action rather than hiding inside 'course.updated'.
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
  app.get('/courses/:id/curriculum', { preHandler: app.optionalAuth }, async (req) => {
    const { id } = refParam.parse(req.params)
    const courseId = await service.resolveCourseRef(id)
    await service.getCourse(courseId, staff(req))
    return { data: await service.getCurriculum(courseId) }
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
