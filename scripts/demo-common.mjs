import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
export const demoName = 'neuralflow-demo-iris';
export const demoOwner = 'NeuralFlow demo';
export function localUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.username || url.password) throw new Error('Demo commands require a local HTTP URL without embedded credentials.');
  return url;
}
export const base = localUrl(process.env.DEMO_BASE_URL ?? process.env.BETTER_AUTH_URL ?? 'http://localhost:3000');
export const sha = bytes => createHash('sha256').update(bytes).digest('hex');
export async function client() {
  const email = process.env.NEURALFLOW_ADMIN_EMAIL, password = process.env.NEURALFLOW_ADMIN_PASSWORD;
  if (!email || !password) throw new Error('Configure NEURALFLOW_ADMIN_EMAIL and NEURALFLOW_ADMIN_PASSWORD in .env.');
  const login = await fetch(new URL('/api/auth/sign-in/email', base), { method: 'POST', headers: {'Content-Type':'application/json', Origin:base.origin}, body:JSON.stringify({email,password}), signal:AbortSignal.timeout(15000) });
  if (!login.ok) throw new Error(`Administrator/operator authentication failed (HTTP ${login.status}); check local credentials and origin.`);
  const cookie = login.headers.getSetCookie().map(v=>v.split(';',1)[0]).join('; ');
  async function request(path, init={}) {
    const response = await fetch(new URL(path,base), {...init,headers:{Origin:base.origin,Cookie:cookie,...init.headers},signal:AbortSignal.timeout(45000)});
    if (!response.ok) throw new Error(`${path.split('?')[0]} failed (HTTP ${response.status}). Check the application and account permissions.`);
    return response;
  }
  const session=await (await request('/api/auth/get-session')).json();
  if (!['admin','operator'].includes(session?.user?.role)) throw new Error('The configured account must have administrator or operator access.');
  return {request,json:async(path,body,method='POST')=>(await request(path,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})).json()};
}
export async function demoModels(api) {
  const {models}=await (await api.request('/api/models')).json();
  return models.filter(m=>m.name===demoName);
}
export async function verifyArtifacts(api, models) {
  for(const version of ['v1','v2']) {
    const model=models.find(m=>m.version===version);
    if(!model || model.owner!==demoOwner || !model.artifactAvailable) throw new Error(`Demo ${version} is missing, has a different owner, or has no artifact. Run demo:setup.`);
    const bytes=Buffer.from(await (await api.request(`/api/models/${model.id}/artifact`)).arrayBuffer());
    const expected=sha(await readFile(new URL(`../inference/examples/iris-${version}.json`,import.meta.url)));
    if(sha(bytes)!==expected || model.artifactSha256!==expected) throw new Error(`Demo ${version} checksum differs from the reproducible Iris artifact; existing immutable data was preserved.`);
  }
}
export const features={sepal_length:5.1,sepal_width:3.5,petal_length:1.4,petal_width:0.2};
