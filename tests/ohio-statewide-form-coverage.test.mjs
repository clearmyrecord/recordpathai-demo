import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {createHash} from "node:crypto";
import {fileURLToPath} from "node:url";
import "../js/form-pipeline-core.js";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const catalog=JSON.parse(fs.readFileSync(path.join(root,"data/ohio-statewide-form-catalog.json"),"utf8"));
const counties=JSON.parse(fs.readFileSync(path.join(root,"data/ohio-counties.json"),"utf8"));
const pipeline=globalThis.RecordPathFormPipeline;

test("Ohio statewide standard forms cover all 87 non-Wood counties without activation",()=>{
  const nonWood=counties.filter(c=>c.state==="OH"&&c.slug!=="wood");
  assert.equal(nonWood.length,87);
  assert.equal(catalog.coverageSummary.nonWoodCountyCount,87);
  assert.equal(catalog.coverageSummary.countyFormRecords,174);
  assert.equal(catalog.counties.length,87);
  assert.deepEqual(new Set(catalog.counties.map(c=>c.countySlug)),new Set(nonWood.map(c=>c.slug)));
  assert.ok(catalog.counties.every(c=>c.active===false&&c.customerLinkApproved===false&&
    c.localCourtReviewRequired===true&&c.exactCourtInventoryVerified===false&&
    c.feeVerified===false&&c.mailingAcceptanceVerified===false));
});

test("Ohio 96-C1 and 96-F1 maps are source-pinned and geometrically valid",()=>{
  const required=[
    ["sealing-conviction","templates/ohio/statewide/sealing-conviction-96-c1.json","assets/forms/ohio/statewide/application-to-seal-record-of-conviction-96-c1.pdf"],
    ["sealing-nonconviction","templates/ohio/statewide/sealing-nonconviction-96-f1.json","assets/forms/ohio/statewide/application-to-seal-record-of-nonconviction-96-f1.pdf"]
  ];
  for(const [type,mapPath,pdfPath] of required){
    const map=JSON.parse(fs.readFileSync(path.join(root,mapPath),"utf8"));
    const bytes=fs.readFileSync(path.join(root,pdfPath));
    assert.equal(bytes.subarray(0,5).toString("ascii"),"%PDF-");
    assert.equal(createHash("sha256").update(bytes).digest("hex"),catalog.forms[type].sourcePdfSha256);
    assert.equal(map.sourcePdfSha256,catalog.forms[type].sourcePdfSha256);
    assert.equal(map.active,false);
    assert.equal(map.mappingStatus,"mapped_review_only");
    assert.equal(pipeline.validateMapping(map.mappings,map.pageCount).ok,true);
    assert.ok(map.mappings.some(f=>f.name==="petitioner.full_name"));
    assert.ok(map.mappings.some(f=>f.name==="court.case_number"));
    assert.ok(map.mappings.some(f=>f.type==="signature"));
    assert.ok(map.mappings.every(f=>f.page===1&&f.x>=0&&f.y>=0&&f.x+f.width<=map.pageWidth&&f.y+f.height<=map.pageHeight));
  }
});

test("Each county exposes both mapped standard form references while preserving review-only status",()=>{
  for(const county of catalog.counties){
    for(const type of ["sealing-conviction","sealing-nonconviction"]){
      const form=county.forms[type];
      assert.equal(form.mappingPath,catalog.forms[type].mappingPath);
      assert.equal(form.pdfPath,catalog.forms[type].pdfPath);
      assert.equal(form.status,"mapped_review_only");
      assert.equal(form.active,false);
      assert.equal(form.filingPlanApproved,false);
    }
  }
});
