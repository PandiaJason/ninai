import { apiRequest } from './api';
export interface AlgoAccount {
  email:string; name:string|null; username:string|null; role:string|null; approved:boolean;
  registeredAt:string|null; lastActiveAt:string|null; requestedAt:string|null;
  totalRuns:number; runs24h:number; lastRunAt:string|null;
}
export interface AlgoDirectory {entries:AlgoAccount[];page:number;hasMore:boolean;window:'rolling_24_hours'}
export function getAlgoAccounts(page:number,q:string,status:string) {
  return apiRequest<AlgoDirectory>(`/algo/users?${new URLSearchParams({page:String(page),q,status})}`);
}
export function setAlgoAccess(email:string,approved:boolean,reason:string) {
  return apiRequest<{entry:{email:string;approved:boolean}}>('/algo/access',{method:'POST',body:JSON.stringify({email,approved,reason})});
}
