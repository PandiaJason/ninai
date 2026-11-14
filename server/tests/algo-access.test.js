import {test} from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {createAlgoRouter} from '../routes/algo.js';

test('uses current database identity and refuses forged client identities and revoked accounts',async()=>{
 process.env.ALGO_INTEGRATION_EMAILS='cmo@example.com';let active='true',email='cmo@example.com',calls=[];
 const app=express();app.use(express.json());app.use('/api/algo',createAlgoRouter({
  authenticateToken:(req,res,next)=>{req.user={id:'saved-id',email:'forged@example.com',role:'admin'};next();},
  query:async(sql,params)=>{assert.deepEqual(params,['saved-id']);return {rows:[{id:'saved-id',email,active}]};},
  isRevoked:()=>false,callAlgo:async(actor,...args)=>{calls.push({actor,args});return {entries:[]};}
 }));
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 const base=`http://127.0.0.1:${server.address().port}/api/algo`;
 try {
  assert.equal((await fetch(base+'/users')).status,200);assert.equal(calls[0].actor,'cmo@example.com');
  const change={email:'learner@example.com',approved:true,reason:'Pilot',actor:'cmo@example.com'};
  assert.equal((await fetch(base+'/access',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(change)})).status,400);
  active='false';assert.equal((await fetch(base+'/users')).status,403);
  active='true';email='other@example.com';assert.equal((await fetch(base+'/users')).status,403);
  assert.equal(calls.length,1);
 } finally {await new Promise(resolve=>server.close(resolve));delete process.env.ALGO_INTEGRATION_EMAILS;}
});
