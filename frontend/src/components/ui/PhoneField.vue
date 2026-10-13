<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import intlTelInput from 'intl-tel-input'
import type { Iti } from 'intl-tel-input'
import type { AppLocale } from '@/locales'

/**
 * A phone number with a country picker.
 *
 * This replaced a hand-written list of a dozen dialling codes. That list was
 * fine until someone from the thirteenth country tried to sign up, and keeping
 * it right — new codes, renamed countries, which flag belongs to which — is
 * work nobody should be doing by hand. intl-tel-input ships every country, a
 * searchable list, flags, and libphonenumber's idea of what a valid number
 * looks like in each one.
 *
 * The heavy part is libphonenumber itself, which is bigger than everything else
 * on the page put together, so it is imported only once this field is on screen
 * and the picker works before it arrives.
 *
 * It hands back the two pieces the API stores separately: the dialling code
 * with its plus, and the national number. E.164 is derived from them when it is
 * needed, rather than being a third thing that can disagree with the other two.
 */
const props = defineProps<{
  countryCode: string
  national: string
  locale: AppLocale
  id?: string
  placeholder?: string
  invalid?: boolean
}>()

const emit = defineEmits<{
  'update:countryCode': [string]
  'update:national': [string]
  /** Null until libphonenumber has loaded, so a caller can tell "not yet"
   *  from "no". */
  validity: [boolean | null]
}>()

/** The country whose flag to show first. English has no country of its own, so
 *  it gets the one on the flag in the language menu. */
const INITIAL_COUNTRY: Record<AppLocale, string> = {
  th: 'th',
  en: 'gb',
  jp: 'jp',
  vn: 'vn',
  id: 'id',
  zh: 'cn',
  ko: 'kr',
  tw: 'tw',
}

/**
 * intl-tel-input names its translations by language, not by our locale key —
 * it passes this straight to `Intl.DisplayNames`, so these are BCP-47 tags.
 * Chinese needs its script rather than a country: `zh` writes 简体 and `tw`
 * writes 繁體, which is the whole difference between the two.
 */
const NAME_LOCALE: Record<AppLocale, string> = {
  th: 'th',
  en: 'en',
  jp: 'ja',
  vn: 'vi',
  id: 'id',
  zh: 'zh-Hans',
  ko: 'ko',
  tw: 'zh-Hant',
}

const el = ref<HTMLInputElement | null>(null)
let iti: Iti | null = null

function publish() {
  const input = el.value
  if (!input || !iti) return

  const country = iti.getSelectedCountry()
  if (country?.dialCode) emit('update:countryCode', `+${country.dialCode}`)
  emit('update:national', input.value.trim())

  // Before utils loads this returns null; after, a real answer. An empty field
  // is not invalid — the number is optional, and required-ness is the form's
  // business, not this field's.
  emit('validity', input.value.trim() ? iti.isValidNumber() : null)
}

onMounted(() => {
  if (!el.value) return

  iti = intlTelInput(el.value, {
    initialCountry: INITIAL_COUNTRY[props.locale] as never,
    countryNameLocale: NAME_LOCALE[props.locale],
    // The code sits in the button beside the field rather than inside the
    // input, so what someone types is only ever their own number.
    separateDialCode: true,
    countrySearch: true,
    // Refuses characters that cannot appear in a number and stops at the right
    // length for the chosen country.
    strictMode: true,
    formatAsYouType: true,
    loadUtils: () => import('intl-tel-input/utils'),
  })

  // The country the dial code came from, when there is one to restore.
  if (props.countryCode) {
    const match = intlTelInput
      .getAllCountries()
      .find((c) => `+${c.dialCode}` === props.countryCode)
    if (match) iti.setSelectedCountry(match.iso2)
  }
  if (props.national) el.value.value = props.national

  el.value.addEventListener('input', publish)
  el.value.addEventListener('countrychange', publish)
  // Validity only becomes knowable once libphonenumber is in.
  iti.promise.then(publish).catch(() => {})
})

onBeforeUnmount(() => {
  el.value?.removeEventListener('input', publish)
  el.value?.removeEventListener('countrychange', publish)
  iti?.destroy()
  iti = null
})

/** The parent can clear the field — after a successful submit, say. */
watch(
  () => props.national,
  (value) => {
    if (el.value && el.value.value !== value) el.value.value = value
  },
)

const wrapClass = computed(() => ({ 'phone-field': true, 'is-invalid': Boolean(props.invalid) }))
</script>

<template>
  <div :class="wrapClass">
    <input
      :id="props.id"
      ref="el"
      class="input"
      type="tel"
      autocomplete="tel-national"
      :placeholder="props.placeholder"
      :aria-invalid="props.invalid ? 'true' : undefined"
    />
  </div>
</template>
