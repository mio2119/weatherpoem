import { nextTick, onMounted, useTemplateRef } from "vue";

/**
 * Moves focus to a newly mounted route-like view so keyboard and screen-reader
 * users receive the same navigation context as sighted users.
 */
export function useInitialFocus() {
  const initialFocusTarget =
    useTemplateRef<HTMLElement>("initialFocusTarget");

  onMounted(async () => {
    await nextTick();
    initialFocusTarget.value?.focus({ preventScroll: true });
  });

}
