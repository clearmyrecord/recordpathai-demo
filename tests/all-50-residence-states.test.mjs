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
  return [...match[1].matchAll(/<option\s+value="([^"]*)">([^<]*)<\/option>/g)]
   .map(m=>({value:m[1],name:m[2]}));
}
test("Step 1 residence dropdown includes each of the 50 states exactly once",()=>{
  assert.equal(expected.size,50);
  const first=html("eligibility.html");
  const choices=optionsFor(first,"residenceState");
  assert.equal(choices[0].value,"");
  assert.equal(choices.length,51);
  assert.deepEqual(new Map(choices.slice(1).map(x=>[x.value,x.name])),expected);
  assert.match(first,/data-path="petitioner\.address\.state"/);
  assert.doesNotMatch(html("record-details.html"),/id="residenceState"/);
});
test("Step 2 filing state is distinct from residence and offers all states without promising court integration",()=>{
  const first=html("eligibility.html"), details=html("record-details.html");
  assert.doesNotMatch(first,/id="caseState"/);
  const choices=optionsFor(details,"caseState");
  assert.equal(choices[0].value,"");
  assert.deepEqual(new Map(choices.slice(1).map(x=>[x.value,x.name])),expected);
  assert.match(first,/state: residenceState/);
  assert.match(first,/state: caseState/); // Preserved context, not a second question.
  assert.match(details,/data\.petitioner\.address\.state = profile\.residenceState/);
  assert.match(details,/data\.court\.state = first\.case_state/);
  const packet=html("packet.html");
  assert.match(packet,/data\.petitioner\.address\.state/);
  assert.match(packet,/data\.court\.state/);
});
test("historic residence-state names are normalized; case state remains independent",()=>{
  const first=html("eligibility.html"), details=html("record-details.html");
  const bridge=fs.readFileSync(path.join(root,"js/packet-data-bridge.js"),"utf8");
  assert.match(first,/id === "residenceState"/);
  assert.match(details,/id === "residenceState" \|\| id === "caseState"/);
  assert.match(bridge,/input\.id === "residenceState"/);
  assert.match(bridge,/option\.textContent\.trim\(\)\.toLowerCase\(\)/);
  for(const page of [first,details]){
    const id=page===first?"residenceState":"caseState";
    const choices=optionsFor(page,id);
    for(const [name,value] of [["New York","NY"],["Hawaii","HI"],["Wyoming","WY"],["Nevada","NV"]]){
      assert.equal(choices.find(x=>x.name.toLowerCase()===name.toLowerCase())?.value,value);
    }
    for(const match of page.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))
      if(match[1].trim())assert.doesNotThrow(()=>new vm.Script(match[1]));
  }
  assert.doesNotThrow(()=>new vm.Script(bridge));
});
