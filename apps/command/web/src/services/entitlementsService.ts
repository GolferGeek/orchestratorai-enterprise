/**
 * Entitlements Service
 * Fetches product entitlements from Auth API (port 6100).
 * Computes which products the authenticated user can access
 * and populates the entitlementsStore.
 *
 * Service layer: all async operations, no UI logic.
 */

import axios from 'axios';
import { useEntitlementsStore, type ProductEntitlement } from '@/stores/entitlementsStore';
import { useRbacStore } from '@/stores/rbacStore';

// All products in the OrchestratorAI Enterprise suite.
// hasAccess will be determined per-user from Auth API entitlements.
const ALL_PRODUCTS: Omit<ProductEntitlement, 'hasAccess'>[] = [
  {
    productSlug: 'forge',
    productName: 'Forge',
    description: 'Complex agent dashboards and LangGraph workflows',
    port: 6201,
    icon: 'hammer-outline',
  },
  {
    productSlug: 'compose',
    productName: 'Compose',
    description: 'Simple composable agents — context, RAG, API, external, media',
    port: 6301,
    icon: 'layers-outline',
  },
  {
    productSlug: 'flow',
    productName: 'Flow',
    description: 'Productivity — SyncFocus, team tasks, notes, sprints',
    port: 6901,
    icon: 'git-branch-outline',
  },
  {
    productSlug: 'admin',
    productName: 'Admin',
    description: 'Manage organizations, users, roles, and entitlements',
    port: 6101,
    icon: 'settings-outline',
  },
  {
    productSlug: 'pulse',
    productName: 'Pulse',
    description: 'Internal ambient automation and event-driven watchers',
    port: 6501,
    icon: 'pulse-outline',
  },
  {
    productSlug: 'bridge',
    productName: 'Bridge',
    description: 'External A2A communication — inbound and outbound',
    port: 6601,
    icon: 'swap-horizontal-outline',
  },
];

interface EntitlementsResponse {
  products: string[]; // array of productSlugs the user can access
}

export const entitlementsService = {
  /**
   * Load entitlements for the current user from Auth API.
   * Calls GET /auth/entitlements which returns the products the user has access to.
   */
  async loadEntitlements(): Promise<void> {
    const store = useEntitlementsStore();
    const rbacStore = useRbacStore();

    store.setLoading(true);

    const token = rbacStore.token;

    // Use relative URL so requests go through Vite dev proxy
    const response = await axios.get<EntitlementsResponse>(
      '/auth/entitlements',
      {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        timeout: 5000,
      }
    );
    // Auth API returns { products: [{slug, name, hasAccess}, ...] }
    const accessibleSlugs: string[] = (response.data.products ?? [])
      .filter((p: any) => p.hasAccess)
      .map((p: any) => p.slug);

    const products: ProductEntitlement[] = ALL_PRODUCTS.map(product => ({
      ...product,
      hasAccess: accessibleSlugs.includes(product.productSlug),
    }));

    store.setEntitlements(products);
    store.setLoading(false);
  },

  /**
   * Build the URL for a product given its port.
   * In development: http://localhost:<port>
   * In production: derive from current host convention.
   */
  getProductUrl(product: ProductEntitlement): string {
    const rbacStore = useRbacStore();
    if (import.meta.env.DEV) {
      // In dev, pass SSO token via query param since localhost cookies
      // don't share across ports in Chrome
      const token = rbacStore.token;
      const base = `http://localhost:${product.port}`;
      return token ? `${base}?sso_token=${token}` : base;
    }
    // Production: products live at subdomains or paths — adjust as needed
    const host = window.location.hostname;
    return `https://${product.productSlug}.${host}`;
  },
};
