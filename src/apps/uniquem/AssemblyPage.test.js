import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import AssemblyPage from './AssemblyPage';
import { postJson } from '../../lib/api';
jest.mock('../../lib/api',()=>({postJson:jest.fn()}));
const items=[{productId:'out',item:'Finished',active:true,quantityOnHand:0,unitOfMeasure:'Liters',lastAssemblyComponents:[{productId:'a',percentage:10},{productId:'b',percentage:90}]},{productId:'a',item:'A',active:true,quantityOnHand:500,unitOfMeasure:'Liters'},{productId:'b',item:'B',active:true,quantityOnHand:1000,unitOfMeasure:'Liters'}];
beforeEach(()=>{postJson.mockReset();postJson.mockResolvedValue({items,builds:[],nextHistoryCursor:null});});
test('prefills last build percentages and posts without recipes',async()=>{
  render(<AssemblyPage/>); await screen.findAllByRole('option',{name:/Finished/});
  fireEvent.change(screen.getByLabelText('Finished item'),{target:{value:'out'}});
  await waitFor(()=>expect(screen.getByLabelText('Component 1 percentage').value).toBe('10'));
  fireEvent.change(screen.getByLabelText('Finished quantity'),{target:{value:'100'}});
  fireEvent.click(screen.getByRole('button',{name:'Post build'}));
  await waitFor(()=>expect(postJson).toHaveBeenCalledWith('postUniquemAssemblyBuild',expect.objectContaining({outputProductId:'out',outputQuantity:100,components:[{productId:'a',percentage:10},{productId:'b',percentage:90}]}),{authed:true}));
  expect(screen.queryByText(/recipe/i)).toBeNull();
});
test('blocks totals that are not 100 percent',async()=>{
  render(<AssemblyPage/>); await screen.findAllByRole('option',{name:/Finished/}); fireEvent.change(screen.getByLabelText('Finished item'),{target:{value:'out'}});
  await waitFor(()=>expect(screen.getByLabelText('Component 1 percentage').value).toBe('10'));
  fireEvent.change(screen.getByLabelText('Component 1 percentage'),{target:{value:'9'}});
  expect(screen.getByRole('alert').textContent).toContain('exactly 100%'); expect(screen.getByRole('button',{name:'Post build'}).disabled).toBe(true);
});
