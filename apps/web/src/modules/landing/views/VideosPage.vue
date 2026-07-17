<template>
  <div class="videos-page">
    <NavBar />
    <main>
      <section class="page-hero">
        <div class="container">
          <span class="section-label">Videos</span>
          <h1 class="page-headline">See OrchestratorAI in Motion</h1>
          <p class="page-sub">
            Product walkthroughs, architecture notes, and implementation demos for teams evaluating the platform.
          </p>
        </div>
      </section>

      <section class="videos-section">
        <div class="container">
          <div
            v-for="category in orderedCategories"
            :key="category.slug"
            class="video-category"
          >
            <div class="section-header">
              <span class="section-label">{{ category.title }}</span>
              <h2 class="section-heading">{{ category.title }}</h2>
              <p class="section-sub">{{ category.description }}</p>
            </div>

            <div class="video-grid">
              <article
                v-for="video in category.videos"
                :key="video.id"
                class="video-card"
              >
                <div class="video-frame">
                  <iframe
                    :src="video.url"
                    :title="video.title"
                    allowfullscreen
                    loading="lazy"
                  />
                </div>
                <div class="video-copy">
                  <div class="video-meta">
                    <span>{{ video.duration }}</span>
                    <span>{{ formatDate(video.createdAt) }}</span>
                  </div>
                  <h3>{{ video.title }}</h3>
                  <p>{{ video.description }}</p>
                </div>
              </article>
            </div>
          </div>
        </div>
      </section>

      <CTASection />
    </main>
    <Footer />
    <CustomerServiceWidget />
  </div>
</template>

<script setup lang="ts">
import CustomerServiceWidget from '@/modules/landing/components/CustomerServiceWidget.vue';
import NavBar from '@/modules/landing/components/landing/NavBar.vue';
import CTASection from '@/modules/landing/components/landing/CTASection.vue';
import Footer from '@/modules/landing/components/landing/Footer.vue';
import videosData from '@/modules/landing/data/videos/videos.json';

interface VideoItem {
  id: string;
  title: string;
  description: string;
  url: string;
  duration: string;
  createdAt: string;
  featured: boolean;
  order: number;
}

interface VideoCategory {
  title: string;
  description: string;
  order: number;
  videos: VideoItem[];
}

const videoLibrary = videosData as {
  categoryOrder: string[];
  categories: Record<string, VideoCategory>;
};

const orderedCategories = videoLibrary.categoryOrder.map((slug) => {
  const category = videoLibrary.categories[slug];
  return {
    slug,
    ...category,
    videos: [...category.videos].sort((a, b) => a.order - b.order),
  };
});

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(value));
}
</script>

<style scoped>
.videos-page {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

main {
  flex: 1;
}

.page-hero {
  padding: calc(var(--nav-height) + 5rem) 0 5rem;
  background: var(--gradient-hero);
  text-align: center;
  border-bottom: 1px solid var(--border);
}

.page-headline {
  font-size: clamp(2.2rem, 5vw, 3.5rem);
  font-weight: 800;
  color: var(--text-primary);
  margin: 1rem 0;
  line-height: 1.15;
}

.page-sub {
  font-size: 1.1rem;
  line-height: 1.75;
  color: var(--text-secondary);
  max-width: 700px;
  margin: 0 auto;
}

.videos-section {
  padding: 5rem 0;
  background: var(--bg-base);
}

.video-category + .video-category {
  margin-top: 5rem;
}

.section-header {
  max-width: 720px;
  margin-bottom: 2rem;
}

.video-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 1.5rem;
}

.video-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  overflow: hidden;
  box-shadow: var(--shadow-sm);
}

.video-frame {
  aspect-ratio: 16 / 9;
  background: var(--bg-surface);
}

.video-frame iframe {
  width: 100%;
  height: 100%;
  border: 0;
  display: block;
}

.video-copy {
  padding: 1.25rem;
}

.video-meta {
  display: flex;
  gap: 0.75rem;
  flex-wrap: wrap;
  color: var(--text-muted);
  font-size: 0.85rem;
  font-weight: 600;
  margin-bottom: 0.75rem;
}

.video-copy h3 {
  color: var(--text-primary);
  font-size: 1.15rem;
  line-height: 1.3;
  margin-bottom: 0.5rem;
}

.video-copy p {
  color: var(--text-secondary);
  line-height: 1.65;
}
</style>
