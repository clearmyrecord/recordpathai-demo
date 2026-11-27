import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";
const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
const window={};vm.runInNewContext(read("js/charge-library.js"),{window});
const library=window.RecordPathChargeLibrary;
test("Ohio statute references are unique, scoped, and have source links",()=>{
 const rows=library.entries("OH"),statutes=rows.filter(r=>r.code);
 assert.equal(statutes.length,234);
 assert.equal(new Set(statutes.map(r=>r.code)).size,statutes.length);
 for(const r of statutes){assert.equal(r.state,"OH");assert.match(r.code,/^\d{4}\.\d{2,4}$/);assert.equal(r.source,"https://codes.ohio.gov/ohio-revised-code/section-"+r.code);assert.ok(r.referenceEdition);assert.equal(r.degree,undefined);assert.equal(r.waitTime,undefined);}
 for(const state of ["NV","TN","FL","NC","CA","TX",""])assert.ok(library.entries(state).every(r=>!r.code&&!r.state));
});
test("lookup finds common labels, aliases, section numbers and subsections",()=>{
 assert.equal(library.search("2925.11(A)","OH")[0].code,"2925.11");
 assert.equal(library.search("possession of drugs","OH")[0].code,"2925.11");
 assert.equal(library.search("OVI","OH")[0].code,"4511.19");
 assert.equal(library.search("GSI","OH")[0].code,"2907.05");
 assert.equal(library.search("2925.11","NV").length,0);
 assert.ok(library.search("stalking","TN").length>0);
 assert.equal(library.search("","OH").length,0);
});
test("consumer and professional intake share lookup with manual entry and no inferred outcome",()=>{
 const consumer=read("record-details.html"),pro=read("professional-record-details.html"),mount=read("js/professional-record-intake.js"),script=read("js/charge-library.js");
 assert.match(consumer,/data-charge-library-open/);
 assert.match(consumer,/href="charge-library\.html"/);
 assert.match(consumer,/RecordPathChargeLibrary\?\.mount/);
 assert.match(pro,/js\/charge-library\.js/);
 assert.match(mount,/RecordPathChargeLibrary\?\.mount\(mount\)/);
 assert.match(script,/preserveSubsection/);
 assert.match(script,/root\.confirm/);
 assert.doesNotMatch(script,/localStorage|sessionStorage|fetch\(/);
 assert.doesNotMatch(script,/data-field="(?:degree|final_disposition|disposition_date|discharge_date|isTraffic|isSexOffense)"/);
 assert.match(read("charge-library.html"),/Other states currently have general names only/);
});

test("pressing Enter in charge search cannot submit the surrounding case form",()=>{
 const script=read("js/charge-library.js");
 assert.match(script,/input\.addEventListener\("keydown",event=>\{if\(event\.key==="Enter"\)\{event\.preventDefault\(\);event\.stopPropagation\(\);render\(\);\}\}\)/);
});

test("exact name or alias resolves only an unambiguous statute in the selected jurisdiction",()=>{
 assert.equal(library.exactStatute("Trafficking in Drugs","OH")?.code,"2925.03");
 assert.equal(library.exactStatute("Drug trafficking","OH")?.code,"2925.03");
 assert.equal(library.exactStatute("Possession of Drugs","OH")?.code,"2925.11");
 assert.equal(library.exactStatute("Trafficking in Drugs","NV"),null);
 assert.equal(library.exactStatute("Trafficking","OH"),null);
 assert.equal(library.sameSection("2925.03(A)(2)","2925.03"),true);
 assert.equal(library.sameSection("2925.031","2925.03"),false);
});
test("native charge name selection populates its paired code, respects manual edits, and leaves other cards alone",()=>{
 const root={confirm:()=>false};vm.runInNewContext(read("js/charge-library.js"),{window:root,AbortController});
 const L=root.RecordPathChargeLibrary;
 const node=(field,value="")=>({value,dataset:{field},listeners:{},addEventListener(type,fn,opts){(this.listeners[type]??=[]).push({fn,opts})},matches(selector){return selector.includes('"'+field+'"')},replaceChildren(...children){this.children=children}});
 const state=node("caseState","OH"),names=node("names"),codes=node("codes");
 const makeCard=()=>{const n=node("charge_name"),c=node("charge_code"),on=node("original_charge_name"),oc=node("original_charge_code"),fields=[n,c,on,oc];const card={querySelector:s=>fields.find(el=>el.matches(s))};for(const f of fields)f.closest=()=>card;return {n,c,on,oc};};
 const a=makeCard(),b=makeCard();
 const form=node("form");form.ownerDocument={createElement:()=>({})};form.querySelector=s=>({"#caseState":state,"#chargeNameSuggestions":names,"#offenseCodeSuggestions":codes}[s]);form.querySelectorAll=()=>[a.c,a.oc,b.c,b.oc];
 const emit=(type,target)=>{for(const {fn,opts} of form.listeners[type]||[])if(!opts?.signal?.aborted)fn({type,target});};
 L.mount(form);assert.ok(names.children.some(o=>o.value==="Trafficking in Drugs"&&o.label.includes("2925.03")));
 a.n.value="Trafficking in Drugs";emit("input",a.n);assert.equal(a.c.value,"2925.03");assert.equal(b.c.value,"");
 a.n.value="Possession of Drugs";emit("change",a.n);assert.equal(a.c.value,"2925.11");
 a.c.value="2925.11(A)";emit("input",a.c);emit("change",a.n);assert.equal(a.c.value,"2925.11(A)");
 a.n.value="Theft";emit("input",a.n);emit("change",a.n);assert.equal(a.c.value,"2925.11(A)");
 a.on.value="Trafficking in Drugs";emit("change",a.on);assert.equal(a.oc.value,"2925.03");assert.equal(a.c.value,"2925.11(A)");
 b.n.value="Theft";emit("change",b.n);assert.equal(b.c.value,"2913.02");
 b.n.value="Unmapped custom offense";emit("input",b.n);assert.equal(b.c.value,"");
 state.value="NV";for(const {fn} of state.listeners.change)fn({target:state});assert.equal(a.oc.value,"");assert.equal(a.c.value,"2925.11(A)");
 b.n.value="Theft";emit("change",b.n);assert.equal(b.c.value,"");
});
