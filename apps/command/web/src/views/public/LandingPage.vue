<template>
  <ion-page>
    <ion-content>
      <LandingNav />
      <main class="landing-main">
        <HeroSection />
        <ProblemSection />
        <SolutionSection />
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
import ProblemSection from '@/components/landing/ProductCards.vue';
import SolutionSection from '@/components/landing/FeatureGrid.vue';
import CTASection from '@/components/landing/CTASection.vue';
import Footer from '@/components/landing/Footer.vue';
</script>

<style scoped>
.landing-main {
  display: flex;
  flex-direction: column;
}
</style>
