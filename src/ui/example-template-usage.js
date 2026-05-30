import { createNewCase } from "../core/case-schema.js";
import { buildPacketDefinition } from "../core/packet-engine.js";

const caseFile = createNewCase("OH");

caseFile.county = "Wood";
caseFile.court = "Wood County Court of Common Pleas";
caseFile.caseNumber = "2006CR0387";
caseFile.filingType = "sealing";

caseFile.person.firstName = "Matt";
caseFile.person.lastName = "Tunstall";
caseFile.person.fullName = "Matt Tunstall";
caseFile.person.email = "matt@recordpathai.com";
caseFile.person.phone = "8668219810";
caseFile.person.address1 = "231 W Horizon Ridge Parkway";
caseFile.person.city = "Henderson";
caseFile.person.state = "NV";
caseFile.person.zip = "89012";

caseFile.charges = [
  {
    id: crypto.randomUUID(),
    chargeName: "Possession of Drugs",
    statute: "2925.11(A)",
    level: "Felony 3",
    disposition: "Guilty",
    arrestDate: "2006-01-01",
    convictionDate: "2007-05-04",
    sentencingDate: "2007-05-04",
    probationCompletedDate: "2010-05-07",
    jailCompletedDate: "",
    finePaid: true,
    restitutionPaid: true,
    victimInvolved: false,
    dismissed: false,
    sealedBefore: false
  }
];

const packet = buildPacketDefinition(caseFile);
console.log(packet.template);
console.log(packet.fields);
