import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";
const source=readFileSync(new URL("../js/professional-pilot-demo.js",import.meta.url),"utf8");
function harness(value="dismissal"){
 const els=Object.fromEntries(["scenario","routing","fee","status","review","prepare","approve","reset","checklist"].map(id=>[id,{value:id==="scenario"?value:"",disabled:false,textContent:"",listeners:{},addEventListener(n,f){this.listeners[n]=f;}}]));
 vm.runInNewContext(source,{document:{getElementById:id=>els[id]}});
 const click=id=>els[id].listeners.click();
 return {els,click};
}
test("demo requires review, preparation, final review; never files",()=>{const {els,click}=harness();assert.equal(els.prepare.disabled,true);click("approve");assert.match(els.status.textContent,/Awaiting/);click("review");click("prepare");click("approve");assert.match(els.status.textContent,/no filing/);assert.match(els.fee.textContent,/\$0/);click("reset");assert.equal(els.prepare.disabled,true);});
test("mixed disposition remains held; scenario switch resets stage",()=>{const {els,click}=harness("mixed");click("review");click("prepare");click("approve");assert.equal(els.prepare.disabled,true);assert.match(els.status.textContent,/blocked/);els.scenario.value="conviction";els.scenario.listeners.change();assert.match(els.fee.textContent,/\$100/);assert.match(els.status.textContent,/Awaiting/);});
test("legacy fictional demo has no live network or storage and is no longer embedded in the professional homepage",()=>{assert.doesNotMatch(source,/fetch\(|localStorage|sessionStorage|XMLHttpRequest|navigator\.sendBeacon/);const html=readFileSync(new URL("../professional.html",import.meta.url),"utf8");assert.doesNotMatch(html,/professional-pilot-demo\.js|Synthetic demonstration only|Optional product walkthrough/);assert.doesNotMatch(html,/<input|<textarea|<form\b/i);assert.match(html,/href="signup\.html\?returnUrl=professional-account\.html"/);});
