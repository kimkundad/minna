<script setup lang="ts">
import { computed, onMounted, ref, shallowRef } from 'vue'
import { Ckeditor } from '@ckeditor/ckeditor5-vue'
import {
  Autoformat,
  BlockQuote,
  Bold,
  ClassicEditor,
  Essentials,
  Heading,
  HorizontalLine,
  Image,
  ImageCaption,
  ImageInsert,
  ImageResize,
  ImageStyle,
  ImageToolbar,
  ImageUpload,
  Indent,
  Italic,
  Link,
  List,
  Paragraph,
  PasteFromOffice,
  SourceEditing,
  Strikethrough,
  Table,
  TableToolbar,
  TextTransformation,
  Underline,
} from 'ckeditor5'
import type { Editor, FileLoader, UploadAdapter, UploadResponse } from 'ckeditor5'
import 'ckeditor5/ckeditor5.css'
import { uploadFile, UploadError } from '@/lib/upload'
import { mediaUrl } from '@/lib/api'

/**
 * The editor for anything that is written rather than typed: a course
 * description, the body of an article.
 *
 * A picture dropped in here is uploaded straight to the store, exactly as every
 * other upload in the admin is, and what goes into the HTML is a permanent
 * address rather than a signed one. Signed URLs expire; an article is saved
 * once and read for years, so an article full of signed URLs is an article
 * whose pictures all break the same afternoon.
 */
const props = withDefaults(
  defineProps<{
    modelValue: string | null
    label?: string
    help?: string
    required?: boolean
    error?: string
    /** Roughly how tall, in lines. */
    rows?: number
  }>(),
  { rows: 12 },
)

const emit = defineEmits<{ 'update:modelValue': [value: string | null] }>()

/** Not a `ref`: the editor is a large object and making it deeply reactive
 *  costs a lot and buys nothing. */
const editor = shallowRef(ClassicEditor)
const ready = ref(false)
const uploadError = ref('')

const value = computed({
  get: () => props.modelValue ?? '',
  // An empty editor produces '', and the column is nullable — storing an empty
  // string would make "never written" and "deliberately blank" the same thing.
  set: (v: string) => emit('update:modelValue', v.trim() ? v : null),
})

/**
 * Hands a dropped picture to the same upload path everything else uses.
 *
 * CKEditor expects an object with `upload()` and `abort()`. `upload()` resolves
 * to `{ default: url }`, which is what it writes into the `src`.
 */
class StoreUploadAdapter implements UploadAdapter {
  private readonly loader: FileLoader
  private controller: AbortController | null = null

  constructor(loader: FileLoader) {
    this.loader = loader
  }

  async upload(): Promise<UploadResponse> {
    const file = await this.loader.file
    if (!file) throw new Error('No file.')

    this.controller = new AbortController()
    uploadError.value = ''

    try {
      const result = await uploadFile(file, {
        purpose: 'content-image',
        // The editor's own progress bar, fed the same numbers as everywhere
        // else in the admin.
        onProgress: (fraction) => {
          this.loader.uploadTotal = 100
          this.loader.uploaded = Math.round(fraction * 100)
        },
        signal: this.controller.signal,
      })
      // Not a signed URL: this address has to still work in a year.
      return { default: mediaUrl(result.path) }
    } catch (err) {
      const message =
        err instanceof UploadError
          ? err.message
          : this.controller?.signal.aborted
            ? 'Upload cancelled.'
            : 'Could not upload that picture.'
      uploadError.value = message
      throw new Error(message)
    } finally {
      this.controller = null
    }
  }

  abort(): void {
    this.controller?.abort()
  }
}

function withUploads(instance: Editor) {
  instance.plugins.get('FileRepository').createUploadAdapter = (loader: FileLoader) =>
    new StoreUploadAdapter(loader)
}

const config = computed(() => ({
  /**
   * CKEditor 5 is GPL. This key is what the library expects for that use, and
   * is not a secret — it is the literal string the GPL build looks for. Using
   * it in a closed-source product is the thing a commercial licence is for.
   */
  licenseKey: 'GPL',
  plugins: [
    Essentials,
    Paragraph,
    Heading,
    Bold,
    Italic,
    Underline,
    Strikethrough,
    Link,
    List,
    Indent,
    BlockQuote,
    HorizontalLine,
    Image,
    ImageToolbar,
    ImageCaption,
    ImageStyle,
    ImageResize,
    ImageUpload,
    ImageInsert,
    Table,
    TableToolbar,
    Autoformat,
    TextTransformation,
    PasteFromOffice,
    SourceEditing,
  ],
  toolbar: {
    items: [
      'undo',
      'redo',
      '|',
      'heading',
      '|',
      'bold',
      'italic',
      'underline',
      'strikethrough',
      '|',
      'link',
      'bulletedList',
      'numberedList',
      'outdent',
      'indent',
      '|',
      'insertImage',
      'insertTable',
      'blockQuote',
      'horizontalLine',
      '|',
      'sourceEditing',
    ],
    shouldNotGroupWhenFull: true,
  },
  heading: {
    options: [
      { model: 'paragraph' as const, title: 'Paragraph', class: 'ck-heading_paragraph' },
      // No h1: the page's own title is the h1, and a second one in the body
      // makes the document structure wrong for anyone reading it with a screen
      // reader or a search engine.
      { model: 'heading2' as const, view: 'h2', title: 'Heading', class: 'ck-heading_heading2' },
      {
        model: 'heading3' as const,
        view: 'h3',
        title: 'Subheading',
        class: 'ck-heading_heading3',
      },
    ],
  },
  image: {
    toolbar: [
      'imageTextAlternative',
      'toggleImageCaption',
      '|',
      'imageStyle:inline',
      'imageStyle:block',
      'imageStyle:side',
      '|',
      'resizeImage',
    ],
  },
  table: { contentToolbar: ['tableColumn', 'tableRow', 'mergeTableCells'] },
  link: {
    // Anything typed as a bare address becomes a link, and anything leaving the
    // site opens in a new tab with the usual protection.
    addTargetToExternalLinks: true,
    defaultProtocol: 'https://',
  },
  placeholder: 'Write here. Pictures can be dropped straight in.',
}))

