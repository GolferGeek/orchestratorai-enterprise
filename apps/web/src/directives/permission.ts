/**
 * v-permission Directive
 *
 * Conditionally shows/hides elements based on user permissions.
 *
 * Usage:
 *   v-permission="'rag:write'"              - Single permission
 *   v-permission="['rag:write', 'rag:admin']" - Any of multiple permissions
 *   v-permission.all="['rag:write', 'admin:users']" - All permissions required
 *   v-permission.hide="'admin:users'"       - Hide instead of remove
 *
 * Examples:
 *   <ion-button v-permission="'rag:write'">Upload</ion-button>
 *   <div v-permission="['admin:users', 'admin:roles']">Admin Panel</div>
 *   <span v-permission.all="['rag:read', 'rag:write']">Full Access</span>
 */
import type { Directive, DirectiveBinding } from 'vue';
import { useRbacStore } from '@/stores/rbacStore';

interface PermissionElement extends HTMLElement {
  _permissionDisplay?: string;
  _permissionRemoved?: boolean;
  _permissionPlaceholder?: Comment;
}

type PermissionValue = string | string[];

interface PermissionModifiers {
  all?: boolean;
  hide?: boolean;
}

function checkPermission(binding: DirectiveBinding<PermissionValue>): boolean {
  const permissions = binding.value;
  const modifiers = binding.modifiers as PermissionModifiers;

  if (!permissions) {
    return true; // No permission specified, show element
  }

  const permissionList = Array.isArray(permissions) ? permissions : [permissions];

  if (permissionList.length === 0) {
    return true;
  }

  // Safely get the RBAC store - may not be initialized on login page
  let rbacStore;
  try {
    rbacStore = useRbacStore();
  } catch {
    // Store not ready, hide element by default
    return false;
  }

  // If store exists but not initialized, hide protected elements
  if (!rbacStore.isInitialized) {
    return false;
  }

  // Check if user has required permissions
  if (modifiers.all) {
    return rbacStore.hasAllPermissions(permissionList);
  } else {
    return rbacStore.hasAnyPermission(permissionList);
  }
}

function updateElement(el: PermissionElement, binding: DirectiveBinding<PermissionValue>): void {
  const hasAccess = checkPermission(binding);
  const modifiers = binding.modifiers as PermissionModifiers;

  if (hasAccess) {
    // Show element
    if (modifiers.hide) {
      // Restore original display
      el.style.display = el._permissionDisplay || '';
    } else if (el._permissionRemoved && el._permissionPlaceholder) {
      // Re-insert element
      el._permissionPlaceholder.parentNode?.replaceChild(el, el._permissionPlaceholder);
      el._permissionRemoved = false;
    }
  } else {
    // Hide element
    if (modifiers.hide) {
      // Just hide with display:none
      if (el._permissionDisplay === undefined) {
        el._permissionDisplay = el.style.display;
      }
      el.style.display = 'none';
    } else {
      // Remove from DOM (default behavior)
      if (!el._permissionRemoved && el.parentNode) {
        const placeholder = document.createComment('v-permission');
        el._permissionPlaceholder = placeholder;
        el.parentNode.replaceChild(placeholder, el);
        el._permissionRemoved = true;
      }
    }
  }
}

export const vPermission: Directive<PermissionElement, PermissionValue> = {
  mounted(el, binding) {
    updateElement(el, binding);
  },

  updated(el, binding) {
    updateElement(el, binding);
  },

  beforeUnmount(el) {
    // Cleanup
    if (el._permissionPlaceholder) {
      el._permissionPlaceholder.remove();
    }
  },
};

export default vPermission;
