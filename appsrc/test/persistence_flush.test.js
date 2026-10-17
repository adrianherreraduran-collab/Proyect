'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),Module=require('node:module'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
test('la confirmación espera también una escritura de Postgres que ya esté en curso',async()=>{
 let release;const gate=new Promise(resolve=>{release=resolve}),originalLoad=Module._load,oldUrl=process.env.DATABASE_URL;
 process.env.DATABASE_URL='postgres://isolated-fixture';
 Module._load=function(name,...args){if(name==='pg')return{Pool:class{async query(sql){if(sql.startsWith('INSERT'))await gate;return{rows:[]}}async end(){}}};return originalLoad.call(this,name,...args)};
 const persistence=require('../persistent_store_v17');Module._load=originalLoad;
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'fvm-durable-'));persistence.config(path.join(directory,'state.json'));
 try{
  assert.equal((await persistence.init()).enabled,true);persistence.persist({orders:[{id:'fixture'}]});
  const first=persistence.flush();let finished=false;const second=persistence.flush().then(()=>{finished=true});
  await Promise.resolve();await Promise.resolve();assert.equal(finished,false);release();await Promise.all([first,second]);assert.equal(finished,true);assert.equal(persistence.status().lastError,'');
 }finally{if(oldUrl===undefined)delete process.env.DATABASE_URL;else process.env.DATABASE_URL=oldUrl;fs.rmSync(directory,{recursive:true,force:true})}
});
