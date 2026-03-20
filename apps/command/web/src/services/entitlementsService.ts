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
import { PRODUCT_SLUGS, PRODUCT_REGISTRY } from '@orchestrator-ai/transport-types';

// Build ALL_PRODUCTS from the central product registry.
// hasAccess will be determined per-user from Auth API entitlements.
const ALL_PRODUCTS: Omit<ProductEntitlement, 'hasAccess'>[] = PRODUCT_SLUGS.map(slug => {
  const def = PRODUCT_REGISTRY[slug];
  return {
    productSlug: def.slug,
    productName: def.displayName,
    description: def.tagline,
    port: def.webPort,
    icon: def.ionicon,
  };
});

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
