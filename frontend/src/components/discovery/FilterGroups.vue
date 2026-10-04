<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import AppIcon from '@/components/ui/AppIcon.vue'

/**
 * The six facet groups, as the catalog's sidebar and its mobile sheet both
 * render them.
 *
 * Counts are asked for one at a time rather than handed over as a map: a
 * facet's count is "how many results if this were the only choice in its own
 * group", which depends on every other group's current state, so the page owns
 * that sum and this component only displays it.
 *
 * The category group is the one with 24 options, so it shows the first eight
 * and keeps the rest behind "ดูทั้งหมด" — except for any already ticked, which
 * stay pinned open so a URL like ?category=urology does not hide its own
 * filter.
 */
export interface FilterGroup {
  key: string
  label: string
  /** [value, label] pairs, in the order the design lists them. */
  opts: [string, string][]
}

const props = withDefaults(
  defineProps<{
    /** Id namespace, so the sidebar and the sheet can both be in the DOM. */
    idPrefix: string
    groups: FilterGroup[]
    selected: Record<string, string[]>
    countOf: (key: string, value: string) => number
    /** How many category options show before "ดูทั้งหมด". */
    catVisible?: number
    catOpen: boolean
    /** Category values forced visible because they are ticked. */
    pinned: Record<string, boolean>
  }>(),
  { catVisible: 8 },
)

const emit = defineEmits<{
  change: [key: string, value: string, checked: boolean]
  more: []
}>()

const { t } = useI18n()

/** Every group starts open, and collapsing one is a local view decision — it
 *  changes nothing about the results, so the page does not need to know. */
const collapsed = ref<Record<string, boolean>>({})

const total = computed(() => props.groups[0]?.opts.length ?? 0)

function isChecked(key: string, value: string): boolean {
  return (props.selected[key] ?? []).includes(value)
}

/** A zero count is still clickable while it is ticked: it is the only way to
 *  untick it. */
function isZero(key: string, value: string): boolean {
  return props.countOf(key, value) === 0 && !isChecked(key, value)
}

function isHidden(group: FilterGroup, index: number, value: string): boolean {
  if (group.key !== 'category' || index < props.catVisible) return false
  return !props.catOpen && !props.pinned[value]
}
</script>

<template>
  <div v-for="g in groups" :key="g.key" class="flt-group" :data-group="g.key">
    <h3 class="flt-h">
      <button
        type="button"
        class="flt-toggle"
        data-flt-toggle
        :aria-expanded="collapsed[g.key] ? 'false' : 'true'"
        :aria-controls="`${idPrefix}-${g.key}-panel`"
        @click="collapsed[g.key] = !collapsed[g.key]"
      >
        <span class="flt-name">{{ g.label }}</span>
        <span class="flt-sel" data-sel :hidden="!(selected[g.key] ?? []).length">
          <template v-if="(selected[g.key] ?? []).length">
            <span class="sr-only">{{ t('catalog.selectedPrefix') }}</span
            >{{ (selected[g.key] ?? []).length }}
          </template>
        </span>
        <AppIcon name="chevron-down" />
      </button>
    </h3>
    <div class="flt-panel" :id="`${idPrefix}-${g.key}-panel`" :hidden="collapsed[g.key]">
      <fieldset class="fieldset">
        <legend class="sr-only">{{ g.label }}</legend>
        <ul class="flt-list" role="list" :id="`${idPrefix}-${g.key}-list`">
          <li
            v-for="(o, i) in g.opts"
            :key="o[0]"
            class="flt-item"
            :class="{ 'is-zero': isZero(g.key, o[0]) }"
            :data-more="g.key === 'category' && i >= catVisible ? '' : undefined"
            :hidden="isHidden(g, i, o[0])"
          >
            <label class="check flt-opt" :for="`${idPrefix}-${g.key}-${o[0]}`">
              <input
                type="checkbox"
                :id="`${idPrefix}-${g.key}-${o[0]}`"
                :value="o[0]"
                :data-flt="g.key"
                :checked="isChecked(g.key, o[0])"
                @change="
                  emit('change', g.key, o[0], ($event.target as HTMLInputElement).checked)
                "
              />
              <span class="flt-text">{{ o[1] }}</span>
              <span class="flt-count" data-count
                >{{ countOf(g.key, o[0]) }}<span class="sr-only">{{
                  ` ${t('catalog.coursesUnit')}`
                }}</span></span
              >
            </label>
          </li>
        </ul>
        <button
          v-if="g.key === 'category'"
          type="button"
          class="cat-textbtn flt-more"
          data-cat-more
          :aria-expanded="catOpen ? 'true' : 'false'"
          :aria-controls="`${idPrefix}-category-list`"
          @click="emit('more')"
        >
          <template v-if="catOpen"
            >{{ t('catalog.showLess') }}<AppIcon name="chevron-up"
          /></template>
          <template v-else
            >{{ t('catalog.showAllCategories', { count: total }) }}<AppIcon
              name="chevron-down"
          /></template>
        </button>
      </fieldset>
    </div>
  </div>
</template>
