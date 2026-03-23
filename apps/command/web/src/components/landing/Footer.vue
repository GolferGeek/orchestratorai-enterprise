<template>
  <footer class="site-footer">
    <div class="container footer-inner">
      <span class="brand-name">OrchestratorAI</span>
      <span class="divider">&middot;</span>
      <router-link to="/pricing" class="footer-link">Pricing</router-link>
      <span class="divider">&middot;</span>
      <router-link to="/about" class="footer-link">About</router-link>
      <span class="divider">&middot;</span>
      <router-link to="/login" class="footer-link">Log In</router-link>
    </div>
    <div class="container">
      <p class="copyright">&copy; {{ currentYear }} OrchestratorAI. All rights reserved.</p>
    </div>
  </footer>
</template>

<script setup lang="ts">
const currentYear = new Date().getFullYear();
</script>

<style scoped>
.site-footer {
  background: var(--bg-surface, #0f172a);
  border-top: 1px solid var(--border, #334155);
  padding: 2rem 0 1.5rem;
  text-align: center;
}

.container {
  max-width: 960px;
  margin: 0 auto;
  padding: 0 1.5rem;
}

.footer-inner {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  margin-bottom: 1rem;
  flex-wrap: wrap;
}

.brand-name {
  font-weight: 700;
  color: var(--text-primary, #f1f5f9);
  font-size: 0.9rem;
}

.divider {
  color: var(--text-muted, #475569);
}

.footer-link {
  color: var(--text-muted, #64748b);
  text-decoration: none;
  font-size: 0.85rem;
  transition: color 0.15s;
}

.footer-link:hover {
  color: var(--text-primary, #e2e8f0);
}

.copyright {
  font-size: 0.75rem;
  color: var(--text-muted, #475569);
  margin: 0;
}
</style>
