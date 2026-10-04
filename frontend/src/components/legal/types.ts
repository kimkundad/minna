/** One numbered section of a legal page: its anchor, its table-of-contents
 *  label, and the heading printed above the prose. The number itself is not
 *  stored — it is the position in the list, so dropping a section renumbers the
 *  rest on its own. */
export interface LegalSection {
  /** Anchor id, e.g. `pt-refund`. Other pages link straight to these, so an id
   *  is part of the contract and must not be renamed casually. */
  id: string
  /** Short label in the sidebar. */
  toc: string
  /** Full heading, without the leading number. */
  heading: string
}

/** A line in the hero's meta row: effective date, last update, version. */
export interface LegalMeta {
  icon: string
  text: string
}
