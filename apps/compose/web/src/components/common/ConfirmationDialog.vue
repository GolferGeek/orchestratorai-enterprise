<template>
  <ion-alert
    :is-open="isOpen"
    :header="title"
    :message="message"
    :buttons="alertButtons"
    @didDismiss="$emit('cancel')"
  />
</template>
<script setup lang="ts">
import { computed } from 'vue';
import { IonAlert } from '@ionic/vue';
interface Props {
  isOpen?: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  confirmColor?: string;
}
const props = withDefaults(defineProps<Props>(), {
  isOpen: true,
  confirmText: 'Confirm',
  cancelText: 'Cancel',
  confirmColor: 'primary',
});
const emit = defineEmits<{
  confirm: [];
  cancel: [];
}>();
const alertButtons = computed(() => [
  {
    text: props.cancelText,
    role: 'cancel',
    handler: () => emit('cancel'),
  },
  {
    text: props.confirmText,
    role: 'confirm',
    handler: () => emit('confirm'),
  },
]);
</script>
