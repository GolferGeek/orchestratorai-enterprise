import { onMounted, onUnmounted } from 'vue';
import type { AgentChatMode } from '@/types/conversation';

interface ShortcutOptions {
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
}

type ModeSelectableStore = {
  setChatMode: (mode: AgentChatMode) => void;
  isModeAllowed: (mode: AgentChatMode) => boolean;
};

export function useKeyboardShortcut(
  key: string,
  callback: () => void,
  options: ShortcutOptions = {},
) {
  const normalizedKey = key.toLowerCase();

  const handler = (event: KeyboardEvent) => {
    if (event.repeat) return;
    if (event.key.toLowerCase() !== normalizedKey) return;
    if (options.ctrl && !(event.ctrlKey || event.metaKey)) return;
    if (options.shift && !event.shiftKey) return;
    if (options.alt && !event.altKey) return;

    const target = event.target as HTMLElement | null;
    const tagName = target?.tagName.toLowerCase();
    if (tagName === 'input' || tagName === 'textarea' || target?.isContentEditable) {
      return;
    }

    event.preventDefault();
    callback();
  };

  onMounted(() => {
    window.addEventListener('keydown', handler);
  });

  onUnmounted(() => {
    window.removeEventListener('keydown', handler);
  });
}

export function useModeSwitchShortcuts(chatStore: ModeSelectableStore) {
  useKeyboardShortcut(
    't',
    () => {
      if (chatStore.isModeAllowed('converse')) {
        chatStore.setChatMode('converse');
      }
    },
    { ctrl: true },
  );

  useKeyboardShortcut(
    'p',
    () => {
      if (chatStore.isModeAllowed('plan')) {
        chatStore.setChatMode('plan');
      }
    },
    { ctrl: true },
  );

  useKeyboardShortcut(
    'b',
    () => {
      if (chatStore.isModeAllowed('build')) {
        chatStore.setChatMode('build');
      }
    },
    { ctrl: true },
  );
}
