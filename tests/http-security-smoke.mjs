import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:net";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

async function freePort() {
 return await new Promise((resolve,reject)=>{
  const server=createServer().listen(0,"127.0.0.1",()=>{
   const port=server.address().port;
   server.close(()=>resolve(port));
  });
  server.once("error",reject);
 });
}

test("Real HTTP server refuses anonymous purchases, browser-confirmed unlocks and unsafe PDFs",async()=>{
 const port=await freePort();
 let output="";
 const app=spawn(process.execPath,["server.js"],{
  cwd:process.cwd(),
  env:{...process.env,PORT:String(port),STRIPE_SECRET_KEY:"",RECORDWATCH_DISABLE_SCHEDULER:"true"},
  stdio:["ignore","pipe","pipe"]
 });
 app.stdout.on("data",v=>{output+=String(v)});
 app.stderr.on("data",v=>{output+=String(v)});
 try {
  let ready=false;
  for(let i=0;i<45;i++){
   if(app.exitCode!==null)throw Error("Application exited: "+output.slice(-1100));
   try {
    const r=await fetch("http://127.0.0.1:"+port+"/health");
    if(r.ok){ready=true;break}
   }catch{}
   await delay(200);
  }
  assert(ready,"Server failed to start: "+output.slice(-1100));
  const root="http://127.0.0.1:"+port;
  const requests=[
   {url:"/api/create-checkout-session",method:"POST",body:{amount:1,currency:"usd"}},
   {url:"/api/packet/verify-payment",method:"POST",body:{session_id:"cs_test_example"}},
   {url:"/api/ledger/packet-purchase",method:"POST",body:{payment_confirmed:true}},
   {url:"/api/ledger/recordwatch-subscription",method:"POST",body:{payment_confirmed:true,amount_cents:1}},
   {url:"/api/recordwatch/verify-checkout",method:"POST",body:{session_id:"cs_test_example"}}
  ];
  for(const request of requests){
   const r=await fetch(root+request.url,{
    method:request.method,headers:{"Content-Type":"application/json"},body:JSON.stringify(request.body)
   });
   assert.equal(r.status,401,request.url);
  }
  for(const path of ["/server.js","/package.json","/.env","/src/payment-security.js","/tools/build-global-public.cjs"]){
   const r=await fetch(root+path);assert.equal(r.status,404,path);
  }
  for(const source of [
   "http://169.254.169.254/latest/meta-data",
   "https://court.example.com/private.pdf",
   "https://127.0.0.1/a.pdf"
  ]){
   const r=await fetch(root+"/api/fetch-pdf?url="+encodeURIComponent(source));
   assert.equal(r.status,400,source);
  }
  const home=await fetch(root+"/");
  assert.equal(home.status,200);
  assert.match(await home.text(),/RecordPathAI/);
 }finally{
  app.kill("SIGTERM");
  await delay(100);
  if(app.exitCode===null)app.kill("SIGKILL");
 }
});
