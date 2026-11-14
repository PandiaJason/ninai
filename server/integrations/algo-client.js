import { createHash, createHmac, randomBytes } from 'node:crypto';

export function algoSignature(key, method, path, timestamp, nonce, actor, body) {
  const digest=createHash('sha256').update(body).digest('hex');
  return createHmac('sha256',key).update([method.toUpperCase(),path,timestamp,nonce,actor,digest].join('\n')).digest('hex');
}
export function integrationEmails(env=process.env) {
  return new Set((env.ALGO_INTEGRATION_EMAILS || '').split(',').map(email=>email.trim().toLowerCase()).filter(Boolean));
}
export async function callAlgo(actor, method, path, data, {env=process.env,transport=fetch}={}) {
  const key=env.ALGO_NINAI_HMAC_KEY;
  if(!/^[a-f0-9]{64}$/i.test(key || '')) throw Object.assign(Error('ALGO connection is not configured.'),{status:503});
  const origin=env.ALGO_INTEGRATION_ORIGIN || 'https://algoskills.in';
  const url=new URL(origin);
  if(url.origin!==origin || (url.origin!=='https://algoskills.in' && !(env.NODE_ENV==='development' && ['localhost','127.0.0.1'].includes(url.hostname)))) throw Object.assign(Error('Invalid ALGO origin configuration.'),{status:503});
  const body=data===undefined?'':JSON.stringify(data);
  const timestamp=String(Math.floor(Date.now()/1000)); const nonce=randomBytes(16).toString('hex');
  const signature=algoSignature(key,method,path,timestamp,nonce,actor,body);
  let response;
  try {
    response=await transport(url.origin+path,{method,redirect:'error',signal:AbortSignal.timeout(12000),headers:{'Content-Type':'application/json','x-ninai-actor':actor,'x-ninai-timestamp':timestamp,'x-ninai-nonce':nonce,'x-ninai-signature':signature},...(body?{body}:{})});
  } catch { throw Object.assign(Error('ALGO is temporarily unavailable. Please try again.'),{status:503}); }
  const result=await response.json().catch(()=>null);
  if(!response.ok) throw Object.assign(Error(result?.error || 'ALGO request was rejected.'),{status:response.status});
  return result;
}
