<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-menu-button></ion-menu-button>
        </ion-buttons>
        <ion-title>Welcome</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content class="ion-padding">
      <h2>Welcome to Orchestrator AI</h2>
      <p>
        You are signed in. Explore features from the menu.
      </p>

      <ion-card>
        <ion-card-header>
          <ion-card-title>Quick Links</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <ion-list>
            <ion-item button :router-link="{ name: 'Evaluations' }">Evaluations</ion-item>
            <ion-item button :router-link="{ name: 'Organization' }">Organization</ion-item>
          </ion-list>
        </ion-card-content>
      </ion-card>

      <ion-text color="medium">
        Admins are redirected to the Admin dashboard automatically.
      </ion-text>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { IonPage, IonHeader, IonToolbar, IonButtons, IonMenuButton, IonTitle, IonContent, IonCard, IonCardHeader, IonCardTitle, IonCardContent, IonList, IonItem, IonText } from '@ionic/vue';
</script>

<style scoped>
h2 { margin-top: 0; }
</style>

