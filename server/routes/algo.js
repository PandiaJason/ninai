import express from 'express';
import rateLimit from 'express-rate-limit';
import { query as databaseQuery } from '../db.js';
import { authenticateToken as serverAuthentication } from '../middleware/auth.js';
import { isRevoked as accountRevoked } from './users.js';
import { callAlgo as signedCall, integrationEmails } from '../integrations/algo-client.js';

export function createAlgoRouter({query=databaseQuery,authenticateToken=serverAuthentication,isRevoked=accountRevoked,callAlgo=signedCall}={}) {
const router=express.Router();
router.use(authenticateToken);
router.use(rateLimit({windowMs:60000,limit:60,standardHeaders:'draft-8',legacyHeaders:false}));
// A local workspace role or an email supplied by the browser is never authority.
router.use(async(req,res,next)=>{
  res.set('Cache-Control','no-store');
  try {
    const result=await query("SELECT id,email,to_jsonb(users)->>'active' as active FROM users WHERE id=$1 LIMIT 1",[req.user.id]);
    const account=result.rows[0]; const email=String(account?.email || '').trim().toLowerCase();
    if(!account || account.active==='false' || isRevoked(email) || !integrationEmails().has(email)) return res.status(403).json({error:'Your shared account does not have ALGO management access.'});
    req.algoActor=email;next();
  } catch {res.status(503).json({error:'Could not verify ALGO management access.'});}
});
router.get('/users',async(req,res)=>{
  try {
    const params=new URLSearchParams();
    for(const key of Object.keys(req.query)) {
      if(!['page','q','status'].includes(key) || typeof req.query[key]!=='string') return res.status(400).json({error:'Invalid directory query.'});
      params.set(key,req.query[key]);
    }
    res.json(await callAlgo(req.algoActor,'GET',`/api/integrations/ninai/users${params.size?'?'+params:''}`));
  } catch(error){res.status(error.status || 503).json({error:error.message});}
});
router.post('/access',express.json({limit:'2kb'}),async(req,res)=>{
  const {email,approved,reason,...extra}=req.body || {};
  if(Object.keys(extra).length || typeof email!=='string' || email.length>255 || typeof approved!=='boolean' || typeof reason!=='string' || !reason.trim() || reason.length>300) return res.status(400).json({error:'Provide an email, approval decision, and reason.'});
  try {res.json(await callAlgo(req.algoActor,'POST','/api/integrations/ninai/users',{email:email.trim().toLowerCase(),approved,reason:reason.trim()}));}
  catch(error){res.status(error.status || 503).json({error:error.message});}
});
return router;
}
export default createAlgoRouter();
