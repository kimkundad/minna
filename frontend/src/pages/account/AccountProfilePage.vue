<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import AccountShell from '@/components/account/AccountShell.vue'
import AppBadge from '@/components/ui/AppBadge.vue'
import AppIcon from '@/components/ui/AppIcon.vue'
import { call, todayISO, useStoreTick } from '@/components/account/account'
import type { DeviceLike, ProfileLike } from '@/components/account/types'
import { data } from '@/vendor'
import { dateLong } from '@/lib/format'

/**
 * Account settings, in four parts a jump nav lets you skip between: who you
 * are, what you want to see, who is signed in as you, and what may be sent to
 * you.
 *
 * Only the first two are forms you submit. Devices and notification switches
 * save the moment you touch them, because confirming "yes, really sign that
 * tablet out" twice helps nobody.
 */
const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const tick = useStoreTick()

const locale = computed(() => String(route.params.locale ?? 'th'))
const path = (p: string) => `/${locale.value}${p}`

const memberType = computed(() => {
  void tick.value
  return call<string>('memberType')
})
const memberTypeLabel = computed(() => call<{ memberTypeLabel: string }>('user').memberTypeLabel)
const isStudent = computed(() => memberType.value === 'student')

/* ---------------- Personal information ---------------- */

const PREFIXES = [
  { value: 'นักศึกษาสัตวแพทย์', key: 'student' },
  { value: 'นายสัตวแพทย์', key: 'male' },
  { value: 'สัตวแพทย์หญิง', key: 'female' },
] as const

const saved = computed(() => {
  void tick.value
  return call<ProfileLike>('profile')
})

const form = reactive<ProfileLike>({ ...saved.value })
const savedAt = ref(false)

watch(saved, (next) => Object.assign(form, next))

const dirty = computed(() =>
  (Object.keys(form) as (keyof ProfileLike)[]).some((k) => form[k] !== saved.value[k]),
)

const licenseExpiryText = computed(() =>
  form.licenseExpiry ? t('account.profile.licenseExpiresOn', { date: dateLong(form.licenseExpiry) }) : '',
)

function resetForm() {
  Object.assign(form, saved.value)
  savedAt.value = false
}

function submitProfile() {
  call('saveProfile', { ...form })
  savedAt.value = true
}

/* ---------------- Content preferences ---------------- */

const ALL = 'All'
const topics = computed(() => (data.interests as string[]).filter((i) => i !== ALL))

const chosen = ref<string[]>([])
watch(
  () => {
    void tick.value
    return call<string[]>('interests')
  },
  (next) => {
    chosen.value = [...next]
  },
  { immediate: true },
)

const allChosen = computed(() => chosen.value.includes(ALL))

/** "All" and a hand-picked list say different things, so holding both would
 *  leave the preference meaning neither. */
function toggle(value: string, on: boolean) {
  if (value === ALL) {
    chosen.value = on ? [ALL] : []
    return
  }
  const without = chosen.value.filter((v) => v !== value && v !== ALL)
  chosen.value = on ? [...without, value] : without
}

function submitInterests() {
  call('saveInterests', chosen.value)
}

/* ---------------- Security ---------------- */

const devices = computed(() => {
  void tick.value
  return call<DeviceLike[]>('devices')
})
const otherDevices = computed(() => devices.value.filter((d) => !d.current))

function signOutDevice(id: string) {
  call('logoutDevice', id)
}
function signOutAll() {
  call('logoutAllDevices')
}

/* ---------------- Notifications ---------------- */

const CONSENTS = ['news', 'newCourses', 'expiryAlert'] as const
type Consent = (typeof CONSENTS)[number]

const consents = computed(() => {
  void tick.value
  return call<Record<Consent, boolean>>('consents')
})

function setConsent(key: Consent, on: boolean) {
  call('saveConsents', { [key]: on })
}

function logout() {
  call('logout')
  void router.push(path(''))
}
</script>

