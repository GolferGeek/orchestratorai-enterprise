import { CommerceCheckoutFsmOrchestrationProvider } from '../commerce-checkout-fsm.provider';

describe('CommerceCheckoutFsmOrchestrationProvider', () => {
  let provider: CommerceCheckoutFsmOrchestrationProvider;

  beforeEach(() => {
    provider = new CommerceCheckoutFsmOrchestrationProvider();
  });

  it('creates checkout task and allows valid state transitions', async () => {
    const taskId = await provider.delegate('commerce-agent', 'checkout');

    provider.transitionCheckout(taskId, 'cart-updated');
    provider.transitionCheckout(taskId, 'payment-pending');
    provider.transitionCheckout(taskId, 'completed');

    expect(provider.getCheckoutTaskState(taskId)?.state).toBe('completed');
  });

  it('rejects invalid transitions', async () => {
    const taskId = await provider.delegate('commerce-agent', 'checkout');
    expect(() => provider.transitionCheckout(taskId, 'completed')).toThrow(
      'Invalid checkout transition cart-created -> completed',
    );
  });
});
