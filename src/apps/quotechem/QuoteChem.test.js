import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import QuoteChem, { CATEGORY_CONFIG, NEEDS } from './QuoteChem';
import { postJson } from '../../lib/api';

jest.mock('../../firebase', () => ({ auth: { currentUser: { uid: 'staff-1' } } }));
jest.mock('../../lib/api', () => ({ postJson: jest.fn(() => Promise.resolve({ conversationId: 'c-1', reply: 'Tell me more.', quickReplies: [], readyForContact: false })) }));

function renderQuoteChem() {
  return render(<MemoryRouter initialEntries={['/apps/quotechem']}><Routes>
    <Route path="/apps/quotechem" element={<QuoteChem key="guided" />} />
    <Route path="/apps/quotechem/chat" element={<QuoteChem key="chat" />} />
  </Routes></MemoryRouter>);
}

describe('QuoteChem category flow', () => {
  test('defines a complete image-led category for every guided need', () => {
    expect(Object.keys(CATEGORY_CONFIG)).toEqual(NEEDS.map(({ id }) => id));
    expect(CATEGORY_CONFIG.production.items.map(({ title }) => title)).toEqual(expect.arrayContaining(['Corrosion', 'Produced-Water Treatment', 'Oxygen Scavenging', 'Other / Not sure']));
    expect(CATEGORY_CONFIG.drilling.items).toHaveLength(10);
    expect(CATEGORY_CONFIG.completion.items).toHaveLength(11);
    for (const need of ['supplier', 'pricing', 'exact']) expect(CATEGORY_CONFIG[need].items).toHaveLength(7);
  });

  test('requires a subcategory and carries both values in the first chat message', async () => {
    renderQuoteChem();
    fireEvent.click(screen.getByRole('button', { name: /Drilling Chemical/i }));
    expect(screen.getByRole('heading', { name: /What drilling challenge/i })).toBeTruthy();
    const continueButton = screen.getByRole('button', { name: /Continue to technical conversation/i });
    expect(continueButton.disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: /Fluid Loss/i }));
    expect(continueButton.disabled).toBe(false);
    fireEvent.click(continueButton);
    const composer = screen.getByPlaceholderText('Message QuoteChem…');
    expect(screen.queryByText(/Let’s qualify your requirement/i)).toBeNull();
    fireEvent.change(composer, { target: { value: 'We have severe losses.' } });
    fireEvent.keyDown(composer, { key: 'Enter', shiftKey: false });
    await waitFor(() => expect(postJson).toHaveBeenCalledWith('quotechemChat', expect.objectContaining({
      context: expect.objectContaining({ needLabel: 'Drilling Chemical', subcategoryLabel: 'Fluid Loss' }),
      text: expect.stringContaining('Drilling Chemical — Fluid Loss'),
    }), { authed: true }));
  });

  test('the open-description path still enters chat directly', () => {
    renderQuoteChem();
    fireEvent.click(screen.getByRole('button', { name: /Just describe what you need/i }));
    expect(screen.getByPlaceholderText('Message QuoteChem…')).toBeTruthy();
  });
});
