import {createHash} from "node:crypto";
import {readFile} from "node:fs/promises";

export function paidSandboxProofSession(session,id){
  return session?.id===id && session.livemode===false &&
    session.mode==="payment" && session.status==="complete" &&
    session.payment_status==="paid" && session.currency==="usd" &&
    session.amount_total===15000 &&
    session.metadata?.productType==="packet-sandbox-simulation" &&
    session.metadata?.sandboxOnly==="true" &&
    session.metadata?.lobProof==="wood-conviction-v1";
}

export async function createPaidSandboxProof({sessionId,bank,auth,request=fetch,signedFixture=false}){
  const fixture=await readFile(new URL(signedFixture?"../assets/wood-signed-packet-TEST-ONLY.pdf":"../assets/lob-wood-two-form-TEST-ONLY.pdf",import.meta.url));
  const fields=new FormData();
  const values={
    bank_account:bank, amount:"100", message:"TEST ONLY - NO REAL PAYMENT",
    memo:"TEST ONLY", mail_type:"usps_first_class", use_type:"operational",
    "to[name]":"TEST COURT RECIPIENT","to[address_line1]":"One Courthouse Square",
    "to[address_city]":"Bowling Green","to[address_state]":"OH","to[address_zip]":"43402",
    "from[name]":"RecordPathAI TEST","from[address_line1]":"210 King St",
    "from[address_city]":"San Francisco","from[address_state]":"CA","from[address_zip]":"94107"
  };
  for(const [field,value] of Object.entries(values))fields.append(field,value);
  fields.append("attachment",new Blob([fixture],{type:"application/pdf"}),"wood-test-forms.pdf");
  const result=await request("https://api.lob.com/v1/checks",{
    method:"POST",headers:{Authorization:auth,
      "Idempotency-Key":createHash("sha256").update(sessionId).digest("hex")},
    body:fields,signal:AbortSignal.timeout(30000)
  });
  if(!result.ok)throw Error("Lob test proof creation failed");
  const check=await result.json();
  if(!/^chk_[A-Za-z0-9]+$/.test(check.id||""))throw Error("Invalid Lob test check");
  return check;
}
