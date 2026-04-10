import type { DefineComponent } from 'vue';

export interface NavItem {
  label: string;
  icon?: string;
  path?: string;
  children?: NavItem[];
  badge?: string | number;
  external?: boolean;
  /** Optional action icon rendered at the end of an accordion header (e.g. settings gear). */
  actionIcon?: string;
  /** Router path navigated to when the action icon is clicked. */
  actionPath?: string;
}

declare const component: DefineComponent<object, object, any>;
export default component;
