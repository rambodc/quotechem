import { randomUUID } from 'node:crypto';
import { db } from '../../core/firebase.js';
import { COLLECTIONS as C, handler, id, now, qty, text } from './helpers.js';
import { workspace } from './workspace.js';

export function recipeInput(body = {}) {
  const outputProductId = id(body.outputProductId); const name = text(body.name, 160);
  const ingredients = (Array.isArray(body.ingredients) ? body.ingredients : []).map((item) => ({ productId: id(item.productId), amount: qty(item.amount, 'Ingredient amount') })).filter((item) => item.productId);
  if (!name || !outputProductId || !ingredients.length) throw Object.assign(new Error('Recipe name, output product, and ingredients are required.'), { status: 400 });
  return { name, outputProductId, ingredients, notes: text(body.notes, 1500) };
}

export const saveUniquemRecipe = handler(async (req, user) => {
  const recipeId = id(req.body?.recipeId) || randomUUID(); const ref = db.collection(C.recipes).doc(recipeId); const old = await ref.get();
  await ref.set({ recipeId, ...recipeInput(req.body), createdAt: old.exists ? old.data().createdAt || now() : now(), updatedAt: now(), updatedBy: user.uid });
  return { recipeId, ...(await workspace()) };
});

export const deleteUniquemRecipe = handler(async (req) => {
  const recipeId = id(req.body?.recipeId); const used = await db.collection(C.runs).where('recipeId', '==', recipeId).limit(1).get();
  if (!used.empty) throw Object.assign(new Error('This recipe is used by production history and cannot be deleted.'), { status: 409 });
  await db.collection(C.recipes).doc(recipeId).delete(); return workspace();
});
