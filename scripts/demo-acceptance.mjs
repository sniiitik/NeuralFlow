import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import pg from 'pg';
import {client,demoModels,verifyArtifacts,features} from './demo-common.mjs';
if(!process.env.TEST_DATABASE_URL || !new URL(process.env.TEST_DATABASE_URL).pathname.endsWith('_test'))throw new Error('Acceptance mutations require an isolated TEST_DATABASE_URL ending in _test.');
const admin=await client(),models=await demoModels(admin);await verifyArtifacts(admin,models);
const v1=models.find(m=>m.version==='v1'),v2=models.find(m=>m.version==='v2');const familyId=v1.familyId;
const db=new pg.Client({connectionString:process.env.TEST_DATABASE_URL});await db.connect();
const evidence={familyId,versions:{v1:v1.id,v2:v2.id},checksums:true,requests:[],steps:[]};
async function predict(expected){const body=await admin.json('/api/inference/predict',{familyId,features});assert.ok(body.prediction&&body.probabilities&&body.requestId&&typeof body.inferenceMs==='number');if(expected)assert.equal(body.modelVersion,expected);evidence.requests.push(body.requestId);return body;}
async function create(strategy,trafficPercent){return (await admin.json('/api/deployments',{modelId:v1.id,fromVersion:'v1',toVersion:'v2',strategy,trafficPercent,idempotencyKey:randomUUID()})).deployment.id;}
async function action(id,operation){await admin.json(`/api/deployments/${id}/${operation}`);}
try{
 assert.equal((await db.query('SELECT id FROM "ModelVersion" WHERE id=$1 AND "familyId"=$2',[v1.id,familyId])).rowCount,1,"Gateway and TEST_DATABASE_URL must reference the same disposable registry.");
 await predict('v1');const canary=await create('canary',10);const counts={v1:0,v2:0};
 for(let i=0;i<300;i++){counts[(await predict()).modelVersion]++;if(i<299)await new Promise(r=>setTimeout(r,1000));if((i+1)%60===0)console.log(`Real canary requests completed: ${i+1}/300`);}
 assert.ok(counts.v2>=12&&counts.v2<=48,`Canary outside predeclared 4–16% tolerance: ${counts.v2}/300`);evidence.canary={requests:300,counts,tolerance:'candidate 12–48 of 300 (predeclared 4–16%)',concurrency:1,intervalMs:1000};
 await action(canary,'promote');for(let i=0;i<5;i++)await predict('v2');await action(canary,'rollback');for(let i=0;i<5;i++)await predict('v1');evidence.steps.push('canary promote v2 and rollback v1');
 const blue=await create('blue-green',0);await predict('v1');await action(blue,'promote');await predict('v2');await action(blue,'rollback');await predict('v1');evidence.steps.push('blue-green switch and rollback');
 const shadow=await create('shadow',100);for(let i=0;i<10;i++)await predict('v1');
 const rows=(await db.query('SELECT "versionId", prediction, status FROM "InferenceRequest" WHERE "deploymentId"=$1 AND role=\'shadow\'',[shadow])).rows;
 assert.equal(rows.filter(r=>r.status==='success'&&r.versionId===v2.id&&r.prediction).length,10);await action(shadow,'rollback');evidence.steps.push('10 real shadow executions; 10 stable v1 responses');
 const persisted=(await db.query('SELECT COUNT(*)::int AS n FROM "InferenceRequest" WHERE "requestId"=ANY($1::text[]) AND role<>\'shadow\' AND status=\'success\' AND source=\'user\'',[evidence.requests])).rows[0].n;
 assert.equal(persisted,evidence.requests.length);evidence.persistedPrimaryRequests=persisted;
 evidence.events=(await db.query('SELECT COUNT(*)::int AS n FROM "DeploymentEvent" WHERE "deploymentId"=ANY($1::text[])',[[canary,blue,shadow]])).rows[0].n;
 evidence.audit=(await db.query('SELECT COUNT(*)::int AS n FROM "AuditLog" WHERE "entityId"=ANY($1::text[])',[[canary,blue,shadow]])).rows[0].n;
 assert.ok(evidence.events>0&&evidence.audit>0);
 evidence.route=(await db.query('SELECT "activeVersionId","activeSlot","candidateVersionId" FROM "ServingRoute" WHERE "familyId"=$1',[familyId])).rows[0];assert.equal(evidence.route.activeVersionId,v1.id);
 await writeFile('var/demo/acceptance.json',JSON.stringify(evidence,null,2)+'\n');console.log(JSON.stringify({...evidence,requests:`${evidence.requests.length} unique request IDs retained in local evidence file`}));
}finally{await db.end();}
