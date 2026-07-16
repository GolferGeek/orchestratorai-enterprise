/**
 * Entitlements Service
 * Fetches product entitlements from the unified platform API.
 *
 * Service layer: all async operations, no UI logic.
 */

import axios from 'axios';
import { nextTick } from 'vue';
import { useEntitlementsStore, type ProductEntitlement } from '@/stores/entitlementsStore';
import { useRbacStore } from '@/stores/rbacStore';
import { PRODUCT_REGISTRY, PRODUCT_SLUGS } from '@orchestrator-ai/transport-types';

const ALL_PRODUCTS: Omit<ProductEntitlement, 'hasAccess'>[] = PRODUCT_SLUGS.map((slug) => {
  const product = PRODUCT_REGISTRY[slug];
  return {
    productSlug: product.slug,
    productName: product.displayName,
    description: product.tagline,
    port: product.webPort,
    icon: product.ionicon,
  };
});

const PRODUCT_ROUTE_MAP: Record<string, string> = {
  compose: '/app/agents',
  forge: '/app/workflows',
  pulse: '/app/ambient',
  bridge: '/app/secure-conversations',
  admin: '/app/admin/organizations',
  'protocol-lab': '/app/protocol-lab',
};

const ENTITLEMENT_ALIAS_MAP: Record<string, string[]> = {
  compose: ['compose', 'agents'],
  forge: ['forge', 'workflows'],
  pulse: ['pulse', 'ambient'],
  bridge: ['bridge', 'secure-conversations'],
  admin: ['admin', 'rag', 'settings'],
  'protocol-lab': ['protocol-lab'],
};

interface EntitlementsApiProduct {
  slug: string;
  hasAccess: boolean;
  webUrl?: string;
}

interface EntitlementsResponse {
  products: EntitlementsApiProduct[];
}

export const entitlementsService = {
  async loadEntitlements(): Promise<void> {
    const store = useEntitlementsStore();
    const rbacStore = useRbacStore();

    store.setLoading(true);

    try {
      const token = rbacStore.token;
      const response = await axios.get<EntitlementsResponse>('/api/auth/entitlements', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const apiProducts = response.data.products ?? [];
      const accessMap = new Map(
        apiProducts.map((product) => [
          product.slug,
          { hasAccess: product.hasAccess, webUrl: product.webUrl },
        ]),
      );

      const products: ProductEntitlement[] = ALL_PRODUCTS.map((product) => {
        const aliases = ENTITLEMENT_ALIAS_MAP[product.productSlug] ?? [product.productSlug];
        const matched = aliases
          .map((slug) => accessMap.get(slug))
          .find((entitlement) => entitlement?.hasAccess === true);

        return {
          ...product,
          hasAccess: matched?.hasAccess === true,
          webUrl: PRODUCT_ROUTE_MAP[product.productSlug],
        };
      });

      store.setEntitlements(products);
      store.setLoading(false);
      await nextTick();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load entitlements';
      store.setError(message);
    }
  },

  getProductUrl(product: ProductEntitlement): string {
    const route = PRODUCT_ROUTE_MAP[product.productSlug];
    if (!route) {
      throw new Error(`No unified route registered for product: ${product.productSlug}`);
    }
    return route;
  },
};
