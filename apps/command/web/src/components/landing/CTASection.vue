<template>
  <section class="cta-section">
    <div class="container">
      <div class="cta-inner">
        <div class="cta-orb" aria-hidden="true"></div>
        <span class="section-label">Let's Build Together</span>
        <h2 class="cta-headline">The Foundation Is Ready. Let's Make It Yours.</h2>
        <p class="cta-sub">
          The code works. The infrastructure is solid. The agents are running.
          Now we partner with you to build the AI platform your organization actually needs.
        </p>
        <div class="cta-actions">
          <a href="mailto:hello@orchestratorai.com" class="btn btn-primary cta-primary">
            Start the Conversation
            <span>→</span>
          </a>
          <router-link to="/pricing" class="btn btn-secondary">
            See Partnership Model
          </router-link>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.cta-section {
  padding: 8rem 0;
  background: var(--bg-base);
  border-top: 1px solid var(--border);
  text-align: center;
  overflow: hidden;
  position: relative;
}

.cta-inner {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
}

.cta-orb {
  position: absolute;
  width: 500px;
  height: 500px;
  background: radial-gradient(circle, rgba(59, 130, 246, 0.12), transparent 70%);
  border-radius: 50%;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  pointer-events: none;
  filter: blur(40px);
}

.cta-headline {
  font-size: clamp(2rem, 4vw, 3rem);
  font-weight: 800;
  letter-spacing: -0.02em;
  color: var(--text-primary);
  max-width: 700px;
  line-height: 1.2;
}

.cta-sub {
  font-size: 1.1rem;
  line-height: 1.75;
  color: var(--text-secondary);
  max-width: 540px;
  margin-bottom: 1rem;
}

.cta-actions {
  display: flex;
  gap: 1rem;
  justify-content: center;
  flex-wrap: wrap;
}

.cta-primary {
  padding: 0.9rem 2rem;
  font-size: 1rem;
}

@media (max-width: 600px) {
  .cta-actions {
    flex-direction: column;
    align-items: stretch;
  }

  .btn {
    justify-content: center;
    text-align: center;
  }
}
</style>
