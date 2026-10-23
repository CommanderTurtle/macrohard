import { expect, test } from "bun:test";
import { cloneEnv, initialEnv, parseEnv, serializeEnv } from "../src/environment";
import { commands, controlConfig, importDocument, registryDocument, replaceCommand, projectLayout } from "../src/workflow";
import { mkdirSync,writeFileSync,unlinkSync } from "node:fs";
import { endpoint, request } from "../src/api";

test("environment retains modern aliases, unset stored values, unknown fields and literal escapes",()=>{
  const input=serializeEnv(initialEnv)+'ShellAliasP=zsh\nShellAliasT=SUPER+ENTER\nCursorCoordinatesVisible=0\nPoint1Set=0\nPoint1=1200,700\nZoneZSet=0\nZoneZ=0,0,100,100\nFutureField=keep\\nline\\\\n\n';
  const env=parseEnv(input),round=parseEnv(serializeEnv(env));
  expect(env.points['1'].set).toBe(false);expect(env.zones.Z.set).toBe(false);expect(env.shellAliases.P).toBe('zsh');
  expect(env.toggles.cursorCoordinatesVisible).toBe(false);expect(round).toEqual(env);expect(serializeEnv(round)).toBe(serializeEnv(env));
});
test("balanced command graph respects nested literal JSON, multiline and exact source spans",()=>{
  const text='{set cbuf {\n"inner": {"a": 1}, "literal": "{wait 3}"\n}}\n{wait 200}{press Shift &amp; 3}';
  const result=commands(text);expect(result.errors).toEqual([]);expect(result.items.map(t=>t.op)).toEqual(['set','wait','press']);
  expect(replaceCommand(text,result.items[1],'{wait 500}')).toBe(text.replace('{wait 200}','{wait 500}'));
  for(const bad of ['{type broken','{else}','{if A empty}{type hi}','{type hi}}','outside'])expect(commands(bad).errors.length).toBeGreaterThan(0);
});

test("modern capture and shell syntax stays literal and invalid shell selectors fail cleanly",()=>{
  const source='{screen}{zone Z,S}{zone V,V}{zone Z,X}{zone Z,C}{zonebuf Z,C,V}{shell P}{type {shell type}}';
  expect(commands(source).errors).toEqual([]);
  for(const invalid of ['{shell type}','{screen unwanted}']) expect(commands(invalid).errors.length).toBeGreaterThan(0);
  expect(importDocument(source).script).toBe(source);
  const env=cloneEnv(initialEnv);env.shellAliases.P='type';expect(()=>controlConfig(env)).toThrow('shell starter');
  env.shellAliases.P='my-powershell --profile';expect(controlConfig(env).shells.P).toBe('my-powershell --profile');
  env.shellAliases.P='';expect(controlConfig(env).shells.P).toBe('');
});
test("Regedited zones use actual zero-based inclusive line pointers and roundtrip complete state",()=>{
  const env=cloneEnv(initialEnv);env.script='{set cbuf {\n"x": {}\n}}\n{wait 0}\n{type literal\\n}';env.vars.A='a\nb';
  const doc=registryDocument(env,17),rows=doc.split('\n'),words=rows[2].split(' : ');
  expect(rows[0]).toBe('regedited open');expect(rows[1]).toBe('index: 17');expect(words).toHaveLength(6);
  const zone=(n:number)=>rows.slice(parseInt(words[n*2].slice(2),16),parseInt(words[n*2+1].slice(2),16)+1).join('\n');
  expect(zone(0)).toBe(env.script);expect(zone(1)).toBe(serializeEnv(env));expect(JSON.parse(zone(2)).environment).toEqual(env);
  expect(importDocument(doc)).toEqual(env);expect(importDocument(JSON.stringify({format:'macrohard',version:1,environment:env}))).toEqual(env);
  const layout={'step-0':{x:-123,y:456}};
  expect(projectLayout(registryDocument(env,1,layout))).toEqual(layout);
  expect(projectLayout(JSON.stringify({format:'macrohard',version:1,environment:env,layout}))).toEqual(layout);
  expect(()=>projectLayout('{"layout":{"step-0":{"x":"bad","y":0}}}')).toThrow('position');
  expect(importDocument('{type script only}',env).vars).toEqual(env.vars);
  env.script='{type regedited open}';expect(()=>registryDocument(env)).toThrow('reserves');
});
test.skipIf(!Bun.which('rgd'))("generated zones are readable by the installed rgd CLI",()=>{
  const env=cloneEnv(initialEnv);env.script='{type 日本語 {nested}}\n{wait 200}\n{type literal\\n}';
  mkdirSync('.work',{recursive:true});const file='.work/registry-codec-fixture.txt';writeFileSync(file,registryDocument(env,17));
  try{for(const [ref,expected] of [['i17z1',env.script],['i17z2',serializeEnv(env)]]){
    const result=Bun.spawnSync(['rgd','rg',file,ref]);expect(result.exitCode).toBe(0);expect(result.stdout.toString().trimEnd()).toBe(expected.trimEnd());
  }}finally{unlinkSync(file)}
});
test("board codes reach the overlay unchanged; source and literal content roundtrip unchanged",()=>{
  const env=cloneEnv(initialEnv);
  env.script='{set point a _a,_h}\n{point _aj,_h}\n{type _aj}\n{set cbuf {"cell":"_aj"}}';
  env.vars.A='_aj';env.pastes.Z='_a,_h';
  env.points['1']={set:true,value:'_a,_h'};env.points['16']={set:true,value:'-_AJ,2000'};
  env.zones.Z={set:true,value:'_a,0,_aj,_h'};env.zones.X={set:true,value:'a,p'};
  const before=JSON.stringify(env),conf=controlConfig(env);
  expect(conf.points['1']).toEqual(['_a','_h']);expect(conf.points['16']).toEqual(['-_AJ',2000]);
  expect(conf.zones.Z).toEqual(['_a',0,'_aj','_h']);expect(conf.zones.X).toEqual(['_a','_h','-_AJ',2000]);
  expect(conf.script).toBe(env.script);expect(conf.vars.A).toBe('_aj');expect(conf.buffers.Z).toBe('_a,_h');
  expect(commands(env.script).errors).toEqual([]);expect(JSON.stringify(env)).toBe(before);
  expect(parseEnv(serializeEnv(env))).toEqual(env);
  expect(importDocument(registryDocument(env))).toEqual(env);
  expect(importDocument(env.script,env).script).toBe(env.script);
  for(const value of ['_,0','_1,0','_zzzz,0','_a;exit,0','_a,','0,Infinity']){
    env.points['1'].value=value;expect(()=>controlConfig(env)).toThrow();
  }
});

