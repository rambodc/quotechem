import test from 'node:test';
import assert from 'node:assert/strict';
import { __testables } from './publicQuoteChat.js';

const { sanitizeAssistantUi } = __testables;

test('sanitizeAssistantUi keeps valid confirmation action payload', () => {
  const out = sanitizeAssistantUi({
    reply: 'Ready to send your confirmation email?',
    inputMode: 'action',
    actions: [
      { label: 'Yes', value: 'Yes' },
      { label: 'No', value: 'No' },
    ],
  });

  assert.equal(out.inputMode, 'action');
  assert.equal(out.actions.length, 2);
  assert.equal(out.actions[0].label, 'Yes');
});

test('sanitizeAssistantUi falls back to text mode when actions are invalid', () => {
  const out = sanitizeAssistantUi({
    reply: 'Ready to proceed?',
    inputMode: 'action',
    actions: [{ label: 'Only one', value: 'Only one' }],
  });

  assert.equal(out.inputMode, 'text');
  assert.deepEqual(out.actions, []);
});

test('sanitizeAssistantUi falls back to text mode for non-confirmation action prompts', () => {
  const out = sanitizeAssistantUi({
    reply: 'What quantity do you need?',
    inputMode: 'action',
    actions: [
      { label: '100 kg', value: '100 kg' },
      { label: '200 kg', value: '200 kg' },
    ],
  });

  assert.equal(out.inputMode, 'text');
  assert.deepEqual(out.actions, []);
});

test('sanitizeAssistantUi falls back to text mode for unknown mode', () => {
  const out = sanitizeAssistantUi({
    reply: 'Any update?',
    inputMode: 'wizard',
    actions: [
      { label: 'Yes', value: 'Yes' },
      { label: 'No', value: 'No' },
    ],
  });

  assert.equal(out.inputMode, 'text');
  assert.deepEqual(out.actions, []);
});
