import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import QuoteChem, { buildQuestions, ISSUES, NEEDS } from './QuoteChem';
import { postJson } from '../../lib/api';

jest.mock('../../firebase', () => ({ auth: { currentUser: null } }));
jest.mock('../../lib/api', () => ({ postJson: jest.fn() }));

function renderQuoteChem() {
  return render(
    <MemoryRouter initialEntries={['/apps/quotechem']}>
      <Routes>
        <Route path="/apps/quotechem" element={<QuoteChem key="guided" />} />
        <Route path="/apps/quotechem/chat" element={<QuoteChem key="chat" />} />
      </Routes>
    </MemoryRouter>,
  );
}

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
    renderQuoteChem();
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

  test('sizes the standalone page to the keyboard viewport and clears it after blur', async () => {
    const listeners = {};
    const viewport = {
      height: 700,
      offsetTop: 0,
      addEventListener: jest.fn((name, callback) => { listeners[name] = callback; }),
      removeEventListener: jest.fn(),
    };
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: viewport });
    renderQuoteChem();
    fireEvent.click(screen.getByRole('button', { name: /Drilling Chemical/i }));
    const composer = screen.getByPlaceholderText('Message QuoteChem…');
    fireEvent.focus(composer);
    viewport.height = 390;
    viewport.offsetTop = 118;
    listeners.resize();
    expect(document.documentElement.style.getPropertyValue('--qc-keyboard-height')).toBe('');
    await waitFor(() => expect(document.documentElement.style.getPropertyValue('--qc-keyboard-height')).toBe('390px'));
    expect(document.documentElement.style.getPropertyValue('--qc-keyboard-top')).toBe('118px');
    fireEvent.blur(composer);
    await waitFor(() => expect(document.documentElement.style.getPropertyValue('--qc-keyboard-height')).toBe(''));
    expect(document.documentElement.style.getPropertyValue('--qc-keyboard-top')).toBe('');
    delete window.visualViewport;
  });
});
