import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {client,demoName,demoOwner,demoModels,verifyArtifacts} from './demo-common.mjs';
try {
 const api=await client();let models=await demoModels(api);
 if(models.some(m=>m.owner!==demoOwner))throw new Error('Reserved demo family already belongs to another owner. No changes made.');
 for(const version of ['v1','v2'])if(!models.some(m=>m.version===version)){
  const form=new FormData();form.set('name',demoName);form.set('version',version);form.set('framework','sklearn');form.set('owner',demoOwner);form.set('description','Reproducible Iris demo · immutable logistic regression versions');form.set('artifact',new Blob([await readFile(new URL(`../inference/examples/iris-${version}.json`,import.meta.url))],{type:'application/json'}),`iris-${version}.json`);
  await api.request('/api/models',{method:'POST',body:form});console.log(`Registered demo ${version}.`);
 }
 models=await demoModels(api);await verifyArtifacts(api,models);
 const v1=models.find(m=>m.version==='v1');
 const {deployments}=await (await api.request('/api/inference/deployments')).json();
 const route=deployments.find(d=>d.familyId===v1.familyId);
 if(!route){await api.json('/api/inference/deployments',{versionId:v1.id});console.log('Activated demo v1.');}
 else console.log(`Existing demo serving route preserved (${route.version}). Use the deployment UI to finish or roll back any active rollout.`);
 await mkdir('var/demo',{recursive:true});await writeFile('var/demo/state.json',JSON.stringify({familyId:v1.familyId,name:demoName,versions:Object.fromEntries(models.map(m=>[m.version,m.id]))},null,2)+'\n',{mode:0o600});
 console.log('Demo models and both SHA-256 checksums verified. Run npm run demo:check.');
}catch(error){console.error(error instanceof Error ? error.message : "Demo setup failed.");console.error('Demo setup failed. Check local services, administrator credentials, and reserved demo family ownership/artifact integrity. Existing resources were not reset.');process.exitCode=1;}
