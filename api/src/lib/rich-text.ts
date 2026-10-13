import sanitizeHtml from 'sanitize-html'
import { z } from 'zod'

/**
 * Cleaning the HTML that comes out of the admin's rich text editor.
 *
 * Three fields are written as HTML and rendered as HTML: a course's
 * description, an article's body, and a teacher's own biography. Until this
 * existed, none of them were cleaned anywhere — and the editor has
 * SourceEditing turned on, so anybody who can reach the form can type raw
 * markup rather than being limited to the toolbar.
 *
 * The biography is the one that matters most. A teacher edits their own
 * through `/me/profile`, and it is shown on the public course page to every
 * visitor — so without this, the least privileged account on the system could
 * put a script into a page everybody else reads.
 *
 * Cleaned on the way in rather than on the way out. The stored value is then
 * the safe one, and every reader of it gets that — the website, the Flutter
 * app, an email, a receipt — rather than each having to remember.
 */

/**
 * What the editor can actually produce, and nothing else.
 *
 * Built from the plugin list in `backend/src/components/forms/RichTextField.vue`.
 * Anything outside it is dropped rather than escaped: an admin pasting from
 * Word should get their text, not a page full of visible tags.
 */
const ALLOWED_TAGS = [
  'p',
  'br',
  'h2',
  'h3',
  'h4',
  'strong',
  'b',
  'em',
  'i',
  'u',
  's',
  'a',
  'ul',
  'ol',
  'li',
  'blockquote',
  'hr',
  'figure',
  'figcaption',
  'img',
  'table',
  'thead',
  'tbody',
  'tr',
  'th',
  'td',
  'span',
]

/**
 * `class` is allowed on the block elements because CKEditor carries its own
 * there — `image-style-side`, `image_resized` and the table wrappers — and
 * stripping them would leave the markup intact but the layout wrong.
 *
 * `style` is allowed on images and figures only, and then only for the three
 * properties listed in `ALLOWED_STYLES`. The editor writes an `aspect-ratio`
 * there so the page does not jump while a picture loads, and a width when
 * somebody resizes one — both worth keeping. Everything else is dropped,
 * because `style` is how a stripped tag gets its behaviour back: a
 * `position: fixed` sheet over the page, or a background image pointing at a
 * server that then knows who read the article.
 */
const ALLOWED_ATTRIBUTES: sanitizeHtml.IOptions['allowedAttributes'] = {
  a: ['href', 'name', 'target', 'rel'],
  img: ['src', 'alt', 'title', 'width', 'height', 'class', 'style'],
  figure: ['class', 'style'],
  table: ['class'],
  td: ['colspan', 'rowspan'],
  th: ['colspan', 'rowspan', 'scope'],
  p: ['class'],
  span: ['class'],
  div: ['class'],
}

/**
 * The only CSS that survives, and only on a picture or its figure.
 *
 * Each value is matched against a pattern rather than merely named, so
 * `width: 40%` is kept and `width: calc(100vw)` is not — a property is only
 * safe together with the shapes its value is allowed to take.
 */
const ALLOWED_STYLES: sanitizeHtml.IOptions['allowedStyles'] = {
  img: {
    'aspect-ratio': [/^\d{1,5}\s*\/\s*\d{1,5}$/],
    width: [/^\d{1,4}(\.\d+)?(px|%)$/],
    height: [/^(auto|\d{1,4}(\.\d+)?(px|%))$/],
  },
  figure: {
    width: [/^\d{1,4}(\.\d+)?(px|%)$/],
  },
}

const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: ALLOWED_TAGS,
  allowedAttributes: ALLOWED_ATTRIBUTES,
  allowedStyles: ALLOWED_STYLES,
  // `data:` is not here on purpose. A data URL can carry an SVG, and an SVG
  // can carry a script.
  allowedSchemes: ['http', 'https', 'mailto', 'tel'],
  allowedSchemesAppliedToAttributes: ['href', 'src'],
  // A link out of the site opens in a new tab, and `noopener` stops the page
  // it opens from reaching back into this one through `window.opener`.
  transformTags: {
    a: (tagName, attribs) => {
      if (attribs.target === '_blank') {
        return { tagName, attribs: { ...attribs, rel: 'noopener noreferrer' } }
      }
      return { tagName, attribs }
    },
  },
  // The contents go too, not just the tags. Keeping the text of a <script>
  // would leave the code sitting visibly in the middle of the page.
  nonTextTags: ['style', 'script', 'textarea', 'option', 'noscript', 'iframe'],
}

/**
 * Cleans one rich text field.
 *
 * Returns null for anything that was empty, or that had nothing left after
 * cleaning — a value of `<p></p>` is not a description, and storing it means
 * every `v-if` that asks whether there is one answers yes.
 */
export function cleanRichText(html: string | null | undefined): string | null {
  if (html == null) return null
  const clean = sanitizeHtml(html, OPTIONS).trim()
  // Tags with no words in them: what an editor leaves behind when its content
  // is deleted but the cursor stays.
  return sanitizeHtml(clean, { allowedTags: [], allowedAttributes: {} }).trim() === '' &&
    !clean.includes('<img')
    ? null
    : clean
}

/**
 * A rich text field, for a zod schema: length-checked, then cleaned.
 *
 * Used in place of `z.string().max(n).nullish()` wherever a field is written
 * as HTML, so the cleaning happens at the edge and no route can forget it.
 *
 * `undefined` is passed through untouched rather than folded into null,
 * because a PATCH tells the two apart: absent means leave it alone, null
 * means empty it.
 */
export function richTextField(max: number) {
  return z
    .string()
    .max(max)
    .nullish()
    .transform((v) => (v === undefined ? undefined : cleanRichText(v)))
}

/**
 * The same text with no markup at all.
 *
 * For the places that need the words without the layout — a meta description,
 * an email's plain part, the excerpt under a search result.
 */
export function plainText(html: string | null | undefined): string {
  if (html == null) return ''
  // A space where each block ended, before the tags go. Without it the last
  // word of one paragraph and the first of the next are run together, and
  // `<p>one</p><p>two</p>` reads as "onetwo" — which then gets quoted in a
  // search result or an email as if somebody had typed it that way.
  const spaced = html.replace(/<\/(p|div|li|h[1-6]|blockquote|tr|figcaption)\s*>/gi, ' ')
    .replace(/<(br|hr)\s*\/?>/gi, ' ')
  return sanitizeHtml(spaced, { allowedTags: [], allowedAttributes: {} })
    .replace(/\s+/g, ' ')
    .trim()
}
