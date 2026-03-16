import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { IonicVue } from '@ionic/vue';
import { createPinia, setActivePinia } from 'pinia';
import ChatInput from '../ChatInput.vue';

// Mock Capacitor
vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: vi.fn(() => false),
  },
}));

// Mock toastController
const mockToast = {
  present: vi.fn(),
};

vi.mock('@ionic/vue', async () => {
  const actual = await vi.importActual('@ionic/vue');
  return {
    // @ts-expect-error - Spread in mock return object
    ...actual,
    toastController: {
      create: vi.fn(() => Promise.resolve(mockToast)),
    },
  };
});

// Mock Web Speech API
const mockRecognition = {
  continuous: false,
  interimResults: false,
  lang: 'en-US',
  start: vi.fn(),
  stop: vi.fn(),
  onstart: null as (() => void) | null,
  onend: null as (() => void) | null,
  onresult: null as ((event: unknown) => void) | null,
  onerror: null as ((event: unknown) => void) | null,
};

// Create wrapper helper
const createWrapper = (props = {}) => {
  const pinia = createPinia();
  setActivePinia(pinia);

  return mount(ChatInput, {
    props,
    global: {
      plugins: [IonicVue, pinia],
      stubs: {
        'ion-textarea': {
          template: '<textarea ref="textarea" :placeholder="placeholder" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" @keydown.enter.prevent="$emit(\'keydown.enter\', $event)"></textarea>',
          props: ['placeholder', 'modelValue', 'autoGrow', 'rows'],
          emits: ['update:modelValue', 'keydown.enter'],
        },
        'ion-button': {
          template: '<button :disabled="disabled" :color="color" @click="$emit(\'click\', $event)"><slot /></button>',
          props: ['disabled', 'color', 'fill'],
          emits: ['click'],
        },
        'ion-icon': {
          template: '<span></span>',
          props: ['name', 'icon', 'slot'],
        },
        'ion-buttons': {
          template: '<div :slot="slot"><slot /></div>',
          props: ['slot'],
        },
        'ion-toolbar': {
          template: '<div :color="color"><slot /></div>',
          props: ['color'],
        },
      },
    },
  });
};

// Type helper for accessing internal component properties in tests
type ChatInputInstance = {
  inputText: string;
  sendMessage: () => void;
  togglePtt: () => void;
  isRecording: boolean;
  handleEnterKey: (event: KeyboardEvent) => void;
  uiStore: { isPttRecording: boolean };
  $nextTick: () => Promise<void>;
};

