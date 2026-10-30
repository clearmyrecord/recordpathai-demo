import test from "node:test";
import assert from "node:assert/strict";
import { validateOfficialPdfSource,assertPublicNetworkAddress,readBoundedPdfResponse } from "../src/pdf-source-security.js";

test("Only official HTTPS .gov or .us court sources with public DNS are accepted",async()=>{
 const resolver=async()=>[{address:"8.8.8.8",family:4}];
 const url="https://clerkofcourt.co.wood.oh.us/DocumentCenter/View/142/file.pdf";
 assert.equal(await validateOfficialPdfSource(url,resolver),url);
 for(const candidate of [
  "http://clerkofcourt.co.wood.oh.us/a.pdf",
  "https://court-attacker.example/a.pdf",
  "https://court.gov.evil.test/a.pdf",
  "https://127.0.0.1/a.pdf",
  "https://user:password@court.gov/a.pdf",
  "file:///etc/passwd"
 ]) await assert.rejects(validateOfficialPdfSource(candidate,resolver),candidate);
});
test("DNS restrictions deny private, loopback, cloud metadata and mixed-address results",async()=>{
 for(const ip of ["127.0.0.1","10.0.0.9","172.16.0.1","192.168.1.3","169.254.169.254","100.100.100.100","::1","fd00::1","::ffff:127.0.0.1"])
   assert.throws(()=>assertPublicNetworkAddress(ip),ip);
 await assert.rejects(validateOfficialPdfSource("https://court.gov/a.pdf",async()=>[
  {address:"8.8.8.8",family:4},{address:"10.0.0.9",family:4}
 ]));
});
function fakeResponse(data,contentType="application/pdf"){
 return {
  ok:true,
  headers:new Headers({"content-type":contentType,"content-length":String(data.length)}),
  body:new ReadableStream({start(controller){controller.enqueue(data);controller.close();}})
 };
}
test("Court PDF proxy refuses oversized or non-PDF content",async()=>{
 const good=Buffer.from("%PDF-1.7\nmock file");
 const value=await readBoundedPdfResponse(fakeResponse(good),1000);
 assert.equal(value.toString(),good.toString());
 await assert.rejects(readBoundedPdfResponse(fakeResponse(Buffer.from("not a pdf")),1000));
 await assert.rejects(readBoundedPdfResponse(fakeResponse(Buffer.from("%PDF-1.7\n"+ "x".repeat(150))),100));
 await assert.rejects(readBoundedPdfResponse(fakeResponse(good,"text/html"),1000));
});
