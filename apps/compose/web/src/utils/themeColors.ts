export const getIonColor = (name: string): string | null => {
  try {
    const root = document.documentElement;
    const style = getComputedStyle(root);
    const value = style.getPropertyValue(`--ion-color-${name}`).trim();
    return value || null;
  } catch {
    return null;
  }
};

export const withFallback = (value: string | null, fallback: string) => value || fallback;

