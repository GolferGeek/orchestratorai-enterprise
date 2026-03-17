<template>
  <div class="landing-page">
    <NavBar />
    <main>
      <HeroSection />
      <ProductCards />
      <FeatureGrid />
      <WhatsPossible />
      <CTASection />
    </main>
    <Footer />
  </div>
</template>

<script setup lang="ts">
import NavBar from '@/components/landing/NavBar.vue';
import HeroSection from '@/components/landing/HeroSection.vue';
import ProductCards from '@/components/landing/ProductCards.vue';
import FeatureGrid from '@/components/landing/FeatureGrid.vue';
import CTASection from '@/components/landing/CTASection.vue';
import WhatsPossible from '@/components/landing/WhatsPossible.vue';
import Footer from '@/components/landing/Footer.vue';
</script>

<style scoped>
.landing-page {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

main {
  flex: 1;
}
</style>
