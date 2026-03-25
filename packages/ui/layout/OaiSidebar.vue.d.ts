import type { DefineComponent } from 'vue';

export interface NavItem {
  label: string;
  icon?: string;
  path?: string;
  children?: NavItem[];
  badge?: string | number;
  external?: boolean;
}

declare const component: DefineComponent<object, object, any>;
export default component;
