import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { resolveCourseRef } from '../catalog/catalog.service'
import { requireCaptcha } from '../../lib/captcha'
import * as qa from './qa.service'
import * as quiz from './quiz.service'
import * as service from './study.service'

/**
 * The inside of a course, for the member who may study it.
 *
 * Everything here is under `/me`, because everything here is about one person:
 * what they may open, where they left it, how far through they are. The
 * entitlement is checked in the service on every call rather than once at the
 * door — a route that trusts an earlier check is a route that will be reached
 * another way later.
 */
/**
 * Long enough for a real question, short enough that nobody pastes an essay
 * into a lesson thread.
 *
 * The captcha token rides along with the text. It is checked before the post is
 * looked at, and a missing one is only refused where reCAPTCHA is actually
 * configured — see `lib/captcha.ts` for why an unconfigured server lets it
 * through.
 */
const postBody = z.object({
  body: z.string().trim().min(2, 'Write a question.').max(2000),
  captcha: z.string().max(4000).optional(),
})

export default async function studyRoutes(app: FastifyInstance) {
  const signedIn = { preHandler: app.authenticate }

  /**
   * The course as the player needs it: modules, lessons, and this member's own
   * progress on each.
   *
   * Takes a slug or an id, like the public course page, so the player can be
   * linked to with the same reference the rest of the site uses.
   */
  app.get('/me/courses/:ref/curriculum', signedIn, async (req) => {
    const { ref } = z.object({ ref: z.string().min(1).max(255) }).parse(req.params)
    const courseId = await resolveCourseRef(ref)
    return { data: await service.curriculum(req.user.sub, courseId) }
  })

  /**
   * A URL that plays one lesson.
   *
   * Asked for as the lesson is opened rather than handed out with the
   * curriculum: these expire, and a page that sat open for an afternoon should
   * not be holding a dozen of them.
   */
  app.get('/me/lessons/:id/play', signedIn, async (req) => {
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(req.params)
    return { data: await service.playLesson(req.user.sub, id) }
  })

  /** A link to one of the course's handouts, signed and short-lived. */
  app.get('/me/documents/:id/link', signedIn, async (req) => {
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(req.params)
    return { data: await service.documentLink(req.user.sub, id) }
  })

  /* ---------------- the course's test ---------------- */

  /**
   * The test, as a learner may see it: questions and choices, no answer key.
   *
   * Nothing in this response says which choice is right, before the attempt or
   * after it. Retakes are unlimited, so a key that leaked once would be a key
   * forever.
   */
  app.get('/me/courses/:ref/quiz', signedIn, async (req) => {
    const { ref } = z.object({ ref: z.string().min(1).max(255) }).parse(req.params)
    const courseId = await resolveCourseRef(ref)
    return { data: await quiz.takeable(req.user.sub, courseId) }
  })

  /** Starts one, or hands back the one already in progress with its draft. */
  app.post('/me/courses/:ref/quiz/attempts', signedIn, async (req, reply) => {
    const { ref } = z.object({ ref: z.string().min(1).max(255) }).parse(req.params)
    const courseId = await resolveCourseRef(ref)
    const started = await quiz.startAttempt(req.user.sub, courseId)
    return reply.status(started.resumed ? 200 : 201).send({ data: started })
  })

  /** Autosave. Sent as the learner works, so it is cheap and says nothing. */
  app.put('/me/quiz-attempts/:id/draft', signedIn, async (req) => {
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(req.params)
    const { answers } = z
      .object({ answers: z.record(z.array(z.coerce.number().int().positive()).max(20)) })
      .parse(req.body)
    return { data: await quiz.saveDraft(req.user.sub, id, answers) }
  })

  /** Marks it. The score and the verdict come back; the key never does. */
  app.post('/me/quiz-attempts/:id/submit', signedIn, async (req) => {
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(req.params)
    const { answers } = z
      .object({ answers: z.record(z.array(z.coerce.number().int().positive()).max(20)) })
      .parse(req.body)
    return { data: await quiz.submitAttempt(req.user.sub, id, answers) }
  })

  /** A written answer, or a revised one after the teacher has asked. */
  app.post('/me/quiz-questions/:id/essay', signedIn, async (req, reply) => {
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(req.params)
    const body = z
      .object({
        body: z.string().trim().min(1).max(20000),
        attachmentPath: z.string().max(512).nullish(),
        attachmentName: z.string().max(255).nullish(),
        sizeBytes: z.coerce.number().int().min(0).nullish(),
      })
      .parse(req.body)
    return reply.status(201).send({ data: await quiz.submitEssay(req.user.sub, id, body) })
  })

  /** Every attempt, the best score, and what the teacher said about the
   *  written answers. */
  app.get('/me/courses/:ref/result', signedIn, async (req) => {
    const { ref } = z.object({ ref: z.string().min(1).max(255) }).parse(req.params)
    const courseId = await resolveCourseRef(ref)
    return { data: await quiz.result(req.user.sub, courseId) }
  })

  /* ---------------- the lesson's questions ---------------- */

  /**
   * Every question on the course.
   *
   * Course-wide rather than per lesson: a question is asked from wherever
   * somebody was and keeps that as its label, but looking for an answer means
   * looking at the course, not hunting through lessons for the thread it might
   * be under.
   */
  app.get('/me/courses/:ref/questions', signedIn, async (req) => {
    const { ref } = z.object({ ref: z.string().min(1).max(255) }).parse(req.params)
    const courseId = await resolveCourseRef(ref)
    return { data: await qa.listForCourse(req.user.sub, courseId) }
  })

  app.post('/me/lessons/:id/questions', signedIn, async (req, reply) => {
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(req.params)
    const { body, captcha } = postBody.parse(req.body)
    await requireCaptcha(captcha, 'ask_question', { ip: req.ip, field: 'body' })
    const made = await qa.ask(req.user.sub, id, body)
    return reply.status(201).send({ data: made })
  })

  /** A reply from anybody on the course — a classmate as readily as the
   *  teacher. A teacher's is badged, and only a teacher's closes the question
   *  on the admin's queue. */
  app.post('/me/questions/:id/replies', signedIn, async (req, reply) => {
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(req.params)
    const { body, captcha } = postBody.parse(req.body)
    await requireCaptcha(captcha, 'reply_question', { ip: req.ip, field: 'body' })
    return reply.status(201).send({ data: await qa.reply(req.user.sub, id, body) })
  })

  /** Rewording one's own, under the same rule as deleting it. */
  app.patch('/me/questions/:id', signedIn, async (req) => {
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(req.params)
    const { body, captcha } = postBody.parse(req.body)
    await requireCaptcha(captcha, 'edit_question', { ip: req.ip, field: 'body' })
    return { data: await qa.edit(req.user.sub, id, body) }
  })

  /** Taking back one's own, while nothing hangs off it. Moderation is the
   *  admin's, on its own audited route. */
  app.delete('/me/questions/:id', signedIn, async (req, reply) => {
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(req.params)
    await qa.remove(req.user.sub, id)
    return reply.status(204).send()
  })

  /**
   * How far through a lesson they are.
   *
   * Sent every few seconds while something is playing, so it is deliberately
   * cheap and idempotent: the same position twice changes nothing. `completed`
   * is for the lessons watching cannot finish — a PDF read to the end, a page
   * with no running time — and the server still decides for anything timed.
   */
  app.put('/me/lessons/:id/progress', signedIn, async (req) => {
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(req.params)
    const body = z
      .object({
        positionSeconds: z.coerce.number().min(0).max(24 * 3600),
        completed: z.boolean().optional(),
      })
      .parse(req.body)
    return { data: await service.saveProgress(req.user.sub, id, body) }
  })
}
