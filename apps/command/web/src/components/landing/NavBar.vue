<template>
  <nav class="navbar" :class="{ scrolled: isScrolled }">
    <div class="navbar-inner container">
      <router-link to="/" class="nav-brand">
        <span class="brand-mark">O</span>
        <span class="brand-name">OrchestratorAI</span>
      </router-link>

      <div class="nav-links">
        <router-link to="/" class="nav-link">Home</router-link>
        <router-link to="/features" class="nav-link">Features</router-link>
        <router-link to="/pricing" class="nav-link">Pricing</router-link>
        <router-link to="/about" class="nav-link">About</router-link>
        <router-link to="/whats-possible" class="nav-link">What's Possible</router-link>
      </div>

      <div class="nav-actions">
        <button
          class="theme-toggle"
          :aria-label="isDark ? 'Switch to light theme' : 'Switch to dark theme'"
          :title="isDark ? 'Switch to light theme' : 'Switch to dark theme'"
          @click="toggleTheme"
        >
          <span v-if="isDark" class="theme-icon">&#9728;</span>
          <span v-else class="theme-icon">&#9790;</span>
        </button>
        <router-link to="/login" class="btn btn-secondary nav-login">Log In</router-link>
        <router-link to="/login" class="btn btn-primary nav-cta">Get Started</router-link>
      </div>

      <button
        class="nav-mobile-toggle"
        :class="{ open: mobileOpen }"
        aria-label="Toggle menu"
        @click="mobileOpen = !mobileOpen"
      >
        <span></span>
        <span></span>
        <span></span>
      </button>
    </div>

    <div v-if="mobileOpen" class="nav-mobile-menu" @click="mobileOpen = false">
      <router-link to="/" class="mobile-link">Home</router-link>
      <router-link to="/features" class="mobile-link">Features</router-link>
      <router-link to="/pricing" class="mobile-link">Pricing</router-link>
      <router-link to="/about" class="mobile-link">About</router-link>
      <router-link to="/whats-possible" class="mobile-link">What's Possible</router-link>
      <div class="mobile-actions">
        <router-link to="/login" class="btn btn-secondary">Log In</router-link>
        <router-link to="/login" class="btn btn-primary">Get Started</router-link>
      </div>
    </div>
  </nav>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { useTheme } from '@orchestratorai/ui/theme';

const { isDark, toggleTheme } = useTheme();

const mobileOpen = ref(false);
const isScrolled = ref(false);

function onScroll() {
  isScrolled.value = window.scrollY > 20;
}

onMounted(() => {
  window.addEventListener('scroll', onScroll, { passive: true });
});

onUnmounted(() => {
  window.removeEventListener('scroll', onScroll);
});
</script>

<style scoped>
.navbar {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 100;
  height: var(--nav-height);
  transition: var(--transition);
}

.navbar.scrolled {
  background: rgba(10, 10, 15, 0.92);
  backdrop-filter: blur(16px);
  border-bottom: 1px solid var(--border);
}

.navbar-inner {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 2rem;
}

/* Brand */
.nav-brand {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  text-decoration: none;
  flex-shrink: 0;
}

.brand-mark {
  width: 32px;
  height: 32px;
  background: var(--gradient-primary);
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.9rem;
  font-weight: 900;
  color: #fff;
}

.brand-name {
  font-size: 1.05rem;
  font-weight: 700;
  color: var(--text-primary);
  letter-spacing: -0.01em;
}

/* Links */
.nav-links {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  flex: 1;
  justify-content: center;
}

.nav-link {
  padding: 0.4rem 0.9rem;
  border-radius: 6px;
  font-size: 0.9rem;
  font-weight: 500;
  color: var(--text-secondary);
  transition: var(--transition);
  text-decoration: none;
}

.nav-link:hover,
.nav-link.router-link-active {
  color: var(--text-primary);
  background: rgba(255, 255, 255, 0.06);
}

/* Theme toggle */
.theme-toggle {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: var(--oai-radius);
  background: transparent;
  border: 1px solid var(--border);
  cursor: pointer;
  transition: var(--transition);
  padding: 0;
  color: var(--text-secondary);
  flex-shrink: 0;
}

.theme-toggle:hover {
  border-color: var(--border-active);
  color: var(--text-primary);
  background: rgba(59, 130, 246, 0.08);
}

.theme-icon {
  font-size: 1.05rem;
  line-height: 1;
}

/* Actions */
.nav-actions {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-shrink: 0;
}

.nav-login {
  padding: 0.5rem 1.25rem;
  font-size: 0.88rem;
}

.nav-cta {
  padding: 0.5rem 1.25rem;
  font-size: 0.88rem;
}

/* Mobile toggle */
.nav-mobile-toggle {
  display: none;
  flex-direction: column;
  gap: 5px;
  padding: 6px;
  background: none;
  border: none;
  cursor: pointer;
}

.nav-mobile-toggle span {
  display: block;
  width: 22px;
  height: 2px;
  background: var(--text-primary);
  border-radius: 2px;
  transition: var(--transition);
}

.nav-mobile-toggle.open span:nth-child(1) {
  transform: translateY(7px) rotate(45deg);
}

.nav-mobile-toggle.open span:nth-child(2) {
  opacity: 0;
}

.nav-mobile-toggle.open span:nth-child(3) {
  transform: translateY(-7px) rotate(-45deg);
}

/* Mobile menu */
.nav-mobile-menu {
  display: flex;
  flex-direction: column;
  padding: 1rem 1.5rem 1.5rem;
  background: rgba(10, 10, 15, 0.97);
  backdrop-filter: blur(16px);
  border-top: 1px solid var(--border);
  gap: 0.5rem;
}

.mobile-link {
  font-size: 1rem;
  font-weight: 500;
  color: var(--text-secondary);
  padding: 0.6rem 0;
  border-bottom: 1px solid var(--border);
  text-decoration: none;
}

.mobile-link:hover {
  color: var(--text-primary);
}

.mobile-actions {
  display: flex;
  gap: 0.75rem;
  margin-top: 0.75rem;
  flex-wrap: wrap;
}

@media (max-width: 768px) {
  .nav-links,
  .nav-actions {
    display: none;
  }

  .nav-mobile-toggle {
    display: flex;
  }
}
</style>
