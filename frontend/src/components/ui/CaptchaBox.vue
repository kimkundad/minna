<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import AppIcon from './AppIcon.vue'
import { captchaSiteKey, isCaptchaEnabled, loadRecaptcha } from '@/lib/captcha'

/**
 * The "I'm not a robot" box, above whatever button sends the form.
 *
 * It holds the ticked state itself and hands the token up through `v-model`,
 * so a form only has to care that it has one. Google expires a token after a
 * couple of minutes, which is why the box clears itself rather than leaving a
 * tick over a token the server will refuse.
 *
 * Renders nothing at all when no site key is configured. A development machine
 * with no Google account should not grow a broken grey rectangle, and the API
 * is the side that actually enforces this.
 */
const model = defineModel<string>({ default: '' })

const { locale, t } = useI18n()

const host = ref<HTMLElement | null>(null)
const failed = ref(false)
let widgetId: number | null = null

const enabled = isCaptchaEnabled()

onMounted(async () => {
  if (!enabled || !host.value) return
  try {
    const grecaptcha = await loadRecaptcha(String(locale.value))
    widgetId = grecaptcha.render(host.value, {
      sitekey: captchaSiteKey()!,
      callback: (token: string) => {
        model.value = token
      },
      // Both mean the same thing to the form above: there is no token any more.
      'expired-callback': () => {
        model.value = ''
      },
      'error-callback': () => {
        model.value = ''
        failed.value = true
      },
      hl: String(locale.value),
    })
  } catch {
    failed.value = true
  }
})

onBeforeUnmount(() => {
  model.value = ''
})

/**
 * Clearing the model clears the tick.
 *
 * The parent only has to set its own value to '' after a send — it does not
 * have to hold a reference to this component. That matters: these boxes live
 * inside `v-for` lists, where a template ref collects every instance into an
 * array, and calling `.reset()` on an array throws. It did, in a `finally`,
 * which left the form's "sending" flag stuck on and the save button disabled
 * for good.
 */
watch(model, (token) => {
  if (token || widgetId === null) return
  window.grecaptcha?.reset(widgetId)
})

defineExpose({ enabled })
</script>

<template>
  <div v-if="enabled" class="captcha-box">
    <div ref="host" class="captcha-widget" />
    <p v-if="failed" class="field-error">
      <AppIcon name="alert-circle" /><span>{{ t('common.captchaFailed') }}</span>
    </p>
  </div>
</template>
