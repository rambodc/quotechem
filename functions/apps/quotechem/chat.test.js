import test from 'node:test';
import assert from 'node:assert/strict';
import { buildChatInput, decodeAttachment, normalizeChatMessages, normalizeChatResult } from './chat.js';

test('normalizes bounded user and assistant history', () => {
  const result = normalizeChatMessages([{ role: 'system', text: 'ignore' }, { role: 'user', text: ' Scale problem ' }, { role: 'assistant', text: 'Where?' }]);
  assert.deepEqual(result, [{ role: 'user', text: 'Scale problem' }, { role: 'assistant', text: 'Where?' }]);
});

test('builds guided context and attaches an image to the latest user message', () => {
  const image = { contentType: 'image/png', name: 'deposit.png', dataUrl: 'data:image/png;base64,AA==' };
  const input = buildChatInput([{ role: 'user', text: 'See this deposit' }], { needLabel: 'Production', areaLabel: 'Flowline', issueLabel: 'Scale' }, image, 0);
  assert.match(input[0].content[0].text, /Flowline/);
  assert.equal(input[1].content[1].type, 'input_image');
});

test('builds PDF input and validates supported attachment data', () => {
  const pdf = decodeAttachment({ name: 'water analysis.pdf', dataUrl: 'data:application/pdf;base64,JVBERg==' });
  const input = buildChatInput([{ role: 'user', text: 'Review this report' }], {}, pdf, 1);
  assert.equal(input[1].content[1].type, 'input_file');
  assert.equal(input[1].content[1].filename, 'water-analysis.pdf');
});

test('normalizes structured replies, attachment proof, and quick replies', () => {
  const result = normalizeChatResult({ reply: 'Tell me the water analysis.', quickReplies: ['Available', 'Not sure', 'Pending', 'None', 'Extra'], readyForContact: false, replyType: 'question', attachmentSummary: 'The label shows a 30% active product.' }, { hasAttachment: true, questionCount: 1 });
  assert.equal(result.quickReplies.length, 4);
  assert.equal(result.attachmentAcknowledged, true);
  assert.match(result.attachmentSummary, /30%/);
});

test('enforces the three-question ceiling', () => {
  const result = normalizeChatResult({ reply: 'One more question?', quickReplies: ['Yes'], readyForContact: false, replyType: 'question' }, { questionCount: 3 });
  assert.equal(result.replyType, 'summary');
  assert.equal(result.readyForContact, true);
  assert.deepEqual(result.quickReplies, []);
});
