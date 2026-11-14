import {test} from 'node:test';
import assert from 'node:assert/strict';
import {algoSignature,callAlgo,integrationEmails} from '../integrations/algo-client.js';
const key='a'.repeat(64),actor='operator@example.com';
test('signature covers every authorization-relevant field',()=>{
 const sign=(method='GET',path='/api/integrations/ninai/users',body='')=>algoSignature(key,method,path,'1800000000','b'.repeat(32),actor,body);
 assert.equal(sign().length,64);assert.notEqual(sign(),sign('POST'));assert.notEqual(sign(),sign('GET','/api/integrations/ninai/users?page=2'));assert.notEqual(sign(),sign('GET',undefined,'{}'));
});
test('connection requires a server key and a permitted HTTPS origin',async()=>{
 await assert.rejects(callAlgo(actor,'GET','/test',undefined,{env:{}}),/not configured/);
 await assert.rejects(callAlgo(actor,'GET','/test',undefined,{env:{ALGO_NINAI_HMAC_KEY:key,ALGO_INTEGRATION_ORIGIN:'https://attacker.example'}}),/Invalid ALGO origin/);
});
test('signs a request server-side and never follows redirects',async()=>{
 let sent;
 const result=await callAlgo(actor,'POST','/api/integrations/ninai/users',{email:'learner@example.com',approved:true,reason:'Pilot'},{env:{ALGO_NINAI_HMAC_KEY:key},transport:async(url,options)=>{sent={url,...options};return new Response(JSON.stringify({entry:{approved:true}}),{status:200});}});
 assert.equal(result.entry.approved,true);assert.equal(sent.url,'https://algoskills.in/api/integrations/ninai/users');assert.equal(sent.redirect,'error');assert.equal(sent.headers['x-ninai-actor'],actor);
 assert.equal(sent.headers['x-ninai-signature'],algoSignature(key,'POST','/api/integrations/ninai/users',sent.headers['x-ninai-timestamp'],sent.headers['x-ninai-nonce'],actor,sent.body));
});
test('normalizes the explicit operator allowlist',()=>assert.deepEqual([...integrationEmails({ALGO_INTEGRATION_EMAILS:' CEO@example.com, cmo@example.com '})],['ceo@example.com','cmo@example.com']));
