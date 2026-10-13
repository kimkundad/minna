/**
 * Whose work a staff screen is about.
 *
 * Two roles can open the admin, and they mean different things by "the
 * questions waiting" or "this month's results". A teacher means their own
 * courses; an admin means the school's.
 *
 * Someone can hold both. That is the case this exists for: deciding on the
 * teacher role alone showed an admin who also teaches a dashboard narrowed to
 * their own two courses, so the school looked like it had two essays waiting
 * when it had forty. Admin is the wider view, so admin wins — a teaching admin
 * who wants their own list opens the course.
 *
 * Returns null when there is nothing to narrow by, which is what every caller
 * reads as "all of it".
 */
export function teacherScope(user: { roles: string[]; sub: number }): number | null {
  const isStaff = user.roles.includes('admin') || user.roles.includes('superadmin')
  if (isStaff) return null
  return user.roles.includes('teacher') ? user.sub : null
}
