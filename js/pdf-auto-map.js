/* RecordPathAI PDF Mapper V6: offline, geometry-aware field suggestions.
 * No OCR, remote AI, user-record upload, automatic checkout or court submissions.
 * All output is a draft mapping for manual inspection. Coordinates use the
 * V5/packet generator's 1.25x base viewport (~765 x 990 for letter paper).
 */
(function (root, factory) {
  const api=factory();
  if (typeof module==="object" && module.exports) module.exports=api;
  root.RecordPathPdfAutoMap=api;
}(typeof globalThis!=="undefined"?globalThis:this,function () {
  "use strict";
  const BASE_SCALE=1.25;
  const norm=(v)=>String(v||"").normalize("NFKC").toLowerCase()
    .replace(/[‐-‒–—]/g,"-").replace(/[_\s]+/g," ").replace(/[^a-z0-9. ]/g," ").replace(/\s+/g," ").trim();
  const clamp=(n,a,b)=>Math.min(b,Math.max(a,n));
  const rules=[
    // Common legal form text labels. Generic detections are deliberately low confidence.
    [/\bcase\s*(?:no|number)\b/, "court.case_number","text",170],
    [/\bjudge\b/, "court.judge_name","text",155],
    [/\bname of party\b/, "petitioner.full_name","text",260],
    [/\b(?:e mail|email) address\b/, "petitioner.email","text",230],
    [/\bphone\s*(?:no|number)?\b/, "petitioner.phone","text",180],
    [/\bstreet\b/, "petitioner.address.line1","text",245],
    [/\b(?:po|p o) box\b|apartment number/, "petitioner.address.line2","text",210],
    [/\bzip\s*code\b/, "petitioner.address.zip","text",125],
    [/\bdate\b/, "generated.current_date","date",145]
  ];
  const KNOWN_WOOD=[
    // Address verification, page 3. Base-viewport positions are suggestions,
    // not automatically approved filing coordinates.
    [3,"generated.current_date","date",132,445,195,24],
    [3,"petitioner.full_name","text",202,496,445,25],
    [3,"petitioner.address.line1","text",149,546,490,26],
    [3,"petitioner.address.line2","text",299,596,335,25],
    [3,"petitioner.address.city","text",178,645,300,25],
    [3,"petitioner.address.state","text",490,645,110,25],
    [3,"petitioner.address.zip","text",156,696,180,25],
    [3,"petitioner.email","text",189,745,440,25],
    // Caption and fields, page 4.
    [4,"court.case_number","text",528,165,135,21],
    [4,"court.judge_name","text",516,191,150,22],
    [4,"petitioner.full_name","text",108,259,250,24],
    [4,"petitioner.address.line1","text",115,288,245,24],
    [4,"petitioner.address.city","text",144,314,110,22],
    [4,"petitioner.address.state","text",257,314,43,22],
    [4,"petitioner.address.zip","text",304,314,59,22],
    [4,"petitioner.phone","text",119,340,241,22],
    [4,"petitioner.email","text",100,366,260,23],
    [4,"petitioner.full_name","text",94,411,208,24],
    [4,"charges.0.disposition_date","date",164,459,178,24],
    ...Array.from({length:4},(_,i)=>[
      [4,`charges.${i}.charge_name`,"text",105,521+i*29,253,24],
      [4,`charges.${i}.charge_code`,"text",376,521+i*29,170,24],
      [4,`charges.${i}.level`,"text",555,521+i*29,111,24]
    ]).flat(),
    [4,"signatures.petitioner_signature_name","signature",408,845,234,26]
  ];
  function groupLines(page) {
    const src=Array.isArray(page?.items)?page.items:[];
    const toks=src.filter(v=>typeof v.str==="string"&&v.str.trim()&&Number.isFinite(v.x)&&Number.isFinite(v.y))
      .map(v=>({text:v.str,x:v.x,y:v.y,w:Math.max(0,v.width||0),h:Math.max(7,v.height||12)}))
      .sort((a,b)=>(a.y-b.y)||(a.x-b.x));
    const lines=[];
    for (const tok of toks) {
      let line=lines.slice(-5).find(l=>Math.abs(l.y-tok.y)<=7);
      if(!line){line={y:tok.y,items:[]};lines.push(line);}
      line.items.push(tok);
      line.y=(line.items.reduce((v,t)=>v+t.y,0))/line.items.length;
    }
    return lines.map(l=>{
      l.items.sort((a,b)=>a.x-b.x);
      return {y:l.y,x:l.items[0]?.x||0,
        maxX:Math.max(...l.items.map(v=>v.x+v.w)),
        text:l.items.map(i=>i.text).join(" ").replace(/\s+/g," ").trim()};
    }).sort((a,b)=>a.y-b.y);
  }
  function canonicalField(raw) {
    const name=norm(raw).replace(/ /g,"_");
    if (/^(petitioner|court|charges|signatures|generated)\./.test(name)) return name;
    if (/case.*(?:no|number)/.test(name))return "court.case_number";
    if (/judge/.test(name))return "court.judge_name";
    if (/full.*name|party.*name|applicant.*name/.test(name))return "petitioner.full_name";
    if (/email/.test(name))return "petitioner.email";
    if (/phone/.test(name))return "petitioner.phone";
    if (/zip/.test(name))return "petitioner.address.zip";
    if (/street|address.*line.*1/.test(name))return "petitioner.address.line1";
    if (/current.*date/.test(name))return "generated.current_date";
    if (/signature/.test(name))return "signatures.petitioner_signature_name";
    return "";
  }
  function suggest({page,name,type="text",x,y,width,height=25,confidence=.6,reason="",source="text"}){
    if(!Number.isFinite(page)||!name)return null;
    return {page,name,type,x:Math.round(x),y:Math.round(y),
      width:Math.round(width),height:Math.round(height),confidence,
      reason,source};
  }
  function isWoodNonconviction(pages){
    if(!Array.isArray(pages)||pages.length<4)return false;
    const p3=groupLines(pages[2]).map(x=>norm(x.text)).join(" ");
    const p4=groupLines(pages[3]).map(x=>norm(x.text)).join(" ");
    return p3.includes("wood county") && p3.includes("address verification") &&
      p4.includes("wood county") && p4.includes("2953.33") &&
      (p4.includes("not guilty")||p4.includes("no bill"));
  }
  function buildWood(pages) {
    const out=[];
    for(const [page,name,type,x,y,width,height] of KNOWN_WOOD){
      const meta=pages[page-1];
      if(!meta)continue;
      const sx=(meta.width||768)/768,sy=(meta.height||994)/994;
      out.push(suggest({page,name,type,x:x*sx,y:y*sy,width:width*sx,height:height*sy,
        confidence:type==="signature"?.69:.88,
        reason:"Wood County R.C. 2953.33 layout match; visually verify before export.",
        source:"wood-county-layout"}));
    }
    return out;
  }
  // GBI form is restricted to arrests before 2013-07-01. It is an agency
  // record-restriction request, not a petition to a judge. Applicant Section
  // One only may be prepared. Sections Two/Three belong to agencies and DAs.
  function isGeorgiaPre2013(pages){
    if(!Array.isArray(pages)||pages.length<3)return false;
    const text=pages.map(p=>groupLines(p).map(x=>norm(x.text)).join(" ")).join(" ");
    return text.includes("georgia bureau of investigation") &&
      text.includes("request to restrict arrest record") &&
      text.includes("prior to 07 01 2013");
  }
  const GA_PRE2013_APPLICANT_FIELDS=[
    [2,"petitioner.full_name","text",134,287,540,22],
    [2,"petitioner.dob","date",172,322,196,22],
    [2,"petitioner.phone","text",211,389,144,22],
    [2,"petitioner.email","text",399,389,279,22],
    [2,"petitioner.address.line1","text",183,426,492,22],
    [2,"petitioner.address.city","text",119,460,278,22],
    [2,"petitioner.address.state","text",436,460,117,22],
    [2,"petitioner.address.zip","text",615,460,70,22],
    [2,"charges.0.arresting_agency","text",196,497,480,22],
    [2,"charges.0.arrest_date","date",181,533,495,22],
    [2,"charges.0.charge_name","text",240,564,436,23],
    [2,"signatures.petitioner_signature_name","signature",146,798,353,22]
  ];
  function buildGeorgiaPre2013(pages){
    const p=pages[1];
    if(!p)return [];
    const sx=(p.width||765)/765,sy=(p.height||990)/990;
    return GA_PRE2013_APPLICANT_FIELDS.map(([page,name,type,x,y,width,height])=>
      suggest({page,name,type,x:x*sx,y:y*sy,width:width*sx,height:height*sy,
        confidence:type==="signature"?.64:.75,
        reason:"GBI pre-July-2013 form applicant section only; verify this box manually.",
        source:"ga-pre2013-layout"}));
  }

  function buildAnnotations(pages) {
    const out=[];
    pages.forEach((p,idx)=>{
      for(const ann of p.annotations||[]){
        if(ann.subtype!=="Widget"||!Array.isArray(ann.rect)||ann.rect.length<4)continue;
        const name=canonicalField(ann.fieldName||ann.alternativeText||"");
        if(!name)continue;
        const [x1,y1,x2,y2]=ann.rect;
        const x=Math.min(x1,x2),y=Math.min(y1,y2);
        const width=Math.abs(x2-x1),height=Math.abs(y2-y1);
        if(width<8||height<8)continue;
        out.push(suggest({page:idx+1,name,type:/checkbox|button/i.test(ann.fieldType||"")?"checkbox":"text",
          x,y,width,height,confidence:.96,reason:"Existing named PDF form widget.",source:"pdf-widget"}));
      }
    });
    return out;
  }
  function buildGeneric(pages,wood) {
    const out=[];
    pages.forEach((p,i)=>{
      const number=i+1;
      if(wood && number<=2)return;
      const rows=groupLines(p);
      for(const line of rows){
        const text=norm(line.text);
        if(!text || text.length>125)continue;
        for(const [rx,name,type,expectedWidth] of rules){
          if(!rx.test(text))continue;
          // Match a label to a probable blank area. Text-layer alone cannot
          // prove underline position or that a field is legally appropriate.
          const x=clamp(line.maxX+7,20,(p.width||765)-expectedWidth-15);
          const y=clamp(line.y+Math.min(6,Math.max(0,12-(line.y%6))),5,(p.height||990)-32);
          out.push(suggest({page:number,name,type,x,y,width:Math.min(expectedWidth,(p.width||765)-x-12),
            height:24,confidence:.58,reason:"Nearby text label: "+line.text.slice(0,95),
            source:"label-match"}));
          break;
        }
      }
    });
    return out;
  }
  function dedupe(suggestions){
    const out=[];
    suggestions.sort((a,b)=>b.confidence-a.confidence);
    for(const s of suggestions){
      if(!s||s.width<12||s.height<8)continue;
      if(out.some(x=>x.page===s.page && x.name===s.name &&
         Math.abs(x.y-s.y)<40 && Math.abs(x.x-s.x)<110))continue;
      out.push(s);
    }
    return out.sort((a,b)=>a.page-b.page||a.y-b.y||a.x-b.x);
  }
  function analyzePages(pages) {
    if(!Array.isArray(pages)||pages.length===0)
      return {profile:"none",suggestions:[],diagnostics:["Load a PDF first."]};
    const hasText=pages.some(p=>(p.items||[]).some(i=>String(i.str||"").trim()));
    const wood=isWoodNonconviction(pages);
    const georgia=isGeorgiaPre2013(pages);
    const proposals=dedupe([
      ...buildAnnotations(pages),
      ...(wood?buildWood(pages):[]),
      ...(georgia?buildGeorgiaPre2013(pages):[]),
      // An agency form's later pages belong to government staff, not the
      // applicant. Do not even suggest editable boxes on those pages.
      ...(georgia?[]:buildGeneric(pages,wood))
    ]);
    const diagnostics=[];
    if(!hasText && !pages.some(p=>(p.annotations||[]).length))
      diagnostics.push("No searchable text or form widgets. Scanned PDFs require OCR or manual mapping; no guesses were applied.");
    if(wood)diagnostics.push("Wood County R.C. 2953.33 layout detected. Review fields on pages 3 and 4, especially the charge table and signature.");
    else if(georgia)diagnostics.push("Georgia pre-2013 arrest restriction detected. Only Section One applicant fields suggested; SSN and race/sex require separate secure manual completion. Sections Two/Three are for arresting agency and prosecutor. Never use for arrests on or after 2013-07-01.");
    else diagnostics.push("Generic label detection only; examine each field placement carefully.");
    diagnostics.push("All coordinates are draft suggestions in the mapper's 1.25x reference viewport.");
    return {profile:wood?"wood-county-2953.33":georgia?"ga-prior-2013-record-restriction":"generic",suggestions:proposals,diagnostics};
  }
  return Object.freeze({BASE_SCALE,analyzePages,isWoodNonconviction,isGeorgiaPre2013,canonicalField,groupLines});
}));