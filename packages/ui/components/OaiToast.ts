/**
 * useToast — composable wrapper for Ionic's toastController
 *
 * Usage:
 *   const { showToast } = useToast()
 *   showToast('Saved successfully', 'success')
 */

import { toastController } from '@ionic/vue';

export type ToastVariant = 'success' | 'error' | 'warning' | 'info';

const VARIANT_COLOR_MAP: Record<ToastVariant, string> = {
  success: 'success',
  error: 'danger',
  warning: 'warning',
  info: 'tertiary',
};

const VARIANT_ICON_MAP: Record<ToastVariant, string> = {
  success: 'checkmark-circle-outline',
  error: 'close-circle-outline',
  warning: 'warning-outline',
  info: 'information-circle-outline',
};

export function useToast() {
  async function showToast(
    message: string,
    variant: ToastVariant = 'info',
    duration: number = 3000,
  ): Promise<void> {
    const toast = await toastController.create({
      message,
      duration,
      color: VARIANT_COLOR_MAP[variant],
      position: 'bottom',
      positionAnchor: undefined,
      cssClass: ['oai-toast', `oai-toast--${variant}`],
      buttons: [
        {
          icon: VARIANT_ICON_MAP[variant],
          side: 'start',
          role: 'info',
        },
        {
          icon: 'close-outline',
          side: 'end',
          role: 'cancel',
        },
      ],
    });

    await toast.present();
  }

  return { showToast };
}