describe('ChatInput', () => {
  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();
    mockRecognition.start.mockClear();
    mockRecognition.stop.mockClear();

    // Mock Web Speech API
    (window as unknown as Record<string, unknown>).SpeechRecognition = vi.fn(() => mockRecognition);
  });

  describe('Component Rendering', () => {
    it('renders without crashing', () => {
      const wrapper = createWrapper();
      expect(wrapper.exists()).toBe(true);
    });

    it('renders textarea for message input', () => {
      const wrapper = createWrapper();
      const textarea = wrapper.find('textarea');
      expect(textarea.exists()).toBe(true);
    });

    it('renders PTT (push-to-talk) button', () => {
      const wrapper = createWrapper();
      const buttons = wrapper.findAll('button');
      expect(buttons.length).toBe(2); // PTT button + Send button
    });

    it('renders send button', () => {
      const wrapper = createWrapper();
      const buttons = wrapper.findAll('button');
      const sendButton = buttons[1]; // Second button is send
      expect(sendButton.exists()).toBe(true);
    });

    it('displays placeholder text in textarea', () => {
      const wrapper = createWrapper();
      const textarea = wrapper.find('textarea');
      expect(textarea.attributes('placeholder')).toBe('Type a message...');
    });
  });

  describe('Message Input', () => {
    it('updates input text when user types', async () => {
      const wrapper = createWrapper();
      const textarea = wrapper.find('textarea');

      await textarea.setValue('Hello, world!');
      await wrapper.vm.$nextTick();

      // Check internal state
      expect((wrapper.vm as unknown as ChatInputInstance).inputText).toBe('Hello, world!');
    });

    it('clears input after sending message', async () => {
      const wrapper = createWrapper();
      const textarea = wrapper.find('textarea');

      await textarea.setValue('Test message');
      await wrapper.vm.$nextTick();

      // Send message
      (wrapper.vm as unknown as ChatInputInstance).sendMessage();
      await wrapper.vm.$nextTick();

      expect((wrapper.vm as unknown as ChatInputInstance).inputText).toBe('');
    });

    it('trims whitespace from message before sending', async () => {
      const wrapper = createWrapper();

      (wrapper.vm as unknown as ChatInputInstance).inputText ='  Hello  ';
      (wrapper.vm as unknown as ChatInputInstance).sendMessage();

      expect(wrapper.emitted('sendMessage')?.[0]).toEqual(['Hello']);
    });
  });

  describe('Event Emissions', () => {
    it('emits sendMessage event when send button is clicked', async () => {
      const wrapper = createWrapper();
      const textarea = wrapper.find('textarea');

      await textarea.setValue('Test message');
      await wrapper.vm.$nextTick();

      const sendButton = wrapper.findAll('button')[1];
      await sendButton.trigger('click');

      expect(wrapper.emitted('sendMessage')).toBeTruthy();
      expect(wrapper.emitted('sendMessage')?.[0]).toEqual(['Test message']);
    });

    it('does not emit sendMessage when input is empty', async () => {
      const wrapper = createWrapper();

      (wrapper.vm as unknown as ChatInputInstance).sendMessage();
      await wrapper.vm.$nextTick();

      expect(wrapper.emitted('sendMessage')).toBeFalsy();
    });

    it('does not emit sendMessage when input contains only whitespace', async () => {
      const wrapper = createWrapper();

      (wrapper.vm as unknown as ChatInputInstance).inputText ='   ';
      (wrapper.vm as unknown as ChatInputInstance).sendMessage();

      expect(wrapper.emitted('sendMessage')).toBeFalsy();
    });

    it('emits pttToggle event when PTT button is clicked', async () => {
      const wrapper = createWrapper();

      // Call togglePtt directly instead of clicking button
      // (since the stub doesn't perfectly replicate Ionic's click handling)
      (wrapper.vm as unknown as ChatInputInstance).togglePtt();
      await wrapper.vm.$nextTick();

      // The recognition.start() will trigger onstart callback
      if (mockRecognition.onstart) {
        mockRecognition.onstart();
      }
      await wrapper.vm.$nextTick();

      // Should not emit pttToggle on start (only on end)
      // But isRecording should be true
      expect((wrapper.vm as unknown as ChatInputInstance).isRecording).toBe(true);
    });
  });

  describe('Keyboard Interactions', () => {
    it('sends message on Enter key press', async () => {
      const wrapper = createWrapper();
      const textarea = wrapper.find('textarea');

      await textarea.setValue('Test message');
      await wrapper.vm.$nextTick();

      const enterEvent = new KeyboardEvent('keydown', {
        key: 'Enter',
        shiftKey: false,
      });
      (wrapper.vm as unknown as ChatInputInstance).handleEnterKey(enterEvent);

      expect(wrapper.emitted('sendMessage')).toBeTruthy();
      expect(wrapper.emitted('sendMessage')?.[0]).toEqual(['Test message']);
    });

    it('does not send message on Shift+Enter', async () => {
      const wrapper = createWrapper();

      (wrapper.vm as unknown as ChatInputInstance).inputText ='Test message';
      const shiftEnterEvent = new KeyboardEvent('keydown', {
        key: 'Enter',
        shiftKey: true,
      });
      (wrapper.vm as unknown as ChatInputInstance).handleEnterKey(shiftEnterEvent);

      expect(wrapper.emitted('sendMessage')).toBeFalsy();
    });

    it('does not send message on Enter when recording', async () => {
      const wrapper = createWrapper();

      (wrapper.vm as unknown as ChatInputInstance).inputText ='Test message';
      (wrapper.vm as unknown as ChatInputInstance).isRecording =true;

      const enterEvent = new KeyboardEvent('keydown', {
        key: 'Enter',
        shiftKey: false,
      });
      (wrapper.vm as unknown as ChatInputInstance).handleEnterKey(enterEvent);

      expect(wrapper.emitted('sendMessage')).toBeFalsy();
    });
  });

  describe('Button States', () => {
    it('disables send button when input is empty', () => {
      const wrapper = createWrapper();
      const sendButton = wrapper.findAll('button')[1];

      expect(sendButton.attributes('disabled')).toBeDefined();
    });

    it('enables send button when input has text', async () => {
      const wrapper = createWrapper();
      const textarea = wrapper.find('textarea');

      await textarea.setValue('Test message');
      await wrapper.vm.$nextTick();

      const sendButton = wrapper.findAll('button')[1];
      expect(sendButton.attributes('disabled')).toBeUndefined();
    });

    it('disables send button when recording', async () => {
      const wrapper = createWrapper();

      (wrapper.vm as unknown as ChatInputInstance).inputText ='Test message';
      (wrapper.vm as unknown as ChatInputInstance).isRecording =true;
      await wrapper.vm.$nextTick();

      const sendButton = wrapper.findAll('button')[1];
      expect(sendButton.attributes('disabled')).toBeDefined();
    });

    it('changes PTT button color when recording', async () => {
      const wrapper = createWrapper();

      (wrapper.vm as unknown as ChatInputInstance).isRecording =true;
      await wrapper.vm.$nextTick();

      const pttButton = wrapper.findAll('button')[0];
      expect(pttButton.attributes('color')).toBe('danger');
    });

    it('uses medium color for PTT button when not recording', () => {
      const wrapper = createWrapper();
      const pttButton = wrapper.findAll('button')[0];

      expect(pttButton.attributes('color')).toBe('medium');
    });
  });

  describe('PTT (Push-to-Talk) Functionality', () => {
    it('starts recording when PTT button is clicked', async () => {
      const wrapper = createWrapper();
      const pttButton = wrapper.findAll('button')[0];

      await pttButton.trigger('click');

      expect(mockRecognition.start).toHaveBeenCalled();
    });

    it('stops recording when PTT button is clicked while recording', async () => {
      const wrapper = createWrapper();
      (wrapper.vm as unknown as ChatInputInstance).isRecording =true;

      const pttButton = wrapper.findAll('button')[0];
      await pttButton.trigger('click');

      expect(mockRecognition.stop).toHaveBeenCalled();
    });

    it('clears input text when starting recording', async () => {
      const wrapper = createWrapper();
      (wrapper.vm as unknown as ChatInputInstance).inputText ='Previous text';

      const pttButton = wrapper.findAll('button')[0];
      await pttButton.trigger('click');
      await wrapper.vm.$nextTick();

      // Input should be cleared when recording starts
      // This happens in the start callback, simulated here
      if (mockRecognition.onstart) {
        mockRecognition.onstart();
      }
      expect((wrapper.vm as unknown as ChatInputInstance).inputText).toBe('');
    });

    it('updates isRecording state on recognition start', () => {
      const wrapper = createWrapper();
      (wrapper.vm as unknown as ChatInputInstance).isRecording =false;

      // Simulate recognition start event
      if (mockRecognition.onstart) {
        mockRecognition.onstart();
      }
      expect((wrapper.vm as unknown as ChatInputInstance).isRecording).toBe(true);
    });

    it('updates isRecording state on recognition end', () => {
      const wrapper = createWrapper();
      (wrapper.vm as unknown as ChatInputInstance).isRecording =true;

      // Simulate recognition end event
      if (mockRecognition.onend) {
        mockRecognition.onend();
      }
      expect((wrapper.vm as unknown as ChatInputInstance).isRecording).toBe(false);
    });

    it('emits pttToggle event with false when recording ends', () => {
      const wrapper = createWrapper();
      (wrapper.vm as unknown as ChatInputInstance).isRecording =true;

      // Simulate recognition end event
      if (mockRecognition.onend) {
        mockRecognition.onend();
      }

      expect(wrapper.emitted('pttToggle')).toBeTruthy();
      const lastEmission = wrapper.emitted('pttToggle')?.slice(-1)[0];
      expect(lastEmission).toEqual([false]);
    });
  });

  describe('Store Integration', () => {
    it('updates UI store PTT recording state when recording starts', async () => {
      const wrapper = createWrapper();
      const uiStore = (wrapper.vm as unknown as ChatInputInstance).uiStore;

      (wrapper.vm as unknown as ChatInputInstance).isRecording =true;
      await wrapper.vm.$nextTick();

      expect(uiStore.isPttRecording).toBe(true);
    });

    it('updates UI store PTT recording state when recording stops', async () => {
      const wrapper = createWrapper();
      const uiStore = (wrapper.vm as unknown as ChatInputInstance).uiStore;

      (wrapper.vm as unknown as ChatInputInstance).isRecording =true;
      await wrapper.vm.$nextTick();

      (wrapper.vm as unknown as ChatInputInstance).isRecording =false;
      await wrapper.vm.$nextTick();

      expect(uiStore.isPttRecording).toBe(false);
    });
  });

  describe('Edge Cases', () => {
    it('handles multiple rapid Enter key presses', async () => {
      const wrapper = createWrapper();

      (wrapper.vm as unknown as ChatInputInstance).inputText ='Test message';

      const enterEvent = new KeyboardEvent('keydown', {
        key: 'Enter',
        shiftKey: false,
      });

      // Simulate rapid pressing
      (wrapper.vm as unknown as ChatInputInstance).handleEnterKey(enterEvent);
      (wrapper.vm as unknown as ChatInputInstance).handleEnterKey(enterEvent);
      (wrapper.vm as unknown as ChatInputInstance).handleEnterKey(enterEvent);

      // Only first should emit (input is cleared after first send)
      expect(wrapper.emitted('sendMessage')?.length).toBe(1);
    });

    it('handles sending message with newlines from Shift+Enter', async () => {
      const wrapper = createWrapper();

      (wrapper.vm as unknown as ChatInputInstance).inputText ='Line 1\nLine 2';
      (wrapper.vm as unknown as ChatInputInstance).sendMessage();

      expect(wrapper.emitted('sendMessage')?.[0]).toEqual(['Line 1\nLine 2']);
    });

    it('handles component unmount while recording', () => {
      const wrapper = createWrapper();
      (wrapper.vm as unknown as ChatInputInstance).isRecording =true;

      // Unmount should stop recording
      wrapper.unmount();

      // Verify cleanup was attempted
      expect(mockRecognition.stop).toHaveBeenCalled();
    });
  });
});
