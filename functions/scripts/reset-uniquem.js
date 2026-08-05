import { GoogleAuth } from 'google-auth-library';

const project = process.env.GOOGLE_CLOUD_PROJECT || 'quotechemfb'; const bucket = 'quotechemfb.firebasestorage.app';
const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] }); const client = await auth.getClient(); const access = await client.getAccessToken();
const headers = { Authorization: `Bearer ${access.token}`, 'Content-Type': 'application/json' };
const base = `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents`;
const collections = ['uniquemItems','uniquemItemImports','uniquemAssemblyReconciliations','uniquemAssemblyRecipes','uniquemAssemblyRecipeRevisions','uniquemAssemblyBuilds','uniquemStockAdjustments','uniquemInventoryLayouts','uniquemInventoryTextures'];
async function request(url, options={}) { const response=await fetch(url,{...options,headers:{...headers,...options.headers}}); if(!response.ok&&response.status!==404) throw new Error(`${options.method||'GET'} ${url} failed: ${response.status} ${await response.text()}`); return response.status===404?null:response.json(); }
if (await request(`${base}/uniquemSchema/manual-inventory-v1`)) { process.stdout.write('Uniquem manual-inventory-v1 reset already completed.\n'); process.exit(0); }
for (const collection of collections) { let removed=0; for (;;) { const page=await request(`${base}/${collection}?pageSize=300`); const documents=page?.documents||[]; if(!documents.length)break; for(const doc of documents){await request(`https://firestore.googleapis.com/v1/${doc.name}`,{method:'DELETE'});removed+=1;} } process.stdout.write(`${collection}: ${removed} documents removed.\n`); }
for (;;) { const page=await request(`https://storage.googleapis.com/storage/v1/b/${bucket}/o?prefix=${encodeURIComponent('uniquem/')}`); const objects=page?.items||[]; if(!objects.length)break; for(const object of objects) await request(`https://storage.googleapis.com/storage/v1/b/${bucket}/o/${encodeURIComponent(object.name)}`,{method:'DELETE'}); }
await request(`${base}/uniquemSchema/manual-inventory-v1`,{method:'PATCH',body:JSON.stringify({fields:{schema:{stringValue:'manual-inventory-v1'},ready:{booleanValue:true},resetBy:{stringValue:'production-workflow'},resetAt:{timestampValue:new Date().toISOString()}}})});
process.stdout.write('Uniquem manual-inventory-v1 readiness marker written.\n');
