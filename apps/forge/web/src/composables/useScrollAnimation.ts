import { onMounted, onUnmounted } from 'vue';

/**
 * Observes elements with `.animate-on-scroll` and toggles `.is-visible`
 * when they enter the viewport. Also handles `.stagger-children` → `.animate`.
 */
export function useScrollAnimation(rootMargin = '0px 0px -80px 0px') {
  let observer: IntersectionObserver | null = null;

  onMounted(() => {
    observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            if (entry.target.classList.contains('stagger-children')) {
              entry.target.classList.add('animate');
            }
            observer?.unobserve(entry.target);
          }
        }
      },
      { rootMargin, threshold: 0.1 },
    );

    const targets = document.querySelectorAll('.animate-on-scroll, .stagger-children');
    targets.forEach((el) => observer?.observe(el));
  });

  onUnmounted(() => {
    observer?.disconnect();
    observer = null;
  });
}
