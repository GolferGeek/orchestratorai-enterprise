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
    <CustomerServiceWidget />
  </div>
</template>

<script setup lang="ts">
import CustomerServiceWidget from '@/modules/landing/components/CustomerServiceWidget.vue';
import NavBar from '@/modules/landing/components/landing/NavBar.vue';
import HeroSection from '@/modules/landing/components/landing/HeroSection.vue';
import ProductCards from '@/modules/landing/components/landing/ProductCards.vue';
import FeatureGrid from '@/modules/landing/components/landing/FeatureGrid.vue';
import CTASection from '@/modules/landing/components/landing/CTASection.vue';
import WhatsPossible from '@/modules/landing/components/landing/WhatsPossible.vue';
import Footer from '@/modules/landing/components/landing/Footer.vue';
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
