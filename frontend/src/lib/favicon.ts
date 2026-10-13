/**
 * The icon in the browser tab, swapped for the school's own.
 *
 * The one in `index.html` is a build-time file and the school's is a setting,
 * so the tag has to be rewritten once the setting is known. Replaced rather
 * than added: browsers keep every `rel="icon"` they are given and pick one,
 * and two of them is a coin toss over which school's mark appears.
 *
 * Does nothing without a path, which leaves the bundled icon alone — the right
 * behaviour before anybody has uploaded one.
 */
export function applyFavicon(url: string | null): void {
  if (!url) return

  for (const tag of document.querySelectorAll('link[rel~="icon"], link[rel="apple-touch-icon"]')) {
    tag.remove()
  }

  const icon = document.createElement('link')
  icon.rel = 'icon'
  icon.href = url
  document.head.append(icon)

  // The same file again for a phone's home screen. One square picture is what
  // both want, and asking for two uploads of the same thing is how a setting
  // ends up half filled in.
  const touch = document.createElement('link')
  touch.rel = 'apple-touch-icon'
  touch.href = url
  document.head.append(touch)
}
