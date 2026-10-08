<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import AppIcon from '@/components/ui/AppIcon.vue'
import logoUrl from '@/assets/img/logo.png'

/**
 * Same structure as the prototype's `U.renderFooter` — .ft-top, .ft-grid with
 * about / links / contact, then .ft-bottom — with Minna's own copy and links in
 * place of the reference project's.
 *
 * Nothing here depends on who is signed in; the footer is identical in every
 * state, which is why it takes no props.
 */
const { t } = useI18n()
const route = useRoute()
const locale = computed(() => String(route.params.locale ?? 'th'))
const path = (p: string) => `/${locale.value}${p}`

const year = new Date().getFullYear()
</script>

<template>
  <footer id="site-footer" class="site-footer">
    <div class="container">
      <div class="ft-top">
        <RouterLink class="brand" :to="path('')" :aria-label="t('header.brandHome')">
          <img class="brand-logo" :src="logoUrl" width="85" height="35" alt="" decoding="async" />
        </RouterLink>
      </div>

      <div class="ft-grid">
        <div class="ft-about">
          <p>{{ t('footer.about') }}</p>
        </div>

        <div class="ft-links">
          <div>
            <h3>{{ t('footer.learnTitle') }}</h3>
            <ul>
              <li><RouterLink :to="path('/courses')">{{ t('common.courses') }}</RouterLink></li>
              <li>
                <RouterLink :to="`${path('/courses')}?sort=new`">
                  {{ t('footer.newCourses') }}
                </RouterLink>
              </li>
              <li>
                <RouterLink :to="`${path('/courses')}?access=free`">
                  {{ t('footer.freeCourses') }}
                </RouterLink>
              </li>
              <li><RouterLink :to="path('/packages')">{{ t('footer.packages') }}</RouterLink></li>
              <!-- Under "learn" rather than "about us": an article is a
                   lesson you did not pay for, not a page about the school. -->
              <li><RouterLink :to="path('/blog')">{{ t('common.articles') }}</RouterLink></li>
            </ul>
          </div>

          <div>
            <h3>{{ t('footer.aboutTitle') }}</h3>
            <ul>
              <li><RouterLink :to="path('/about')">{{ t('common.about') }}</RouterLink></li>
              <li><RouterLink :to="path('/help')">{{ t('footer.help') }}</RouterLink></li>
              <li><RouterLink :to="path('/contact')">{{ t('footer.contact') }}</RouterLink></li>
            </ul>
          </div>

          <div>
            <h3>{{ t('footer.accountTitle') }}</h3>
            <ul>
              <li><RouterLink :to="path('/account')">{{ t('footer.accountOverview') }}</RouterLink></li>
              <li>
                <RouterLink :to="path('/account/learning')">{{ t('footer.myCourses') }}</RouterLink>
              </li>
              <li><RouterLink :to="path('/account/orders')">{{ t('footer.orders') }}</RouterLink></li>
            </ul>
          </div>
        </div>

        <div class="ft-contact">
          <h3>{{ t('footer.contactTitle') }}</h3>
          <ul>
            <li><AppIcon name="mail" />{{ t('footer.email') }}</li>
            <li><AppIcon name="phone" />{{ t('footer.phone') }}</li>
          </ul>
          <div class="ft-social">
            <a href="#facebook" aria-label="Facebook"><AppIcon name="facebook" /></a>
            <a href="#line" aria-label="LINE"><AppIcon name="message" /></a>
            <a href="#youtube" aria-label="YouTube"><AppIcon name="youtube" /></a>
            <a href="#instagram" aria-label="Instagram"><AppIcon name="instagram" /></a>
          </div>
        </div>
      </div>

      <div class="ft-bottom">
        <span>{{ t('footer.copyright', { year }) }}</span>
        <nav :aria-label="t('footer.policies')">
          <RouterLink :to="path('/privacy')">{{ t('footer.privacy') }}</RouterLink>
          <RouterLink :to="path('/terms')">{{ t('footer.terms') }}</RouterLink>
          <RouterLink :to="path('/purchase-terms')">{{ t('footer.purchaseTerms') }}</RouterLink>
        </nav>
      </div>
    </div>
  </footer>
</template>
