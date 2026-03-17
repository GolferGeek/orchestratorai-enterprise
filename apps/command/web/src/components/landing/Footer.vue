<template>
  <footer class="site-footer">
    <div class="container footer-inner">
      <div class="footer-brand">
        <div class="brand-mark">O</div>
        <span class="brand-name">OrchestratorAI</span>
        <p class="footer-tagline">Enterprise AI Platform</p>
      </div>

      <nav class="footer-nav" aria-label="Footer navigation">
        <div class="footer-col">
          <h4>Platform</h4>
          <router-link to="/features">Features</router-link>
          <router-link to="/pricing">Pricing</router-link>
          <router-link to="/about">About</router-link>
        </div>
        <div class="footer-col">
          <h4>Products</h4>
          <span>Forge</span>
          <span>Compose</span>
          <span>Flow</span>
          <span>Pulse</span>
          <span>Bridge</span>
          <span>Admin</span>
        </div>
        <div class="footer-col">
          <h4>Access</h4>
          <router-link to="/login">Log In</router-link>
          <router-link to="/login">Get Started</router-link>
        </div>
      </nav>
    </div>

    <div class="footer-bottom container">
      <p class="copyright">&copy; {{ currentYear }} OrchestratorAI. All rights reserved.</p>
    </div>
  </footer>
</template>

<script setup lang="ts">
const currentYear = new Date().getFullYear();
</script>

<style scoped>
.site-footer {
  background: var(--bg-surface);
  border-top: 1px solid var(--border);
  padding: 4rem 0 2rem;
}

.footer-inner {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 4rem;
  margin-bottom: 3rem;
}

/* Brand */
.footer-brand {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.brand-mark {
  width: 36px;
  height: 36px;
  background: var(--gradient-primary);
  border-radius: 9px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1rem;
  font-weight: 900;
  color: #fff;
}

.brand-name {
  font-size: 1rem;
  font-weight: 700;
  color: var(--text-primary);
}

.footer-tagline {
  font-size: 0.85rem;
  color: var(--text-muted);
}

/* Nav */
.footer-nav {
  display: flex;
  gap: 4rem;
}

.footer-col {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.footer-col h4 {
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.1em;
  margin-bottom: 0.25rem;
}

.footer-col a,
.footer-col span {
  font-size: 0.9rem;
  color: var(--text-secondary);
  text-decoration: none;
  transition: color 0.15s ease;
  cursor: default;
}

.footer-col a {
  cursor: pointer;
}

.footer-col a:hover {
  color: var(--text-primary);
}

/* Bottom bar */
.footer-bottom {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 2rem;
  border-top: 1px solid var(--border);
  flex-wrap: wrap;
  gap: 1rem;
}

.copyright {
  font-size: 0.85rem;
  color: var(--text-muted);
}

@media (max-width: 768px) {
  .footer-inner {
    grid-template-columns: 1fr;
    gap: 2.5rem;
  }

  .footer-nav {
    gap: 2rem;
    flex-wrap: wrap;
  }
}
</style>
