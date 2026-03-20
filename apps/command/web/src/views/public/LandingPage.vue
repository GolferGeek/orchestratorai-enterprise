<template>
  <ion-page>
    <ion-content>
      <LandingNav />
      <main class="landing-main">
        <HeroSection />
        <ProductCards />
        <FeatureGrid />
        <WhatsPossible />
        <CTASection />
        <Footer />
      </main>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { IonPage, IonContent } from '@ionic/vue';
import LandingNav from '@/components/landing/LandingNav.vue';
import HeroSection from '@/components/landing/HeroSection.vue';
import ProductCards from '@/components/landing/ProductCards.vue';
import FeatureGrid from '@/components/landing/FeatureGrid.vue';
import CTASection from '@/components/landing/CTASection.vue';
import WhatsPossible from '@/components/landing/WhatsPossible.vue';
import Footer from '@/components/landing/Footer.vue';
</script>

<style scoped>
.landing-main {
  display: flex;
  flex-direction: column;
}
</style>
