import {readFile,writeFile,chmod} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
let content;try{content=await readFile('.env','utf8');}catch(error){if(error.code!=='ENOENT')throw error;content=await readFile('.env.example','utf8');}
for(const [key,value] of Object.entries({INFERENCE_RUNTIME_TOKEN:randomBytes(32).toString('hex'),BETTER_AUTH_SECRET:randomBytes(32).toString('hex'),NEURALFLOW_ADMIN_EMAIL:'admin@example.test',NEURALFLOW_ADMIN_PASSWORD:randomBytes(24).toString('base64url')})){
 const expression=new RegExp(`^${key}=.*$`,'m');const existing=content.match(expression)?.[0];
 if(!existing)content+=`\n${key}="${value}"\n`;
 else if(existing.includes('replace-with-')||new RegExp(`^${key}=["']?["']?$`).test(existing))content=content.replace(expression,`${key}="${value}"`);
}
await writeFile('.env',content,{mode:0o600});await chmod('.env',0o600);console.log('Local .env prepared. Existing configured values preserved. Credentials are not printed; inspect .env privately.');