<template>
  <AccountShell page="profile">
    <nav class="acct-jump" :aria-label="t('account.profile.jumpLabel')">
      <ul role="list">
        <li><a href="#pf-basic"><AppIcon name="user" />{{ t('account.profile.basic') }}</a></li>
        <li><a href="#pf-interests"><AppIcon name="sparkles" />{{ t('account.profile.interests') }}</a></li>
        <li><a href="#pf-security"><AppIcon name="shield-check" />{{ t('account.profile.security') }}</a></li>
        <li><a href="#pf-consent"><AppIcon name="bell" />{{ t('account.profile.consent') }}</a></li>
      </ul>
    </nav>

    <div class="acct-stack">
      <!-- Who you are -->
      <section class="acct-card acct-pf" id="pf-basic" aria-labelledby="pf-basic-h">
        <div class="acct-pf-head">
          <h2 id="pf-basic-h"><AppIcon name="user" />{{ t('account.profile.basic') }}</h2>
          <p>
            {{ t('account.profile.basicNote') }} ·
            {{ t('account.profile.requiredLead') }}
            <span class="req" aria-hidden="true">*</span>
            <span class="sr-only">{{ t('account.profile.asterisk') }}</span>
            {{ t('account.profile.requiredTail') }}
          </p>
        </div>

        <form id="pf-form" class="acct-form" novalidate @submit.prevent="submitProfile">
          <p class="acct-pf-type">
            <AppIcon :name="isStudent ? 'graduation' : 'stethoscope'" />
            <span>{{ t('account.pkg.memberType') }}: <b>{{ memberTypeLabel }}</b></span>
          </p>

          <div class="form-grid">
            <div class="field">
              <label class="label" for="pf-email">{{ t('account.profile.email') }}</label>
              <input
                class="input"
                id="pf-email"
                name="email"
                type="email"
                :value="form.email"
                aria-describedby="pf-email-h"
                readonly
                aria-readonly="true"
                autocomplete="email"
              />
              <span class="field-help" id="pf-email-h">
                <AppIcon name="lock" :size="13" />{{ t('account.profile.emailHelp') }}
              </span>
            </div>

            <div class="field">
              <label class="label" for="pf-phone">
                {{ t('account.profile.phone') }}
                <span class="opt">{{ t('account.profile.optional') }}</span>
              </label>
              <input
                class="input"
                id="pf-phone"
                name="phone"
                type="tel"
                v-model="form.phone"
                inputmode="tel"
                autocomplete="tel"
                :placeholder="t('account.profile.phonePlaceholder')"
              />
            </div>

            <fieldset class="fieldset field span-2 acct-prefix">
              <legend>
                {{ t('account.profile.prefixLabel') }}<span class="req" aria-hidden="true">*</span>
              </legend>
              <div class="pill-set">
                <label v-for="p in PREFIXES" :key="p.value" class="pill-opt">
                  <input type="radio" name="prefix" :value="p.value" v-model="form.prefix" />
                  <span><AppIcon name="check" />{{ t(`account.profile.prefix.${p.key}`) }}</span>
                </label>
              </div>
            </fieldset>

            <div class="field">
              <label class="label" for="pf-fn">
                {{ t('account.profile.firstName') }}<span class="req" aria-hidden="true">*</span>
              </label>
              <input
                class="input"
                id="pf-fn"
                name="firstName"
                type="text"
                v-model="form.firstName"
                required
                aria-required="true"
                autocomplete="given-name"
                lang="th"
              />
            </div>

            <div class="field">
              <label class="label" for="pf-ln">
                {{ t('account.profile.lastName') }}<span class="req" aria-hidden="true">*</span>
              </label>
              <input
                class="input"
                id="pf-ln"
                name="lastName"
                type="text"
                v-model="form.lastName"
                required
                aria-required="true"
                autocomplete="family-name"
                lang="th"
              />
            </div>

            <template v-if="!isStudent">
              <div class="field">
                <label class="label" for="pf-lic">
                  {{ t('account.profile.licenseNo') }}<span class="req" aria-hidden="true">*</span>
                </label>
                <input
                  class="input"
                  id="pf-lic"
                  name="licenseNo"
                  type="text"
                  v-model="form.licenseNo"
                  required
                  aria-required="true"
                  aria-describedby="pf-lic-h"
                  autocomplete="off"
                  placeholder="ว.XXXXX"
                />
                <span class="field-help" id="pf-lic-h">{{ t('account.profile.licenseHelp') }}</span>
              </div>

              <div class="field">
                <label class="label" for="pf-licexp">
                  {{ t('account.profile.licenseExpiry') }}<span class="req" aria-hidden="true">*</span>
                </label>
                <input
                  class="input"
                  id="pf-licexp"
                  name="licenseExpiry"
                  type="date"
                  v-model="form.licenseExpiry"
                  required
                  aria-required="true"
                  aria-describedby="pf-licexp-h"
                  :min="todayISO()"
                />
                <span class="field-help" id="pf-licexp-h">{{ licenseExpiryText }}</span>
              </div>
            </template>

            <p v-else class="acct-lic-note span-2">
              <AppIcon name="graduation" /><span>{{ t('account.profile.studentLicenseNote') }}</span>
            </p>

            <div class="field">
              <label class="label" for="pf-work">
                {{ t('account.profile.workplace') }}
                <span class="opt">{{ t('account.profile.optional') }}</span>
              </label>
              <input
                class="input"
                id="pf-work"
                name="workplace"
                type="text"
                v-model="form.workplace"
                autocomplete="organization"
                :placeholder="t('account.profile.workplacePlaceholder')"
              />
            </div>

            <div class="field">
              <label class="label" for="pf-prov">
                {{ t('account.profile.province') }}
                <span class="opt">{{ t('account.profile.optional') }}</span>
              </label>
              <select class="select" id="pf-prov" name="province" v-model="form.province">
                <option value="">{{ t('account.profile.provincePlaceholder') }}</option>
                <option v-for="p in (data.provinces as string[])" :key="p" :value="p">{{ p }}</option>
              </select>
            </div>

            <div class="field span-2">
              <div class="field-row">
                <label class="label" for="pf-note">
                  {{ t('account.profile.note') }}
                  <span class="opt">{{ t('account.profile.optional') }}</span>
                </label>
                <span class="counter" id="pf-note-c" aria-live="polite">
                  {{ (form.note ?? '').length }}/300
                </span>
              </div>
              <textarea
                class="textarea acct-note"
                id="pf-note"
                name="note"
                maxlength="300"
                rows="3"
                v-model="form.note"
                aria-describedby="pf-note-c"
                :placeholder="t('account.profile.notePlaceholder')"
              ></textarea>
            </div>

            <div class="field span-2 acct-pdpa">
              <label class="check">
                <input type="checkbox" name="pdpa" required aria-required="true" v-model="form.pdpa" />
                <span>
                  <b>{{ t('account.profile.pdpaTitle') }}</b>
                  <span class="req" aria-hidden="true">*</span>
                  <small>{{ t('account.profile.pdpaText') }}</small>
                </span>
              </label>
              <a class="link text-sm acct-pdpa-link" :href="path('/privacy')">
                {{ t('account.profile.pdpaLink') }}
              </a>
            </div>
          </div>

          <div class="acct-form-actions">
            <p class="acct-dirty" :class="{ 'is-saved': savedAt && !dirty }" id="pf-dirty" aria-live="polite">
              <template v-if="dirty">
                <AppIcon name="alert-circle" :size="16" />{{ t('account.profile.unsaved') }}
              </template>
              <template v-else-if="savedAt">
                <AppIcon name="check-circle" :size="16" />{{ t('account.profile.saved') }}
              </template>
            </p>
            <button type="button" class="btn btn--ghost" :disabled="!dirty" @click="resetForm">
              <AppIcon name="rotate-ccw" />{{ t('account.profile.reset') }}
            </button>
            <button type="submit" class="btn btn--primary">
              <AppIcon name="check" />{{ t('account.profile.save') }}
            </button>
          </div>
        </form>
      </section>

      <!-- What you want to see -->
      <section class="acct-card acct-pf" id="pf-interests" aria-labelledby="pf-int-h">
        <div class="acct-pf-head">
          <h2 id="pf-int-h"><AppIcon name="sparkles" />{{ t('account.profile.interestsTitle') }}</h2>
        </div>

        <form id="pf-int-form" class="acct-form" novalidate @submit.prevent="submitInterests">
          <fieldset class="fieldset field acct-int">
            <legend>{{ t('account.profile.interestsLegend') }}</legend>
            <p class="acct-int-desc" id="pf-int-desc">{{ t('account.profile.interestsDesc') }}</p>

            <div class="pill-set" role="group" aria-describedby="pf-int-desc">
              <label class="pill-opt acct-pill-all">
                <input
                  type="checkbox"
                  name="interest"
                  :value="ALL"
                  :checked="allChosen"
                  @change="toggle(ALL, ($event.target as HTMLInputElement).checked)"
                />
                <span><AppIcon name="check" />{{ ALL }}</span>
              </label>
              <label v-for="topic in topics" :key="topic" class="pill-opt">
                <input
                  type="checkbox"
                  name="interest"
                  :value="topic"
                  :checked="chosen.includes(topic)"
                  @change="toggle(topic, ($event.target as HTMLInputElement).checked)"
                />
                <span><AppIcon name="check" />{{ topic }}</span>
              </label>
            </div>
          </fieldset>

          <div class="acct-form-actions">
            <p class="acct-int-count" id="pf-int-count" aria-live="polite">
              {{ allChosen
                ? t('account.profile.interestsAll', { total: topics.length })
                : t('account.profile.interestsCount', { count: chosen.length, total: topics.length }) }}
            </p>
            <button type="submit" class="btn btn--primary">
              <AppIcon name="check" />{{ t('account.profile.confirm') }}
            </button>
          </div>
        </form>
      </section>

      <!-- Who is signed in as you -->
      <section class="acct-card acct-pf" id="pf-security" aria-labelledby="pf-sec-h">
        <div class="acct-pf-head">
          <h2 id="pf-sec-h"><AppIcon name="shield-check" />{{ t('account.profile.security') }}</h2>
          <p>{{ t('account.profile.securitySub') }}</p>
        </div>

        <div class="acct-row">
          <span class="acct-row-ico" aria-hidden="true"><AppIcon name="key" /></span>
          <div class="acct-row-txt">
            <b>{{ t('account.profile.password') }}</b>
            <p>{{ t('account.profile.passwordHint') }}</p>
          </div>
          <!-- The change-password dialog belongs to the auth service; the row
               is here so the section is complete when it lands. -->
          <button type="button" class="btn btn--secondary btn--sm">
            <AppIcon name="key" />{{ t('account.profile.changePassword') }}
          </button>
        </div>

        <div id="pf-devices">
          <div class="acct-dev-head">
            <h3 id="pf-dev-h" tabindex="-1">
              {{ t('account.profile.devices') }}
              <span class="acct-count">{{ devices.length }}</span>
            </h3>
          </div>

          <ul class="acct-dev-list" role="list">
            <li v-for="d in devices" :key="d.id" class="acct-dev" :class="{ 'is-current': d.current }">
              <span class="acct-dev-ico" aria-hidden="true"><AppIcon :name="d.icon" /></span>
              <div class="acct-dev-txt">
                <b>
                  <span>{{ d.name }}</span>
                  <AppBadge
                    v-if="d.current"
                    :badge="{ kind: 'info', icon: 'check-circle', text: t('account.profile.thisDevice') }"
                  />
                </b>
                <small>
                  <AppIcon name="map-pin" /><span>{{ d.location }} · {{ d.last }}</span>
                </small>
              </div>
              <button
                v-if="!d.current"
                type="button"
                class="btn btn--ghost btn--sm acct-dev-out"
                :aria-label="t('account.profile.signOutDevice', { name: d.name })"
                @click="signOutDevice(d.id)"
              >
                <AppIcon name="log-out" /><span>{{ t('account.logout') }}</span>
              </button>
            </li>
          </ul>

          <div v-if="otherDevices.length" class="acct-dev-all">
            <div class="acct-row-txt">
              <b>{{ t('account.profile.signOutAll') }}</b>
              <p>{{ t('account.profile.signOutAllText', { count: otherDevices.length }) }}</p>
            </div>
            <button type="button" class="btn btn--danger-ghost btn--sm" @click="signOutAll">
              <AppIcon name="log-out" />{{ t('account.profile.signOutAll') }}
            </button>
          </div>
        </div>
      </section>

      <!-- What may be sent to you -->
      <section class="acct-card acct-pf" id="pf-consent" aria-labelledby="pf-con-h">
        <div class="acct-pf-head">
          <h2 id="pf-con-h"><AppIcon name="bell" />{{ t('account.profile.consentTitle') }}</h2>
          <p>{{ t('account.profile.consentSub') }}</p>
        </div>

        <ul class="acct-switch-list" role="list">
          <li v-for="key in CONSENTS" :key="key" class="acct-switch-row">
            <div class="acct-switch-txt">
              <b :id="`cs-${key}-l`">{{ t(`account.profile.consents.${key}.title`) }}</b>
              <p :id="`cs-${key}-d`">{{ t(`account.profile.consents.${key}.text`) }}</p>
            </div>
            <label class="switch">
              <input
                type="checkbox"
                role="switch"
                :checked="consents[key]"
                :aria-labelledby="`cs-${key}-l`"
                :aria-describedby="`cs-${key}-d`"
                @change="setConsent(key, ($event.target as HTMLInputElement).checked)"
              />
              <span class="acct-switch-state" aria-hidden="true">
                {{ consents[key] ? t('account.profile.on') : t('account.profile.off') }}
              </span>
            </label>
          </li>
        </ul>
      </section>

      <section class="acct-card acct-pf acct-logout" aria-labelledby="pf-out-h">
        <div>
          <h2 id="pf-out-h"><AppIcon name="log-out" />{{ t('account.logout') }}</h2>
          <p>{{ t('account.profile.logoutText') }}</p>
        </div>
        <button type="button" class="btn btn--danger-ghost" @click="logout">
          <AppIcon name="log-out" />{{ t('account.logout') }}
        </button>
      </section>
    </div>
  </AccountShell>
</template>
