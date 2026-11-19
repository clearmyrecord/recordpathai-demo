export const TEMPLATE_FIELD_MAPS = {
  "oh-wood-sealing-conviction-v1": {
    full_name: "person.fullName",
    first_name: "person.firstName",
    last_name: "person.lastName",
    email: "person.email",
    phone: "person.phone",
    address_1: "person.address1",
    address_2: "person.address2",
    city: "person.city",
    state: "person.state",
    zip: "person.zip",
    county: "county",
    court_name: "court",
    case_number: "caseNumber",
    filing_type: "filingType",
    charge_1_name: "charges[0].chargeName",
    charge_1_statute: "charges[0].statute",
    charge_1_level: "charges[0].level",
    charge_1_disposition: "charges[0].disposition",
    conviction_date: "charges[0].convictionDate",
    probation_completed_date: "charges[0].probationCompletedDate"
  },

  "oh-wood-sealing-dismissal-v1": {
    full_name: "person.fullName",
    first_name: "person.firstName",
    last_name: "person.lastName",
    email: "person.email",
    phone: "person.phone",
    address_1: "person.address1",
    address_2: "person.address2",
    city: "person.city",
    state: "person.state",
    zip: "person.zip",
    county: "county",
    court_name: "court",
    case_number: "caseNumber",
    filing_type: "filingType",
    charge_1_name: "charges[0].chargeName",
    charge_1_statute: "charges[0].statute",
    charge_1_level: "charges[0].level",
    dismissal_date: "charges[0].dispositionDate"
  },

  "oh-generic-sealing-v1": {
    full_name: "person.fullName",
    address_1: "person.address1",
    city: "person.city",
    state: "person.state",
    zip: "person.zip",
    county: "county",
    court_name: "court",
    case_number: "caseNumber",
    charge_1_name: "charges[0].chargeName",
    charge_1_statute: "charges[0].statute"
  },

  "nv-clark-record-seal-v1": {
    full_name: "person.fullName",
    address_1: "person.address1",
    address_2: "person.address2",
    city: "person.city",
    state: "person.state",
    zip: "person.zip",
    county: "county",
    court_name: "court",
    case_number: "caseNumber",
    charge_1_name: "charges[0].chargeName",
    charge_1_statute: "charges[0].statute",
    charge_1_level: "charges[0].level",
    charge_1_disposition: "charges[0].disposition",
    conviction_date: "charges[0].convictionDate",
    sentence_completed_date: "charges[0].probationCompletedDate"
  },

  "nv-generic-record-seal-v1": {
    full_name: "person.fullName",
    county: "county",
    court_name: "court",
    case_number: "caseNumber",
    charge_1_name: "charges[0].chargeName"
  }
};
