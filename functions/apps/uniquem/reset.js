import { onRequest } from 'firebase-functions/v2/https';
import { admin, db, storage } from '../../core/firebase.js';
import { REGION } from '../../core/http.js';
const marker=db.collection('uniquemSchema').doc('manual-inventory-v1');
const collections=['uniquemItems','uniquemItemImports','uniquemAssemblyReconciliations','uniquemAssemblyRecipes','uniquemAssemblyRecipeRevisions','uniquemAssemblyBuilds','uniquemStockAdjustments','uniquemInventoryLayouts','uniquemInventoryTextures'];
async function clear(name){let removed=0;for(;;){const snap=await db.collection(name).limit(400).get();if(snap.empty)return removed;const batch=db.batch();snap.docs.forEach(doc=>batch.delete(doc.ref));await batch.commit();removed+=snap.size;}}
export const resetUniquemManualInventory=onRequest({region:REGION},async(req,res)=>{if(req.method!=='POST'||req.body?.confirmation!=='manual-inventory-v1-945dd98')return res.status(403).json({ok:false});if((await marker.get()).exists)return res.json({ok:true,alreadyComplete:true});const removed={};for(const name of collections)removed[name]=await clear(name);await storage.bucket().deleteFiles({prefix:'uniquem/'});await marker.create({schema:'manual-inventory-v1',ready:true,resetAt:admin.firestore.FieldValue.serverTimestamp(),resetBy:'production-workflow'});return res.json({ok:true,removed});});
