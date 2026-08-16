import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import QuoteChem, { buildQuestions, ISSUES, NEEDS } from './QuoteChem';
import { postJson } from '../../lib/api';

jest.mock('../../firebase', () => ({ auth: { currentUser: null } }));
jest.mock('../../lib/api', () => ({ postJson: jest.fn() }));

describe('QuoteChem conversation definitions', () => {
  test('offers every planned entry path', () => {
    expect(NEEDS.map((need) => need.id)).toEqual(['production', 'drilling', 'completion', 'supplier', 'pricing', 'exact']);
  });

  test('offers the full production issue set', () => {
    expect(ISSUES.map((issue) => issue.id)).toEqual(['corrosion', 'scale', 'h2s', 'emulsion', 'wax', 'foaming', 'bacteria', 'flow', 'other']);
  });

  test('gives scale a tailored qualification sequence and common logistics', () => {
    const ids = buildQuestions('production', 'scale').map((question) => question.id);
    expect(ids).toEqual(expect.arrayContaining(['scaleType', 'currentTreatment', 'conditions', 'quantity', 'location', 'timing']));
  });

  test.each(['drilling', 'completion', 'supplier', 'pricing', 'exact', 'describe'])('%s reaches logistics qualification', (need) => {
    const ids = buildQuestions(need).map((question) => question.id);
    expect(ids.slice(-3)).toEqual(['quantity', 'location', 'timing']);
  });

  test('guided context opens the real AI composer and sends a desktop message', async () => {
    postJson.mockResolvedValueOnce({ conversationId: 'conversation-1', reply: 'What mud system are you using?', quickReplies: ['Water based', 'Oil based'], readyForContact: false });
    render(<QuoteChem />);
    fireEvent.click(screen.getByRole('button', { name: /Drilling Chemical/i }));
    expect(screen.getByText('Drilling Chemical')).toBeTruthy();
    const composer = screen.getByPlaceholderText('Message QuoteChem…');
    fireEvent.change(composer, { target: { value: 'We have severe fluid loss.' } });
    fireEvent.keyDown(composer, { key: 'Enter', shiftKey: false });
    await waitFor(() => expect(postJson).toHaveBeenCalledWith('quotechemChat', expect.objectContaining({
      context: expect.objectContaining({ needLabel: 'Drilling Chemical' }),
      messageId: expect.any(String),
      conversationId: expect.any(String),
      text: 'We have severe fluid loss.',
    }), { authed: true }));
    expect(await screen.findByText('What mud system are you using?')).toBeTruthy();
  });
});