test("overlay requests preserve physical coordinates, resolve point-pair zones and reject cycles",()=>{
  const env=cloneEnv(initialEnv);env.points['1']={set:true,value:'1736,1146'};env.points['2']={set:true,value:'2000,1800'};env.zones.Z={set:true,value:'1,2'};env.zones.X={set:true,value:'Z'};
  const conf=controlConfig(env);expect(conf.points['1']).toEqual([1736,1146]);expect(conf.zones.X).toEqual([1736,1146,2000,1800]);expect(conf.shells.P).toBe('pwsh');
  env.zones.Z.value='X';expect(()=>controlConfig(env)).toThrow('Cyclic');
});
test("HTTP client sends explicit tokens, disables cookies/redirects, unwraps both APIs and never retries failures",async()=>{
  const original=globalThis.fetch,seen:any[]=[];
  globalThis.fetch=(async(url:any,init:any)=>{seen.push({url,init});return new Response(JSON.stringify(init.headers['X-Tasket-Key']?{success:true,data:{tasks:[]}}:{ok:true,result:{ready:true}}))}) as typeof fetch;
  try{
    expect(await request({url:'http://localhost:7778',token:'test-key'},'/v1/health')).toEqual({ready:true});
    await request({url:'http://localhost:7777',token:'task-key',backend:true},'/run',{task:'test'});
    expect(seen[0].init.headers.Authorization).toBe('Bearer test-key');expect(seen[1].init.headers['X-Tasket-Key']).toBe('task-key');
    expect(seen[1].init.credentials).toBe('omit');expect(seen[1].init.redirect).toBe('error');expect(seen[1].init.method).toBe('POST');
    globalThis.fetch=(async()=>new Response(JSON.stringify({ok:false,error:{message:'busy'}}),{status:409})) as typeof fetch;
    await expect(request({url:'http://localhost:7778',token:'key'},'/v1/control',{})).rejects.toThrow('409');
    expect(()=>endpoint('https://user:pass@example.com','/v1/health')).toThrow('without credentials');
  }finally{globalThis.fetch=original}
});
