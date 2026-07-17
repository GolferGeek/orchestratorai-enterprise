<template>
  <div v-if="guide" class="help-guide">
    <button
      class="help-guide__trigger"
      type="button"
      :aria-label="`Open help: ${guide.title}`"
      @click="isOpen = true"
    >
      <ion-icon :icon="helpCircleOutline" aria-hidden="true" />
      <span>Help</span>
    </button>

    <ion-modal :is-open="isOpen" css-class="help-guide-modal" @didDismiss="isOpen = false">
      <ion-header>
        <ion-toolbar>
          <ion-title>{{ guide.title }}</ion-title>
          <ion-buttons slot="end">
            <ion-button aria-label="Close guide" @click="isOpen = false">
              <ion-icon :icon="closeOutline" slot="icon-only" />
            </ion-button>
          </ion-buttons>
        </ion-toolbar>
      </ion-header>

      <ion-content class="help-guide__content">
        <section class="help-guide__intro">
          <span class="help-guide__eyebrow">{{ guide.location }}</span>
          <h2>{{ guide.title }}</h2>
          <p>{{ guide.purpose }}</p>
          <dl>
            <div>
              <dt>Audience</dt>
              <dd>{{ guide.audience }}</dd>
            </div>
            <div>
              <dt>Read time</dt>
              <dd>{{ guide.readTime }}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>{{ guide.status === 'published' ? 'Help article ready' : 'Draft help article' }}</dd>
            </div>
          </dl>
        </section>

        <section v-if="guide.loomUrl" class="help-guide__frame" aria-label="Video walkthrough">
          <h3>Video Walkthrough</h3>
          <iframe
            :src="guide.loomUrl"
            :title="guide.title"
            allowfullscreen
            loading="lazy"
          />
        </section>

        <section class="help-guide__section">
          <h3>Start Here</h3>
          <ul>
            <li v-for="point in guide.talkingPoints" :key="point">{{ point }}</li>
          </ul>
        </section>

        <section class="help-guide__section">
          <h3>How to Think About This</h3>
          <p v-for="paragraph in guide.writtenGuide" :key="paragraph">{{ paragraph }}</p>
        </section>
      </ion-content>
    </ion-modal>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute } from 'vue-router';
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonModal,
  IonTitle,
  IonToolbar,
} from '@ionic/vue';
import { closeOutline, helpCircleOutline } from 'ionicons/icons';
import { findHelpGuideForPath } from './helpGuides';

const route = useRoute();
const isOpen = ref(false);

const guide = computed(() => findHelpGuideForPath(route.path));
</script>

<style scoped>
.help-guide {
  bottom: var(--help-guide-bottom, 24px);
  position: fixed;
  right: 24px;
  z-index: 1200;
}

.help-guide__trigger {
  align-items: center;
  background: var(--oai-primary, #2563eb);
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 8px;
  box-shadow: 0 12px 30px rgba(15, 23, 42, 0.28);
  color: #fff;
  cursor: pointer;
  display: inline-flex;
  font-size: 14px;
  font-weight: 700;
  gap: 8px;
  min-height: 42px;
  padding: 0 14px;
}

.help-guide__trigger:hover {
  background: var(--oai-primary-hover, #1d4ed8);
}

.help-guide__trigger ion-icon {
  font-size: 20px;
}

.help-guide__content {
  --background: var(--oai-bg-page, #0f172a);
  --color: var(--oai-text-primary, #e2e8f0);
}

.help-guide__intro,
.help-guide__section,
.help-guide__frame {
  margin: 0 auto;
  max-width: 840px;
}

.help-guide__intro {
  padding: 28px 20px 18px;
}

.help-guide__eyebrow {
  color: var(--oai-text-secondary, #94a3b8);
  display: block;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0;
  margin-bottom: 8px;
  text-transform: uppercase;
}

.help-guide__intro h2 {
  font-size: 28px;
  line-height: 1.15;
  margin: 0 0 10px;
}

.help-guide__intro p {
  color: var(--oai-text-secondary, #94a3b8);
  font-size: 15px;
  line-height: 1.6;
  margin: 0;
  max-width: 720px;
}

.help-guide__intro dl {
  display: grid;
  gap: 10px;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  margin: 20px 0 0;
}

.help-guide__intro dl div {
  background: var(--oai-bg-surface, #1e293b);
  border: 1px solid var(--oai-border, #334155);
  border-radius: 8px;
  padding: 12px;
}

.help-guide__intro dt {
  color: var(--oai-text-secondary, #94a3b8);
  font-size: 12px;
  font-weight: 800;
  margin-bottom: 4px;
}

.help-guide__intro dd {
  font-size: 13px;
  line-height: 1.35;
  margin: 0;
}

.help-guide__frame {
  padding: 0 20px 22px;
}

.help-guide__frame iframe {
  aspect-ratio: 16 / 9;
  background: #020617;
  border: 0;
  display: block;
  margin-top: 10px;
  width: 100%;
}

.help-guide__frame h3,
.help-guide__section h3 {
  font-size: 18px;
  line-height: 1.25;
  margin: 0 0 8px;
}

.help-guide__section p,
.help-guide__section li {
  color: var(--oai-text-secondary, #94a3b8);
  font-size: 14px;
  line-height: 1.65;
}

.help-guide__section {
  padding: 0 20px 22px;
}

.help-guide__section ul {
  margin: 0;
  padding-left: 20px;
}

.help-guide__section p {
  margin: 0 0 12px;
}

@media (max-width: 720px) {
  .help-guide {
    bottom: var(--help-guide-bottom, 16px);
    right: 16px;
  }

  .help-guide__trigger span {
    display: none;
  }

  .help-guide__intro dl {
    grid-template-columns: 1fr;
  }
}
</style>
