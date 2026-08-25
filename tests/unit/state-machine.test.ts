import { describe, it, expect } from 'vitest';
import {
  canTransitionJob,
  validateJobTransition,
  canTransitionExecution,
} from '../../src/core/state-machine/validator.js';

describe('State Machine Validator', () => {
  describe('Job State Transitions', () => {
    it('allows valid transitions', () => {
      expect(canTransitionJob('QUEUED', 'CLAIMED')).toBe(true);
      expect(canTransitionJob('SCHEDULED', 'QUEUED')).toBe(true);
      expect(canTransitionJob('CLAIMED', 'RUNNING')).toBe(true);
      expect(canTransitionJob('RUNNING', 'COMPLETED')).toBe(true);
      expect(canTransitionJob('RUNNING', 'FAILED')).toBe(true);
      expect(canTransitionJob('FAILED', 'SCHEDULED')).toBe(true);
      expect(canTransitionJob('FAILED', 'DEAD_LETTER')).toBe(true);
      expect(canTransitionJob('DEAD_LETTER', 'QUEUED')).toBe(true); // Replay
    });

    it('rejects invalid transitions', () => {
      expect(canTransitionJob('COMPLETED', 'RUNNING')).toBe(false);
      expect(canTransitionJob('QUEUED', 'COMPLETED')).toBe(false);
      expect(canTransitionJob('SCHEDULED', 'RUNNING')).toBe(false);
      expect(canTransitionJob('DEAD_LETTER', 'RUNNING')).toBe(false);
    });

    it('throws on invalid transition validation', () => {
      expect(() => validateJobTransition('COMPLETED', 'QUEUED')).toThrow(
        "Invalid job state transition from 'COMPLETED' to 'QUEUED'"
      );
    });
  });

  describe('Execution State Transitions', () => {
    it('allows valid execution transitions', () => {
      expect(canTransitionExecution('RUNNING', 'COMPLETED')).toBe(true);
      expect(canTransitionExecution('RUNNING', 'FAILED')).toBe(true);
      expect(canTransitionExecution('RUNNING', 'TIMED_OUT')).toBe(true);
    });

    it('rejects invalid execution transitions', () => {
      expect(canTransitionExecution('COMPLETED', 'RUNNING')).toBe(false);
      expect(canTransitionExecution('FAILED', 'COMPLETED')).toBe(false);
    });
  });
});
