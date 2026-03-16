import type { DefineComponent } from 'vue';

export interface SelectOption {
  value: string | number;
  label: string;
}

declare const component: DefineComponent<object, object, any>;
export default component;
