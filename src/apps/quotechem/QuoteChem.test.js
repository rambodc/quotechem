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

beforeEach(() => {
  postJson.mockReset();
  postJson.mockResolvedValue({
    conversationId: 'c-1',
    reply: 'Tell me more.',
    quickReplies: [],
    readyForContact: false,
  });
});

describe('QuoteChem category flow', () => {
  test('defines a complete image-led category for every guided need', () => {
    expect(Object.keys(CATEGORY_CONFIG)).toEqual(NEEDS.map(({ id }) => id));
    expect(CATEGORY_CONFIG.production.items.map(({ title }) => title)).toEqual(expect.arrayContaining(['Corrosion', 'Produced-Water Treatment', 'Oxygen Scavenging', 'Other / Not sure']));
    expect(CATEGORY_CONFIG.drilling.items).toHaveLength(10);
    expect(CATEGORY_CONFIG.completion.items).toHaveLength(11);
    for (const need of ['supplier', 'pricing', 'exact']) expect(CATEGORY_CONFIG[need].items).toHaveLength(7);
  });

  test('subcategory selection opens chat and automatically submits both values once', async () => {
    renderQuoteChem();
    fireEvent.click(screen.getByRole('button', { name: /Drilling Chemical/i }));
    expect(screen.getByRole('heading', { name: /What drilling challenge/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Continue to technical conversation/i })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Fluid Loss/i }));
    expect(screen.getByPlaceholderText('Message QuoteChem…')).toBeTruthy();
    expect(screen.getByText(/Need: Drilling Chemical/)).toBeTruthy();
    await waitFor(() => expect(postJson).toHaveBeenCalledWith('quotechemChat', expect.objectContaining({
      context: expect.objectContaining({ needLabel: 'Drilling Chemical', subcategoryLabel: 'Fluid Loss' }),
      text: 'Need: Drilling Chemical\nCategory: Fluid Loss',
    }), { authed: true }));
    expect(postJson).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('Tell me more.')).toBeTruthy();
  });

  test('the open-description path enters an empty chat without auto submission', () => {
    renderQuoteChem();
    fireEvent.click(screen.getByRole('button', { name: /Just describe what you need/i }));
    expect(screen.getByPlaceholderText('Message QuoteChem…')).toBeTruthy();
    expect(postJson).not.toHaveBeenCalled();
  });

  test('the logo clears the flow and returns to the first step', () => {
    renderQuoteChem();
    fireEvent.click(screen.getByRole('button', { name: /Drilling Chemical/i }));
    fireEvent.click(screen.getByRole('button', { name: /Return to QuoteChem home/i }));
    expect(screen.getByRole('heading', { name: /What do you need help with/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Start over/i })).toBeNull();
  });
});
