import {readableSignedWoodFormText} from "../src/lob-sandbox-proof-audit.js";
import test from "node:test";
import assert from "node:assert/strict";
import {paidSandboxProofSession,createPaidSandboxProof} from "../src/paid-sandbox-proof.js";
import {getDocument} from "pdfjs-dist/legacy/build/pdf.mjs";
import {isWoodConvictionFormPair} from "../src/wood-form-pages.js";

const id="cs_test_abcdefghijklmnopqrstuvwxyz";
const session={id,livemode:false,mode:"payment",status:"complete",payment_status:"paid",
  currency:"usd",amount_total:15000,metadata:{productType:"packet-sandbox-simulation",
    sandboxOnly:"true",lobProof:"wood-conviction-v1"}};
test("only the settled test product and exact session can generate a proof",()=>{
  assert.equal(paidSandboxProofSession(session,id),true);
  for(const fields of [{livemode:true},{payment_status:"unpaid"},{amount_total:5000},
    {id:"different"},{status:"open"},{currency:"cad"},{metadata:{}}]){
    assert.equal(paidSandboxProofSession({...session,...fields},id),false);
  }
});
test("a paid test session has a repeatable Lob request with two ordered forms",async()=>{
  const keys=[];
  const request=async(url,options)=>{
    assert.equal(url,"https://api.lob.com/v1/checks");
    keys.push(options.headers["Idempotency-Key"]);
    assert.equal(options.body.get("amount"),"100");
    const data=new Uint8Array(await options.body.get("attachment").arrayBuffer());
    const pdf=await getDocument({data,useSystemFonts:true}).promise;
    try{
      assert.equal(pdf.numPages,2);
      const texts=[];
      for(const i of [1,2]){
        const page=await pdf.getPage(i);
        texts.push((await page.getTextContent()).items.map(item=>item.str).join(""));
      }
      assert.ok(isWoodConvictionFormPair(texts));
    }finally{await pdf.destroy();}
    return Response.json({id:"chk_example"});
  };
  for(const sessionId of [id,id,id+"2"])
    await createPaidSandboxProof({sessionId,bank:"bank_test",auth:"test",request});
  assert.equal(keys[0],keys[1]);assert.notEqual(keys[0],keys[2]);
});
test("staging attaches the signed two-page sample rendered by the packet page",async()=>{
  const request=async(url,options)=>{
    const file=options.body.get("attachment");
    const pdf=await getDocument({data:new Uint8Array(await file.arrayBuffer()),useSystemFonts:true}).promise;
    try{
      assert.equal(pdf.numPages,2);
      const texts=[];
      for(const i of [1,2]){
        const page=await pdf.getPage(i);
        texts.push((await page.getTextContent()).items.map(item=>item.str).join(" "));
      }
      assert.ok(isWoodConvictionFormPair(texts));
      assert.ok(readableSignedWoodFormText(texts));
      assert.equal(readableSignedWoodFormText([texts[0],"Garbled deposit and sentence"]),false);
      assert.equal(readableSignedWoodFormText(["Garbled identifiers",texts[1]]),false);
      assert.match(texts.join(" "),/SAMPLE-2026/);
      assert.match(texts.join(" "),/NOT FOR FILING/i);
    }finally{await pdf.destroy();}
    return Response.json({id:"chk_example"});
  };
  await createPaidSandboxProof({sessionId:id,bank:"bank_test",auth:"test",request,signedFixture:true});
});
