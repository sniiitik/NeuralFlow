import pg from 'pg';
import {readFile,readdir} from 'node:fs/promises';
import {client,demoModels,verifyArtifacts,localUrl,features} from './demo-common.mjs';
import {createHash} from 'node:crypto';
let failed=false;
async function check(name,fn){try{await fn();console.log(`PASS ${name}`);}catch(error){failed=true;console.error(`FIX ${name}: ${error instanceof Error ? error.message : 'check failed'}`);}}
await check('PostgreSQL and migration history',async()=>{
 const db=new pg.Client({connectionString:process.env.DATABASE_URL});try{
  try{await db.connect();}catch{throw new Error('PostgreSQL unreachable; start postgres and check DATABASE_URL privately.');}
  const {rows}=await db.query('SELECT migration_name, checksum, finished_at, rolled_back_at FROM _prisma_migrations');
  for(const entry of await readdir('prisma/migrations',{withFileTypes:true}))if(entry.isDirectory()){
   const checksum=createHash('sha256').update(await readFile(`prisma/migrations/${entry.name}/migration.sql`)).digest('hex');
   if(!rows.some(r=>r.migration_name===entry.name&&r.finished_at&&!r.rolled_back_at&&r.checksum===checksum))throw new Error(`Migration ${entry.name} is missing or differs. Follow docs/migrations.md.`);
  }
 }finally{await db.end();}
});
for(const [slot,key,fallback]of [['blue','INFERENCE_RUNTIME_URL','http://127.0.0.1:8001'],['green','INFERENCE_RUNTIME_GREEN_URL','http://127.0.0.1:8002']])await check(`${slot} runtime readiness`,async()=>{
 const url=localUrl(process.env[key]??fallback);const response=await fetch(new URL('/readyz',url),{headers:{'X-NeuralFlow-Runtime-Token':process.env.INFERENCE_RUNTIME_TOKEN??''},signal:AbortSignal.timeout(5000)});if(!response.ok)throw new Error('Runtime readiness failed; check app profile and internal credential.');
});
await check('Authenticated application, demo artifacts, serving route and telemetry',async()=>{
 const admin=await client();const models=await demoModels(admin);await verifyArtifacts(admin,models);
 const result=await admin.json('/api/inference/predict',{familyId:models[0].familyId,features});
 if(!result.requestId||!['v1','v2'].includes(result.modelVersion)||!result.prediction||!result.probabilities||typeof result.inferenceMs!=='number')throw new Error('Serving route did not return a valid demo prediction.');
 const db=new pg.Client({connectionString:process.env.DATABASE_URL});try{await db.connect();const row=await db.query('SELECT 1 FROM \"InferenceRequest\" WHERE \"requestId\"=$1 AND source=\'user\' AND status=\'success\' LIMIT 1',[result.requestId]);if(!row.rowCount)throw new Error('Authenticated prediction was not persisted.');}finally{await db.end();}
});
console.log(failed?'NOT READY — fix the items above.':'READY — local demo prerequisites verified.');if(failed)process.exitCode=1;