onMounted(() => {
  ready.value = true
})
</script>

<template>
  <div>
    <label v-if="label" class="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
      {{ label }}<span v-if="required" class="text-error-500">*</span>
    </label>

    <!-- Rendered only after mount: the editor reaches for `document` as it
         builds, and the admin is an SPA but the component is also used inside
         forms that render before the DOM settles. -->
    <div
      class="rich-text overflow-hidden rounded-lg border border-gray-300 dark:border-gray-700"
      :style="{ '--rich-min-height': `${rows * 1.6}rem` }"
    >
      <Ckeditor v-if="ready" v-model="value" :editor="editor" :config="config" @ready="withUploads" />
      <div
        v-else
        class="flex items-center px-4 text-sm text-gray-400"
        :style="{ minHeight: `${rows * 1.6}rem` }"
      >
        Loading the editor…
      </div>
    </div>

    <p v-if="uploadError" class="mt-1 text-sm text-error-500">{{ uploadError }}</p>
    <p v-else-if="error" class="mt-1 text-sm text-error-500">{{ error }}</p>
    <p v-else-if="help" class="mt-1 text-xs text-gray-400">{{ help }}</p>
  </div>
</template>

<style>
/**
 * The editor ships its own light theme. These map its variables onto the
 * admin's so it does not sit in the page as a white rectangle in dark mode,
 * and give the editing area a sensible height.
 */
.rich-text .ck.ck-editor__editable {
  min-height: var(--rich-min-height, 20rem);
}

.rich-text .ck.ck-editor__top .ck-sticky-panel__content,
.rich-text .ck.ck-toolbar {
  border: 0;
  border-bottom: 1px solid var(--ck-color-base-border);
}

.rich-text .ck.ck-editor__editable_inline {
  border: 0;
  padding: 0.75rem 1rem;
}

.rich-text .ck.ck-editor__editable:focus {
  box-shadow: none;
}

/* Dark mode. CKEditor drives everything from these variables, so redefining
   them is enough — no rule here targets its internals by class. */
.dark .rich-text {
  --ck-color-base-background: rgb(17 24 39);
  --ck-color-base-foreground: rgb(31 41 55);
  --ck-color-base-border: rgb(55 65 81);
  --ck-color-text: rgb(229 231 235);
  --ck-color-toolbar-background: rgb(17 24 39);
  --ck-color-toolbar-border: rgb(55 65 81);
  --ck-color-button-default-background: transparent;
  --ck-color-button-default-hover-background: rgb(31 41 55);
  --ck-color-button-on-background: rgb(31 41 55);
  --ck-color-button-on-hover-background: rgb(55 65 81);
  --ck-color-button-on-color: rgb(229 231 235);
  --ck-color-panel-background: rgb(17 24 39);
  --ck-color-panel-border: rgb(55 65 81);
  --ck-color-dropdown-panel-background: rgb(17 24 39);
  --ck-color-dropdown-panel-border: rgb(55 65 81);
  --ck-color-input-background: rgb(17 24 39);
  --ck-color-input-border: rgb(55 65 81);
  --ck-color-input-text: rgb(229 231 235);
  --ck-color-list-background: rgb(17 24 39);
  --ck-color-list-button-hover-background: rgb(31 41 55);
  --ck-color-labeled-field-label-background: rgb(17 24 39);
}

/* What the writing looks like while it is being written. Close enough to the
   public site that the editor is not lying about the result. */
.rich-text .ck-content h2 {
  font-size: 1.5rem;
  font-weight: 600;
  margin: 1.25rem 0 0.5rem;
}

.rich-text .ck-content h3 {
  font-size: 1.25rem;
  font-weight: 600;
  margin: 1rem 0 0.5rem;
}

.rich-text .ck-content p {
  margin: 0.75rem 0;
  line-height: 1.7;
}

.rich-text .ck-content ul,
.rich-text .ck-content ol {
  padding-left: 1.5rem;
  margin: 0.75rem 0;
}

.rich-text .ck-content ul {
  list-style: disc;
}

.rich-text .ck-content ol {
  list-style: decimal;
}

.rich-text .ck-content blockquote {
  border-left: 3px solid var(--ck-color-base-border);
  padding-left: 1rem;
  font-style: italic;
}

.rich-text .ck-content a {
  color: rgb(70 95 255);
  text-decoration: underline;
}
</style>
