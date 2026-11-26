const cloud = "https://recordpathai-790902013328.us-west1.run.app/api/packet/staging-lob-proof";
const stage = "https://ckrqmlnckhagskpumjbh.supabase.co";
const reply = (status:number, body:unknown) => Response.json(body, {
  status, headers:{"Cache-Control":"private, no-store"}
});
Deno.serve(async request => {
  if(request.method !== "POST") return reply(405,{error:"POST required."});
  try {
    if(Deno.env.get("SUPABASE_URL")!==stage) return reply(503,{error:"Staging only."});
    const {session_id,action}=await request.json();
    if(typeof session_id!=="string" || !/^cs_test_[A-Za-z0-9]{16,180}$/.test(session_id))
      return reply(400,{error:"Invalid test session."});
    const token=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const headers={apikey:token,Authorization:"Bearer "+token,"Content-Type":"application/json"};
    const rowUrl=stage+"/rest/v1/packet_sandbox_paid_holds?stripe_session_id=eq."+session_id+
      "&status=eq.paid_hold&amount_total_cents=eq.15000&court_fee_cents=eq.10000&payment_method=eq.lob_check";
    const lookup=await fetch(rowUrl+"&select=created_at,proof_window_started_at,lob_test_check_id",{headers});
    if(!lookup.ok)throw Error();
    const [row]=await lookup.json();
    if(!row)return reply(409,{error:"Waiting for Stripe's signed payment confirmation. Check again shortly."});
    const windowStart=Date.parse(row.proof_window_started_at || row.created_at);
    const age=Date.now()-windowStart;
    if(!row.lob_test_check_id && !(age>=0 && age<3600000))
      return reply(410,{error:"This test has expired."});
    if(action==="receipt")return reply(200,{paid:true,testCheckId:row.lob_test_check_id});
    if(action!=="render")return reply(400,{error:"Unknown proof action."});
    const proof=await fetch(cloud,{method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({session_id}),signal:AbortSignal.timeout(55000)});
    if(!proof.ok)return reply(502,{error:"Lob test proof unavailable. Retry this session."});
    const result=await proof.json();
    if(!/^chk_[A-Za-z0-9]+$/.test(result.testCheckId))throw Error();
    if(!row.lob_test_check_id){
      const saved=await fetch(rowUrl+"&lob_test_check_id=is.null",{method:"PATCH",headers,
        body:JSON.stringify({lob_test_check_id:result.testCheckId})});
      if(!saved.ok)throw Error();
    }
    return reply(200,result);
  }catch{return reply(503,{error:"Unable to verify the sandbox proof. Retry this session."});}
});
