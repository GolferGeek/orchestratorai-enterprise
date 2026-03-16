import type { DefineComponent } from 'vue';

export interface TableColumn {
  key: string;
  label: string;
  width?: string;
  sortable?: boolean;
}

declare const component: DefineComponent<object, object, any>;
export default component;
