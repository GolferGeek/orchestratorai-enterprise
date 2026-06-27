<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';

const mobileOpen = ref(false);

const links = [
  { label: 'Home', path: '/' },
  { label: 'Pricing', path: '/pricing' },
  { label: 'About', path: '/about' },
  { label: 'Log In', path: '/login' },
];

// Close mobile menu on resize to desktop
function onResize() {
  if (window.innerWidth > 768) {
    mobileOpen.value = false;
  }
}

onMounted(() => {
  window.addEventListener('resize', onResize, { passive: true });
});

onUnmounted(() => {
  window.removeEventListener('resize', onResize);
});
</script>

<template>
  <nav class="landing-nav">
    <div class="landing-nav__inner">
      <div class="landing-nav__links">
        <router-link
          v-for="link in links"
          :key="link.path"
          :to="link.path"
          class="landing-nav__link"
        >
          {{ link.label }}
        </router-link>
      </div>

      <button
        class="landing-nav__mobile-toggle"
        :class="{ 'landing-nav__mobile-toggle--open': mobileOpen }"
        aria-label="Toggle menu"
        @click="mobileOpen = !mobileOpen"
      >
        <span />
        <span />
        <span />
      </button>
    </div>

    <!-- Mobile dropdown -->
    <div v-if="mobileOpen" class="landing-nav__mobile-menu" @click="mobileOpen = false">
      <router-link
        v-for="link in links"
        :key="link.path"
        :to="link.path"
        class="landing-nav__mobile-link"
      >
        {{ link.label }}
      </router-link>
    </div>
  </nav>
</template>

<style scoped>
.landing-nav {
  position: sticky;
  top: 0;
  z-index: 50;
  background: rgba(15, 23, 42, 0.92);
  backdrop-filter: blur(16px);
  border-bottom: 1px solid var(--oai-border, #334155);
}

:root[data-theme="light"] .landing-nav {
  background: rgba(255, 255, 255, 0.85);
  border-bottom-color: rgba(0, 0, 0, 0.08);
}

.landing-nav__inner {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 44px;
  padding: 0 1rem;
}

.landing-nav__links {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.landing-nav__link {
  padding: 0.35rem 0.9rem;
  border-radius: 6px;
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--oai-text-secondary, #94a3b8);
  text-decoration: none;
  transition: color 150ms ease, background 150ms ease;
}

.landing-nav__link:hover,
.landing-nav__link.router-link-active {
  color: var(--oai-text-primary, #e2e8f0);
  background: rgba(255, 255, 255, 0.06);
}

:root[data-theme="light"] .landing-nav__link {
  color: var(--oai-slate-600, #475569);
}

:root[data-theme="light"] .landing-nav__link:hover,
:root[data-theme="light"] .landing-nav__link.router-link-active {
  color: var(--oai-slate-900, #0f172a);
  background: rgba(0, 0, 0, 0.05);
}

/* Mobile toggle */
.landing-nav__mobile-toggle {
  display: none;
  flex-direction: column;
  gap: 5px;
  padding: 6px;
  background: none;
  border: none;
  cursor: pointer;
}

.landing-nav__mobile-toggle span {
  display: block;
  width: 22px;
  height: 2px;
  background: var(--oai-text-primary, #e2e8f0);
  border-radius: 2px;
  transition: transform 150ms ease, opacity 150ms ease;
}

:root[data-theme="light"] .landing-nav__mobile-toggle span {
  background: var(--oai-slate-700, #334155);
}

.landing-nav__mobile-toggle--open span:nth-child(1) {
  transform: translateY(7px) rotate(45deg);
}

.landing-nav__mobile-toggle--open span:nth-child(2) {
  opacity: 0;
}

.landing-nav__mobile-toggle--open span:nth-child(3) {
  transform: translateY(-7px) rotate(-45deg);
}

/* Mobile menu */
.landing-nav__mobile-menu {
  display: flex;
  flex-direction: column;
  padding: 0.5rem 1rem 1rem;
  background: rgba(15, 23, 42, 0.97);
  backdrop-filter: blur(16px);
  border-top: 1px solid var(--oai-border, #334155);
  gap: 0.25rem;
}

:root[data-theme="light"] .landing-nav__mobile-menu {
  background: rgba(255, 255, 255, 0.97);
  border-top-color: rgba(0, 0, 0, 0.08);
}

.landing-nav__mobile-link {
  font-size: 0.9rem;
  font-weight: 500;
  color: var(--oai-text-secondary, #94a3b8);
  padding: 0.5rem 0.75rem;
  border-radius: 6px;
  text-decoration: none;
}

.landing-nav__mobile-link:hover {
  color: var(--oai-text-primary, #e2e8f0);
  background: rgba(255, 255, 255, 0.06);
}

:root[data-theme="light"] .landing-nav__mobile-link {
  color: var(--oai-slate-600, #475569);
}

:root[data-theme="light"] .landing-nav__mobile-link:hover {
  color: var(--oai-slate-900, #0f172a);
  background: rgba(0, 0, 0, 0.05);
}

@media (max-width: 768px) {
  .landing-nav__links {
    display: none;
  }

  .landing-nav__mobile-toggle {
    display: flex;
  }

  .landing-nav__inner {
    justify-content: flex-end;
  }
}
</style>
