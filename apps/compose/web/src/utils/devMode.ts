/**
 * Check if the application is running in development mode
 *
 * Returns true if:
 * - Vite is in development mode (import.meta.env.DEV)
 * - Running on localhost or 127.0.0.1
 */
export const isDevMode = (): boolean => {
  return (
    import.meta.env.DEV ||
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1'
  );
};
