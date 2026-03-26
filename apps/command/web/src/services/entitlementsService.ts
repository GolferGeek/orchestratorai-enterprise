/**
 * Entitlements Service
 * Fetches product entitlements from Auth API (port 6100).
 * Computes which products the authenticated user can access
 * and populates the entitlementsStore.
 *
 * Service layer: all async operations, no UI logic.
 */

import axios from 'axios';
import { nextTick } from 'vue';
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

    try {
      const token = rbacStore.token;

      // Use relative URL so requests go through nginx gateway
      const response = await axios.get<EntitlementsResponse>(
        '/auth/entitlements',
        {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          timeout: 5000,
        }
      );
      // Auth API returns { products: [{slug, name, hasAccess, webUrl}, ...] }
      const apiProducts = response.data.products ?? [];
      const accessMap = new Map(
        apiProducts.map((p: any) => [p.slug, { hasAccess: p.hasAccess, webUrl: p.webUrl }])
      );

      const products: ProductEntitlement[] = ALL_PRODUCTS.map(product => ({
        ...product,
        hasAccess: accessMap.get(product.productSlug)?.hasAccess ?? false,
        webUrl: accessMap.get(product.productSlug)?.webUrl,
      }));

      store.setEntitlements(products);
      store.setLoading(false);
      await nextTick();
    } catch (err: any) {
      store.setError(err?.message || 'Failed to load entitlements');
    }
  },

  /**
   * Build the URL for a product given its port.
   * In development: http://localhost:<port>
   * In production: derive from current host convention.
   */
  getProductUrl(product: ProductEntitlement): string {
    const rbacStore = useRbacStore();
    // Gateway mode: accessed via nginx reverse proxy (not localhost in browser)
    const isGateway = window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';
    if (isGateway) {
      // Use path-based routing through the gateway (e.g., /forge/, /compose/)
      const slugToPath: Record<string, string> = {
        forge: '/forge/', compose: '/compose/', pulse: '/pulse/',
        bridge: '/bridge/', admin: '/admin/', 'protocol-lab': '/protocol-lab/',
      };
      return slugToPath[product.productSlug] || `/${product.productSlug}/`;
    }
    // Local dev: direct port access with SSO token
    const token = rbacStore.token;
    const base = `http://localhost:${product.port}`;
    return token ? `${base}?sso_token=${token}` : base;
  },
};
