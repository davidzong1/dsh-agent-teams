import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { apply } from '../lib/index.js'
import { createTeamDir, readTeam, writeTeam } from '../lib/state.js'

async function fixture(t) {
  const workspace = await mkdtemp(join(tmpdir(), 'teams-emergency-http-'))
  const root = join(workspace, '.agent-teams')
  await createTeamDir(root, {
    id:'team', name:'Team', captainSessionId:'captain', createdAt:1, taskSeq:0,
    members:[{id:'worker-session', name:'worker', provider:'primary', model:'original', joinedAt:1, status:'working'}], tasks:[],
  })
  const captain = {id:'captain', session:{header:{cwd:workspace}}}
  const routes = new Map(), disposers = []
  const ctx = {
    logger:{warn() {}, debug() {}},
    agents:{get:id => id === captain.id ? captain : undefined, list:()=>[]},
    llm:{
      async resolveCallConfig(route) {
        if(route.provider !== 'backup') throw new Error('unknown provider')
        return route
      },
      async listModels() {return [{id:'safe', name:'Safe'}]},
    },
    tools:{register() {}}, systemPrompt:{section() {}},
    subagents:{registerContinuableSetup() {}, async followup() {}, async start() {}, async startContinuable() {}},
    effect(fn) { const dispose = fn(); if(typeof dispose === 'function') disposers.push(dispose); return dispose },
    on() {return () => {}},
    get(key) {
      if(key === 'webServer') return {register(route) {routes.set(route.path, route); return () => routes.delete(route.path)}}
      if(key === 'workspaceRegistry') return {}
      if(key === 'connection') return {requestRejection:req => req.headers['x-test-auth'] === 'yes' ? undefined : 401}
    },
  }
  apply(ctx,{slashCommand:false})
  const server = createServer((req,res) => {
    const route=routes.get(req.url)
    if(!route) {res.writeHead(404); res.end(); return}
    Promise.resolve(route.handler(req,res)).catch(error=>{res.writeHead(500);res.end(String(error))})
  })
  server.listen(0,'127.0.0.1')
  await once(server,'listening')
  t.after(async()=>{
    for(const dispose of disposers.reverse()) await dispose()
    server.closeAllConnections()
    await new Promise(resolve=>server.close(resolve))
    await rm(workspace,{recursive:true,force:true})
  })
  const url=`http://127.0.0.1:${server.address().port}/plugins/dsh-agent-teams/member-emergency`
  const payload={sessionId:'captain',teamId:'team',memberId:'worker-session',memberName:'worker',emergencyFallback:{provider:'backup',model:'safe'}}
  return {ctx,root,routes,payload,server,
    state:()=>readTeam(root,'team'),
    post:(value=payload,auth=true)=>fetch(url,{method:'POST',headers:{'content-type':'application/json',...auth?{'x-test-auth':'yes'}:{}},body:JSON.stringify(value)}),
    get:()=>fetch(url,{headers:{'x-test-auth':'yes'}}),
  }
}

test('real plugin route saves and clears a running member emergency model without changing its primary route',async t=>{
  const h=await fixture(t)
  assert.equal((await h.get()).status,405)
  assert.equal((await h.post(h.payload,false)).status,401)
  assert.equal((await h.state()).members[0].emergencyFallback,undefined)
  const saved=await h.post()
  assert.equal(saved.status,200)
  assert.deepEqual(await saved.json(),{emergencyFallback:h.payload.emergencyFallback})
  const member=(await h.state()).members[0]
  assert.deepEqual(member.emergencyFallback,h.payload.emergencyFallback)
  assert.equal(member.model,'original')
  assert.equal(member.activeModel,undefined)
  const cleared=await h.post({...h.payload,emergencyFallback:null})
  assert.equal(cleared.status,200)
  assert.deepEqual(await cleared.json(),{emergencyFallback:null})
  assert.equal((await h.state()).members[0].emergencyFallback,undefined)
})

test('route rejects invalid models and foreign, removed or stopped members',async t=>{
  const h=await fixture(t)
  for(const [patch,status] of [
    [{emergencyFallback:[]},400], [{emergencyFallback:{provider:'backup',model:'typo'}},400],
    [{emergencyFallback:{provider:'unknown',model:'safe'}},400], [{memberId:'replaced'},409],
    [{teamId:'foreign'},404], [{sessionId:'offline'},409],
    [{emergencyFallback:{provider:'primary',model:'original'}},400],
  ]) assert.equal((await h.post({...h.payload,...patch})).status,status,JSON.stringify(patch))
  const team=await h.state()
  team.members[0].stopping=true
  await writeTeam(h.root,team)
  assert.equal((await h.post()).status,409)
  team.members[0].stopping=false
  team.members[0].status='removed'
  await writeTeam(h.root,team)
  assert.equal((await h.post()).status,409)
  team.members[0].status='idle'
  team.halted=true
  await writeTeam(h.root,team)
  assert.equal((await h.post()).status,409)
})

test('model validation finishing after member replacement cannot modify the new member',async t=>{
  const h=await fixture(t)
  let release, entered
  const ready=new Promise(resolve=>{entered=resolve})
  h.ctx.llm.resolveCallConfig=async route=>{entered();await new Promise(resolve=>{release=resolve});return route}
  const saving=h.post()
  await ready
  const team=await h.state()
  team.members[0].id='new-session'
  await writeTeam(h.root,team)
  release()
  assert.equal((await saving).status,409)
  assert.equal((await h.state()).members[0].emergencyFallback,undefined)
})
