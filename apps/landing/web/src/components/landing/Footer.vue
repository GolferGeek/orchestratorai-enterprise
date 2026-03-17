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
          <a :href="commandWebUrl">Log In</a>
          <a :href="commandWebUrl">Get Started</a>
        </div>
      </nav>
    </div>

    <div class="footer-bottom container">
      <p class="copyright">&copy; {{ currentYear }} OrchestratorAI. All rights reserved.</p>
      <p class="footer-ports">
        <span class="port-tag">Port 6102</span> Command
        <span class="port-sep">·</span>
        <span class="port-tag">Port 6400</span> Landing
      </p>
    </div>
  </footer>
</template>

<script setup lang="ts">
const currentYear = new Date().getFullYear();
const commandWebUrl = import.meta.env.VITE_COMMAND_WEB_URL ?? 'http://localhost:6102';
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

.footer-ports {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.78rem;
  color: var(--text-muted);
}

.port-tag {
  background: rgba(59, 130, 246, 0.12);
  border: 1px solid rgba(59, 130, 246, 0.2);
  color: var(--primary-light);
  padding: 0.15rem 0.5rem;
  border-radius: 4px;
  font-family: monospace;
  font-size: 0.75rem;
}

.port-sep {
  opacity: 0.4;
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
