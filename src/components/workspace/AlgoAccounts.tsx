import { useState } from 'react';
import { Button, PageHeader } from '../ui/Misc';
import { getAlgoAccounts, setAlgoAccess, type AlgoAccount } from '../../services/algoAccounts';
import { useAsyncData } from './useAsyncData';
import { toErrorMessage } from '../../services/errors';

export function AlgoAccounts({onClose}:{onClose:()=>void}) {
  const [page,setPage]=useState(1),[query,setQuery]=useState(''),[filter,setFilter]=useState('all');
  const [draft,setDraft]=useState('');const [target,setTarget]=useState<AlgoAccount|null>(null);
  const [email,setEmail]=useState(''),[reason,setReason]=useState(''),[approved,setApproved]=useState(true);
  const [busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const {data,loading,error,reload}=useAsyncData(()=>getAlgoAccounts(page,query,filter),[page,query,filter]);
  const date=(value:string|null)=>value?new Date(value).toLocaleString():'No recorded activity';
  async function save(event:React.FormEvent) {
    event.preventDefault();setBusy(true);setMessage('');
    try {await setAlgoAccess(email,approved,reason);setMessage(`Access ${approved?'approved':'revoked'} for ${email}.`);setReason('');setTarget(null);await reload();}
    catch(error){setMessage(toErrorMessage(error));}finally{setBusy(false);}
  }
  return <div className="ws-module-inner">
    <PageHeader title="ALGO accounts" subtitle="Live access requests and learner usage from algoskills.in." actions={<Button onClick={onClose}>Close</Button>} />
    <p>Manage learner access here. Administrator roles and owner-only challenge locks remain controlled in ALGO. Activity is recorded usage, not a live-presence indicator.</p>
    <form className="ws-toolbar" onSubmit={event=>{event.preventDefault();setPage(1);setQuery(draft);}}>
      <input aria-label="Search ALGO accounts" placeholder="Email, name, or username" maxLength={100} value={draft} onChange={e=>setDraft(e.target.value)} />
      <select aria-label="Access filter" value={filter} onChange={e=>{setFilter(e.target.value);setPage(1);}}><option value="all">All accounts</option><option value="pending">Not approved</option><option value="approved">Approved</option><option value="registered">Registered</option></select>
      <Button type="submit" disabled={loading}>Search</Button><Button onClick={()=>void reload()} disabled={loading}>Refresh</Button>
    </form>
    {error && <p role="alert">{error}</p>}
    {loading && <p role="status">Loading ALGO accounts...</p>}
    {!loading && data?.entries.length===0 && <p>No matching accounts.</p>}
    <div className="ws-table-wrap"><table className="ws-table"><thead><tr><th>Learner</th><th>Access</th><th>Usage</th><th>Last active</th><th>Manage</th></tr></thead><tbody>
      {data?.entries.map(entry=><tr key={entry.email}><td><strong>{entry.name || entry.username || entry.email}</strong><br/>{entry.email}{entry.username && <><br/>@{entry.username}</>}</td>
        <td>{entry.approved?'Approved':'Not approved'}<br/>{entry.registeredAt?'Registered':'Has not signed in'}</td>
        <td>{entry.runs24h} runs in 24h<br/>{entry.totalRuns} total runs</td><td>{date(entry.lastActiveAt)}</td>
        <td><Button disabled={entry.role==='ADMIN'} onClick={()=>{setTarget(entry);setEmail(entry.email);setApproved(!entry.approved);setReason('');setMessage('');}}>Manage access</Button></td></tr>)}
    </tbody></table></div>
    <div className="ws-toolbar"><Button disabled={page===1 || loading} onClick={()=>setPage(page-1)}>Previous</Button><span>Page {page}</span><Button disabled={!data?.hasMore || loading} onClick={()=>setPage(page+1)}>Next</Button></div>
    <h3>{target?'Change learner access':'Approve or revoke by email'}</h3>
    <form onSubmit={event=>void save(event)} className="ws-form">
      <label>Google account email<input required type="email" maxLength={255} value={email} onChange={e=>setEmail(e.target.value)} /></label>
      <label>Decision<select value={approved?'approve':'revoke'} onChange={e=>setApproved(e.target.value==='approve')}><option value="approve">Approve learner access</option><option value="revoke">Revoke learner access</option></select></label>
      <label>Reason<textarea required maxLength={300} value={reason} onChange={e=>setReason(e.target.value)} /></label>
      <p>{approved?'This account can sign in and use the currently available challenges.':'This account will be refused future sign-ins and code execution. Existing submissions are preserved.'}</p>
      <Button type="submit" disabled={busy || !email.trim() || !reason.trim()} variant="primary">{busy?'Saving...':approved?'Approve access':'Revoke access'}</Button>
    </form>
    {message && <p role="status">{message}</p>}
  </div>;
}
