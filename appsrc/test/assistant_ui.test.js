'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

// Exercise the actual form and close/session handlers with a controlled clock.
function assistantUI({reducedMotion=false}={}) {
  const ids=new Map(),timers=new Map();let now=0,nextTimer=0,checkSession;
  class Element {
    constructor(tag){this.tag=tag;this.children=[];this.events={};this.attrs={};this._text='';this.className='';this.clientHeight=400;this.scrollTop=0;this.classList={add:name=>this.className+=' '+name,remove:name=>this.className=this.className.split(' ').filter(x=>x!==name).join(' ')};}
    set id(id){this._id=id;ids.set(id,this);}get id(){return this._id;}
    set innerHTML(html){for(const match of html.matchAll(/id="([^"]+)"/g)){const child=new Element('div');child.id=match[1];this.appendChild(child);}}
    set textContent(text){this._text=String(text);this.children=[];}get textContent(){return this._text+this.children.map(x=>x.textContent).join('');}
    setAttribute(name,value){this.attrs[name]=value;}
    appendChild(child){child.parent=this;this.children.push(child);return child;}
    append(...children){children.forEach(child=>this.appendChild(child));}
    replaceChildren(...children){this._text='';this.children=[];this.append(...children);}
    remove(){if(this.parent)this.parent.children=this.parent.children.filter(child=>child!==this);}
    addEventListener(name,fn){this.events[name]=fn;}
    focus(){}reportValidity(){}
    get scrollHeight(){return Math.max(400,this.textContent.length);}
  }
  const document={body:new Element('body'),getElementById:id=>ids.get(id)||null,createElement:tag=>new Element(tag),createTextNode:text=>{const node=new Element('#text');node.textContent=text;return node;}};
  const answer='Aquí tienes información del artículo: café, herramientas y entrega. 👩🏽‍🔧 Consulta siempre su ficha antes de comprar.';
  const result={mode:'ai',answer,products:[{id:'p1',title:'Taladro',ref:'T1',price:42,deliveryEstimate:'24–72 h'}]};
  const context={document,AbortController,Intl,session:null,setTimeout:(fn,delay)=>{const id=++nextTimer;timers.set(id,{fn,at:now+delay});return id;},clearTimeout:id=>timers.delete(id),setInterval:fn=>{checkSession=fn;},fetch:async(url)=>({ok:true,json:async()=>url.endsWith('/status')?{aiConfigured:true}:result}),window:{matchMedia:()=>({matches:reducedMotion})}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../public/fvmarket-assistant-v1.js'),'utf8'),context);
  const flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
  const advance=async milliseconds=>{const end=now+milliseconds;while(true){const ready=[...timers].filter(([,timer])=>timer.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!ready)break;now=ready[1].at;timers.delete(ready[0]);ready[1].fn();await flush();}now=end;await flush();};
  const open=async()=>{await ids.get('fvmAssistantLauncher').events.click();};
  const ask=async()=>{ids.get('fvmAssistantQuestion').value='Taladro';ids.get('fvmAssistantForm').events.submit({preventDefault(){}});await flush();};
  const messages=()=>ids.get('fvmAssistantMessages');
  return {ids,answer,open,ask,advance,flush,context,checkSession:()=>checkSession(),messages,timers};
}

test('assistant writes progressively, then adds product details and enables the form',async()=>{
  const ui=assistantUI();await ui.open();await ui.ask();
  const reply=ui.messages().children.at(-1);
  assert(ui.answer.startsWith(reply.textContent));assert(reply.textContent.length<ui.answer.length);
  assert.equal(reply.attrs['aria-busy'],'true');assert.equal(reply.children.length,0);
  assert.equal(ui.ids.get('fvmAssistantSend').disabled,true);
  await ui.advance(48);assert(reply.textContent.length>2);assert(reply.textContent.length<ui.answer.length);
  await ui.advance(8000);
  assert(reply.textContent.startsWith(ui.answer));assert(reply.textContent.includes('Taladro'));
  assert.equal(reply.attrs['aria-busy'],'false');assert(!reply.className.includes('isTyping'));
  assert.equal(ui.ids.get('fvmAssistantSend').disabled,false);assert.equal(ui.timers.size,0);
});

test('closing during typing cancels the old answer and reopening starts a clean conversation',async()=>{
  const ui=assistantUI();await ui.open();await ui.ask();await ui.advance(48);
  ui.ids.get('fvmAssistantClose').events.click();await ui.flush();
  await ui.advance(8000);assert.equal(ui.messages().children.length,2);
  assert(!ui.messages().textContent.includes('Taladro'));assert.equal(ui.timers.size,0);
  await ui.open();await ui.ask();await ui.advance(8000);
  assert.equal(ui.messages().children.filter(node=>node.textContent.startsWith(ui.answer)).length,1);
});

test('changing the account while typing clears the reply and stops pending work',async()=>{
  const ui=assistantUI();await ui.open();await ui.ask();
  ui.context.session={token:'different-account'};ui.checkSession();await ui.flush();await ui.advance(8000);
  assert.equal(ui.messages().children.length,2);assert(!ui.messages().textContent.includes('Taladro'));
  assert.equal(ui.ids.get('fvmAssistantSend').disabled,false);assert.equal(ui.timers.size,0);
});

test('reduced motion presents the complete accessible answer immediately',async()=>{
  const ui=assistantUI({reducedMotion:true});await ui.open();await ui.ask();
  assert(ui.messages().children.at(-1).textContent.startsWith(ui.answer));
  assert.equal(ui.ids.get('fvmAssistantSend').disabled,false);assert.equal(ui.timers.size,0);
});
