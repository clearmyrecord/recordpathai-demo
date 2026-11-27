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
