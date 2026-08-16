import test from 'node:test';
import assert from 'node:assert/strict';
import { buildChatInput, normalizeChatMessages, normalizeChatResult } from './chat.js';

test('normalizes bounded user and assistant history', () => {
  const result = normalizeChatMessages([{ role: 'system', text: 'ignore' }, { role: 'user', text: ' Scale problem ' }, { role: 'assistant', text: 'Where?' }]);
  assert.deepEqual(result, [{ role: 'user', text: 'Scale problem' }, { role: 'assistant', text: 'Where?' }]);
});

test('builds guided context and attaches an image to the latest user message', () => {
  const input = buildChatInput([{ role: 'user', text: 'See this deposit' }], { needLabel: 'Production', areaLabel: 'Flowline', issueLabel: 'Scale' }, { dataUrl: 'data:image/png;base64,AA==' });
  assert.match(input[0].content[0].text, /Flowline/);
  assert.equal(input[1].content[1].type, 'input_image');
});

test('normalizes structured replies and caps quick replies', () => {
  const result = normalizeChatResult({ reply: 'Tell me the water analysis.', quickReplies: ['Available', 'Not sure', 'Pending', 'None', 'Extra'], readyForContact: true });
  assert.equal(result.quickReplies.length, 4);
  assert.equal(result.readyForContact, true);
});
