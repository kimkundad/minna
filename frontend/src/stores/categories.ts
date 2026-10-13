import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { api, type PublicCategory } from '@/lib/api'
import { categoryNameIn } from '@/lib/course'
import { i18n } from '@/locales'

/** A category as the menus draw it. */
export interface CategoryTile {
  id: number
  slug: string
  name: string
  /** The language this sits under. Four categories are called "สนทนา"; this is
   *  what tells them apart. Null on a top-level one. */
  parentName: string | null
  /** How many sub-categories a top-level one holds. Zero on a child. */
  childCount: number
  icon: string
  /** This category and everything beneath it. */
  count: number
  depth: 0 | 1
}

/**
 * The category list, fetched once for every menu that shows it.
 *
 * The header's panel, the drawer and the search box all used to carry their own
 * copy, which is how a site can rename a category and still see the old name in
 * two places out of three. One store, one fetch, one answer.
 *
 * An unreachable API leaves the list empty rather than stale or invented: the
 * menus simply do not offer categories, and the catalog page is still there.
 */
export const useCategoriesStore = defineStore('categories', () => {
  const all = ref<PublicCategory[]>([])
  const loaded = ref(false)
  let inFlight: Promise<void> | null = null

  /**
   * Parents first, each followed by its own children.
   *
   * Every category, including the ones with nothing in them yet: the home page
   * has always shown those as "coming soon", and this menu used to drop them,
   * so the two disagreed about how many categories the school has. It was easy
   * to miss while it was one or two — Thai hides "ไวยากรณ์" from the menu and
   * lists it on the page — and impossible to miss once the catalogue began
   * following the reader's language, where a language with no courses made the
   * menu say "0 categories" over a page showing eighteen.
   *
   * A tile with nothing behind it is not a dead end now that the catalogue
   * explains itself: it opens a page saying no courses are taught in this
   * language yet, with the way to see the rest.
   */
  const tiles = computed<CategoryTile[]>(() => {
    const rows = all.value
    const byId = new Map(rows.map((c) => [c.id, c]))
    // Reading the locale inside the computed is what makes the menus relabel
    // themselves when the language changes, rather than keeping whichever
    // language they were first drawn in.
    const nameOf = (c: PublicCategory) => categoryNameIn(c, i18n.global.locale.value)
    const childrenOf = (id: number) =>
      rows
        .filter((c) => c.parentId === id)
        .sort((a, b) => a.sortOrder - b.sortOrder || nameOf(a).localeCompare(nameOf(b)))

    const out: CategoryTile[] = []
    const parents = rows
      .filter((c) => c.parentId === null)
      .sort((a, b) => a.sortOrder - b.sortOrder || nameOf(a).localeCompare(nameOf(b)))

    for (const parent of parents) {
      const kids = childrenOf(parent.id)
      out.push({
        id: parent.id,
        slug: parent.slug,
        name: nameOf(parent),
        parentName: null,
        childCount: kids.length,
        icon: parent.icon ?? 'book-open',
        count: parent.totalCourseCount,
        depth: 0,
      })
      for (const kid of kids) {
        out.push({
          id: kid.id,
          slug: kid.slug,
          name: nameOf(kid),
          parentName: (() => {
            const p = byId.get(kid.parentId!)
            return p ? nameOf(p) : null
          })(),
          childCount: 0,
          // Most sub-categories have no glyph of their own: "สนทนา" is not a
          // thing with a picture, "ภาษาญี่ปุ่น" is.
          icon: kid.icon ?? parent.icon ?? 'book-open',
          count: kid.totalCourseCount,
          depth: 1,
        })
      }
    }
    return out
  })

  /** The top level alone, for the places with room for a handful. */
  const roots = computed(() => tiles.value.filter((c) => c.depth === 0))

  /**
   * Matches against every language's name, not only the one on screen.
   * Somebody typing "japanese" into the Thai site means the same category as
   * somebody typing "ภาษาญี่ปุ่น", and a search box that knows one word for a
   * thing and not the other is the kind that gets called broken.
   */
  function search(term: string, limit = 4): CategoryTile[] {
    const needle = term.trim().toLowerCase()
    if (!needle) return []
    const byId = new Map(all.value.map((c) => [c.id, c]))
    const haystack = (c: CategoryTile) => {
      const row = byId.get(c.id)
      const names = row ? [row.name, ...Object.values(row.names ?? {})] : [c.name]
      return [...names, c.parentName ?? '', c.slug].join(' ').toLowerCase()
    }
    return tiles.value.filter((c) => haystack(c).includes(needle)).slice(0, limit)
  }

  /** Safe to call from every menu on every mount; only the first one fetches. */
  /**
   * The language the list in hand was fetched for.
   *
   * It used to be fetched once and kept, which was right when the answer was
   * the same in every language. It is not any more: the count beside a
   * category is the courses a reader of *that* language can take, so a list
   * fetched in Thai puts Thai counts on the Korean menu until the page is
   * reloaded by hand.
   */
  let fetchedFor: string | null = null

  function load(force = false): Promise<void> {
    const want = String(i18n.global.locale.value)
    if (!force && loaded.value && fetchedFor === want) return Promise.resolve()

    inFlight ??= api
      .categories()
      .then((r) => {
        all.value = r.data
        fetchedFor = want
      })
      .catch(() => {
        // The menus drop their category list. Nothing else on the page cares.
      })
      .finally(() => {
        loaded.value = true
        inFlight = null
      })
    return inFlight
  }

  /**
   * Fetch again when the language changes, here rather than in each menu.
   *
   * The header, the drawer and the search box all ask this store to load, and
   * all three would have to remember to ask again. One of them would forget,
   * and the menus would disagree — which is the thing this store exists to
   * prevent.
   */
  watch(
    () => i18n.global.locale.value,
    () => void load(true),
  )

  return { all, loaded, tiles, roots, search, load }
})
