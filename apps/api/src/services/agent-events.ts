import { EventEmitter } from 'node:events';
import type { ProgressStep, ProgressData } from '@mantleagents/shared';

export type { ProgressStep };

export interface ProgressEvent {
  step: ProgressStep;
  message: string;
  data?: ProgressData;
  agentType?: 'fx' | 'yield';
}

/**
 * Singleton event emitter for agent cycle progress.
 * Events are keyed by `progress:{walletAddress}`.
 */
export const agentEvents = new EventEmitter();
agentEvents.setMaxListeners(50);

export function emitProgress(
  walletAddress: string,
  step: ProgressStep,
  message: string,
  data?: ProgressData,
  agentType?: 'fx' | 'yield',
): void {
  agentEvents.emit(`progress:${walletAddress}`, { step, message, data, agentType } satisfies ProgressEvent);
}
