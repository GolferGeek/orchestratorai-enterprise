<template>
  <form @submit.prevent="handleSignup">
    <ion-list>
      <ion-item>
        <ion-label position="stacked">Display Name (Optional)</ion-label>
        <ion-input type="text" v-model="displayName"></ion-input>
      </ion-item>
      <ion-item>
        <ion-label position="stacked">Email</ion-label>
        <ion-input type="email" v-model="email" required></ion-input>
      </ion-item>
      <ion-item>
        <ion-label position="stacked">Password</ion-label>
        <ion-input type="password" v-model="password" required></ion-input>
      </ion-item>
      <ion-item>
        <ion-label position="stacked">Confirm Password</ion-label>
        <ion-input type="password" v-model="confirmPassword" required></ion-input>
      </ion-item>
    </ion-list>
    <div class="ion-padding">
      <ion-button type="submit" expand="block" :disabled="loading">Sign Up</ion-button>
      <ion-text color="danger" v-if="error">{{ error }}</ion-text>
      <ion-text color="success" v-if="successMessage">{{ successMessage }}</ion-text>
    </div>
  </form>
</template>
<script lang="ts" setup>
import { ref } from 'vue';
import { IonList, IonItem, IonLabel, IonInput, IonButton, IonText } from '@ionic/vue';
const displayName = ref('');
const email = ref('');
const password = ref('');
const confirmPassword = ref('');
const error = ref<string | null>(null);
const successMessage = ref<string | null>(null);
const loading = ref(false);
// Define emits for when signup is successful or fails
const emit = defineEmits(['signup-success', 'signup-failed']);
const handleSignup = async () => {
  error.value = null;
  successMessage.value = null;
  if (password.value !== confirmPassword.value) {
    error.value = 'Passwords do not match.';
    emit('signup-failed', error.value);
    return;
  }
  loading.value = true;
  try {
    // Here you would call your authentication service
    // Example: const result = await authService.signup(email.value, password.value, displayName.value);
    // if (result.success) {
    //   successMessage.value = result.message; // e.g., "Signup successful! Check email for confirmation / Logged in."
    //   emit('signup-success', result.data);
    // } else {
    //   error.value = result.message || 'Signup failed.';
    //   emit('signup-failed', error.value);
    // }
    // API call - would connect to real authentication service
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // This would be replaced with actual API integration
    error.value = 'Signup API not yet implemented';
    emit('signup-failed', error.value);
    
    // Real implementation would:
    // const response = await authService.signup({ email: email.value, password: password.value, displayName: displayName.value });
    // emit('signup-success', response);
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : 'An unexpected error occurred during signup.';
    emit('signup-failed', error.value);
  } finally {
    loading.value = false;
  }
};
</script>
<style scoped>
.ion-padding {
  padding-top: 16px;
}
</style> 