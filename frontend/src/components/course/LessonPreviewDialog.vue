<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { useI18n } from 'vue-i18n'
import AppIcon from '@/components/ui/AppIcon.vue'
import AppSheet from '@/components/ui/AppSheet.vue'
import CourseImage from '@/components/course/CourseImage.vue'
import { api } from '@/lib/api'
import type { LessonPreview } from '@/lib/api'
import { minutes } from '@/lib/format'

/**
 * The free sample a course offers, played where it was clicked.
 *
 * The link is fetched when the dialog opens rather than with the curriculum:
 * it is a signature that expires within the hour, and handing one out for
 * every sample on the page would mean minting links nobody watches.
 *
 * A lesson can be marked as a sample before anything has been uploaded to it.
 * That is said plainly rather than treated as an error — the curriculum is
 * still worth reading, and the school can see what it has not filmed yet.
 */
const props = defineProps<{
  open: boolean
  /** The course's slug or id, and which lesson. */
  courseRef: string | number
  lessonId: number | null
  /** Shown under the title, and while the request is in flight. */
  courseTitle: string
  lessonTitle: string
  /** For the poster behind the player, so the box is never an empty rectangle. */
  cover?: { src: string; alt: string } | null
  artIcon?: string
  artPalette?: number
  curriculumHref: string
}>()

const emit = defineEmits<{ close: [] }>()

const { t } = useI18n()

const preview = ref<LessonPreview | null>(null)
const loading = ref(false)
const failed = ref(false)
const playing = ref(false)

/**
 * Whether the browser managed it, rather than whether it says it could.
 *
 * The lessons are stored as HLS, which only Safari plays from a plain
 * `<video>` — but Chromium answers "maybe" to `canPlayType` for it and then
 * fails anyway, so asking first is worse than useless. The player is offered,
 * and a browser that cannot play it says so once it has found out.
 */
const playFailed = ref(false)

function onVideoError(): void {
  playFailed.value = true
  playing.value = false
}

/**
 * What the attributes on the player are for, and what they are not.
 *
 * `controlslist="nodownload"` takes the download button out of the browser's
 * own menu, and blocking the context menu takes away "Save video as". Together
 * they stop somebody saving the file without meaning to, or because it was the
 * obvious thing to click.
 *
 * They do not stop anybody who wants the file. The address is in the page, the
 * network tab lists it, and a stream can be pulled with one command. Treating
 * these as protection and putting a paid lesson behind them would be the
 * mistake; what actually protects the paid lessons is that their addresses are
 * never handed out at all.
 *
 * For this one, it matters less than it looks: a free sample is meant to be
 * watched by anybody. The real limits are elsewhere — the link is signed, it
 * expires within the hour, and it is for that one lesson.
 */


let seq = 0

async function load(): Promise<void> {
  if (props.lessonId === null) return
  const mine = ++seq
  loading.value = true
  failed.value = false
  playing.value = false
  playFailed.value = false
  preview.value = null
  try {
    const res = await api.lessonPreview(props.courseRef, props.lessonId)
    if (mine !== seq) return
    preview.value = res.data
  } catch {
    if (mine !== seq) return
    failed.value = true
  } finally {
    if (mine === seq) loading.value = false
  }
}

watch(
  () => [props.open, props.lessonId],
  () => {
    if (props.open) void load()
    else {
      // Stop the request mattering, and stop the video with it.
      seq += 1
      playing.value = false
      playFailed.value = false
      preview.value = null
    }
  },
  { immediate: true },
)

const url = computed(() => preview.value?.url ?? null)
const title = computed(() => preview.value?.title || props.lessonTitle)
const length = computed(() =>
  preview.value?.durationSeconds ? minutes(preview.value.durationSeconds) : '',
)
</script>

<template>
  <AppSheet
    :open="open"
    size="lg"
    :title="t('course.previewTitle', { title })"
    :sub="courseTitle"
    :close-label="t('common.close')"
    @close="emit('close')"
  >
    <div class="pv-stage">
      <!-- eslint-disable-next-line vuejs-accessibility/media-has-caption -->
      <video
        v-if="playing && url && !playFailed"
        class="pv-video"
        :src="url"
        controls
        autoplay
        playsinline
        controlslist="nodownload noplaybackrate"
        disablepictureinpicture
        disableremoteplayback
        @contextmenu.prevent
        @error="onVideoError"
      />
      <template v-else>
        <CourseImage
          :image="cover"
          :width="960"
          :height="540"
          :art-icon="artIcon"
          :art-palette="artPalette ?? 0"
        />

        <span class="pv-badge"><AppIcon name="play-circle" />{{ t('course.legendPreview') }}</span>

        <div v-if="loading" class="pv-overlay">
          <span class="pv-note">{{ t('course.previewLoading') }}</span>
        </div>

        <button
          v-else-if="url && !playFailed"
          type="button"
          class="pv-play"
          data-preview-play
          @click="playing = true"
        >
          <span class="pv-play-ico"><AppIcon name="play" /></span>
          <span class="sr-only">{{ t('course.previewPlay', { title }) }}</span>
        </button>

        <div v-else class="pv-overlay">
          <AppIcon :name="failed ? 'wifi-off' : 'hourglass'" />
          <span class="pv-note">
            {{
              failed
                ? t('course.previewFailed')
                : playFailed
                  ? t('course.previewUnplayable')
                  : t('course.previewComingSoon')
            }}
          </span>
        </div>
      </template>
    </div>

    <p class="pv-foot-note">
      <AppIcon name="info" />
      <span>{{ length ? t('course.previewFreeWithLength', { length }) : t('course.previewFree') }}</span>
    </p>

    <template #foot>
      <button type="button" class="btn btn--ghost" @click="emit('close')">
        {{ t('common.close') }}
      </button>
      <RouterLink class="btn btn--primary" :to="curriculumHref" @click="emit('close')">
        <AppIcon name="list" />{{ t('course.previewSeeCurriculum') }}
      </RouterLink>
    </template>
  </AppSheet>
</template>
