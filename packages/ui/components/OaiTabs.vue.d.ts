import type { DefineComponent } from 'vue';

export interface Tab {
  value: string;
  label: string;
  icon?: string;
}

declare const component: DefineComponent<object, object, any>;
export default component;
