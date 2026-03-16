/**
 * @orchestratorai/ui/theme
 *
 * Theme system for OrchestratorAI Enterprise products.
 *
 * CSS files are imported by consuming apps (NOT from this barrel):
 *
 *   // In the product's main.ts or App.vue:
 *   import '@orchestratorai/ui/theme/brand.css'       // palette tokens + constants
 *   import '@orchestratorai/ui/theme/ionic-dark.css'  // dark theme overrides
 *   import '@orchestratorai/ui/theme/ionic-light.css' // light theme overrides
 *
 * The composable and early-apply helper ARE exported from this barrel:
 *
 *   import { useTheme, applyThemeEarly } from '@orchestratorai/ui/theme'
 *
 * Quick start:
 *
 *   // main.ts
 *   import '@orchestratorai/ui/theme/brand.css'
 *   import '@orchestratorai/ui/theme/ionic-dark.css'
 *   import '@orchestratorai/ui/theme/ionic-light.css'
 *   import { applyThemeEarly } from '@orchestratorai/ui/theme'
 *
 *   applyThemeEarly()  // prevents flash of wrong theme before Vue mounts
 *   createApp(App).mount('#app')
 *
 *   // Any component:
 *   import { useTheme } from '@orchestratorai/ui/theme'
 *   const { isDark, toggleTheme } = useTheme()
 */

export { useTheme, applyThemeEarly } from './useTheme';
export type { ThemeMode } from './useTheme';
