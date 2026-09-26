/**
 * Checkpointer plane: where LangGraph keeps a thread's state between steps,
 * which is what lets a workflow pause at a human gate and resume later.
 *
 * CHECKPOINTER_PROVIDER = postgres → PostgresSaver on the platform database
 * CHECKPOINTER_PROVIDER = memory   → MemorySaver (specs only: state is lost
 *                                     on restart, so a paused run can never
 *                                     resume)
 *
 * Inject CHECKPOINT_SAVER to get a saver that is already set up. It is built
 * once per process at boot; a setup failure fails boot rather than surfacing
 * as the first workflow's error.
 */
export const CHECKPOINT_SAVER = Symbol('CHECKPOINT_SAVER');

export const CHECKPOINTER_PROVIDERS = ['postgres', 'memory'] as const;

export type CheckpointerProvider = (typeof CHECKPOINTER_PROVIDERS)[number];
