<script lang="ts">
import { defineComponent, h } from 'vue'
import { RV } from '@/vendor'

/**
 * One of the prototype's 143 stroke icons, rendered as a bare <svg>.
 *
 * It must be bare. The design's CSS sizes icons through child combinators —
 * `.icon-btn > svg`, `.avatar-btn > svg`, `.nav-pill > a svg` — and a wrapper
 * element breaks every one of them, even a `display: contents` one, because
 * that property changes layout and not what selectors match. The icons then
 * fall back to their natural 24px and push the header apart.
 *
 * So this is a render function rather than a template: it puts the paths
 * straight into the svg via innerHTML, leaving no element of its own behind.
 *
 * Passing `label` makes the icon meaningful to a screen reader. Leaving it off
 * marks it decorative, which is right whenever adjacent text already says what
 * it means.
 */
export default defineComponent({
  name: 'AppIcon',
  props: {
    name: { type: String, required: true },
    size: { type: Number, default: 24 },
    stroke: { type: Number, default: 2 },
    label: { type: String, default: '' },
  },
  setup(props) {
    const paths = (RV as unknown as { iconPaths: Record<string, string> }).iconPaths

    return () =>
      h('svg', {
        xmlns: 'http://www.w3.org/2000/svg',
        width: props.size,
        height: props.size,
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: 'currentColor',
        'stroke-width': props.stroke,
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
        ...(props.label
          ? { role: 'img', 'aria-label': props.label }
          : { 'aria-hidden': 'true', focusable: 'false' }),
        innerHTML: paths[props.name] ?? paths.circle ?? '',
      })
  },
})
</script>
