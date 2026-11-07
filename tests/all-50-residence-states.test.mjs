import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const expected=new Map([
  ["AL","Alabama"],["AK","Alaska"],["AZ","Arizona"],["AR","Arkansas"],
  ["CA","California"],["CO","Colorado"],["CT","Connecticut"],["DE","Delaware"],
  ["FL","Florida"],["GA","Georgia"],["HI","Hawaii"],["ID","Idaho"],
  ["IL","Illinois"],["IN","Indiana"],["IA","Iowa"],["KS","Kansas"],
  ["KY","Kentucky"],["LA","Louisiana"],["ME","Maine"],["MD","Maryland"],
  ["MA","Massachusetts"],["MI","Michigan"],["MN","Minnesota"],["MS","Mississippi"],
  ["MO","Missouri"],["MT","Montana"],["NE","Nebraska"],["NV","Nevada"],
  ["NH","New Hampshire"],["NJ","New Jersey"],["NM","New Mexico"],["NY","New York"],
  ["NC","North Carolina"],["ND","North Dakota"],["OH","Ohio"],["OK","Oklahoma"],
  ["OR","Oregon"],["PA","Pennsylvania"],["RI","Rhode Island"],["SC","South Carolina"],
  ["SD","South Dakota"],["TN","Tennessee"],["TX","Texas"],["UT","Utah"],
  ["VT","Vermont"],["VA","Virginia"],["WA","Washington"],["WV","West Virginia"],
  ["WI","Wisconsin"],["WY","Wyoming"]
]);
function html(page){return fs.readFileSync(path.join(root,page),"utf8");}
function optionsFor(markup,id){
  const match=markup.match(new RegExp('<select\\b[^>]*\\bid="'+id+'"[^>]*>([\\s\\S]*?)<\\/select>'));
  assert.ok(match,"Missing select "+id);
  return [...match[1].matchAll(/<option\\s+value="([^"]*)">([^<]*)<\\/option>/g)]
   .map(m=>({value:m[1],name:m[2]}));
}
test("both residence dropdowns include each of the 50 states exactly once",()=>{
  assert.equal(expected.size,50);
  for(const file of ["eligibility.html","record-details.html"]){
    const choices=optionsFor(html(file),"residenceState");
    assert.equal(choices[0].value,"");
    assert.equal(choices.length,51);
    const actual=new Map(choices.slice(1).map(x=>[x.value,x.name]));
    assert.equal(actual.size,50,file);
    assert.deepEqual(actual,expected,file);
    assert.match(html(file),/data-path="petitioner\\.address\\.state"/);
  }
});
test("court case state is a separate select and is not replaced by the residence list",()=>{
  const eligibility=html("eligibility.html"),details=html("record-details.html");
  for(const page of [eligibility,details]){
    const caseOptions=optionsFor(page,"caseState");
    assert.ok(caseOptions.length>1);
    assert.ok(caseOptions.length<51,"Case state routing must not assume unintegrated states have legal filing rules");
    assert.ok(optionsFor(page,"residenceState").length>caseOptions.length);
  }
  assert.match(eligibility,/state: residenceState/);
  assert.match(eligibility,/state: caseState/);
  assert.match(details,/data\\.petitioner\\.address\\.state = profile\\.residenceState/);
  assert.match(details,/data\\.court\\.state = first\\.case_state/);
  const packet=html("packet.html");
  assert.match(packet,/data\\.petitioner\\.address\\.state/);
  assert.match(packet,/data\\.court\\.state/);
});
test("historic full residence-state names are restored as abbreviations without affecting case state",()=>{
  const eligibility=html("eligibility.html"),details=html("record-details.html");
  const bridge=fs.readFileSync(path.join(root,"js/packet-data-bridge.js"),"utf8");
  assert.match(eligibility,/id === "residenceState"/);
  assert.match(details,/id === "residenceState"/);
  assert.match(bridge,/input\\.id === "residenceState"/);
  assert.match(bridge,/option\\.textContent\\.trim\\(\\)\\.toLowerCase\\(\\)/);
  for(const page of [eligibility,details]){
    const choices=optionsFor(page,"residenceState");
    for(const [name,value] of [["New York","NY"],["Hawaii","HI"],["Wyoming","WY"],["Nevada","NV"]]){
      const matched=choices.find(x=>x.name.toLowerCase()===name.toLowerCase());
      assert.equal(matched.value,value);
    }
    for(const match of page.matchAll(/<script(?:\\s[^>]*)?>([\\s\\S]*?)<\\/script>/g))
      if(match[1].trim())assert.doesNotThrow(()=>new vm.Script(match[1]));
  }
  assert.doesNotThrow(()=>new vm.Script(bridge));
});
