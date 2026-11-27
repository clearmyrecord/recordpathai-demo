window.chargeLibrary = [
  // General / common starter library
  { id: "theft", name: "Theft", category: "Property", aliases: ["stealing", "petit theft", "grand theft"] },
  { id: "shoplifting", name: "Shoplifting", category: "Property", aliases: ["retail theft"] },
  { id: "burglary", name: "Burglary", category: "Property", aliases: [] },
  { id: "robbery", name: "Robbery", category: "Property", aliases: [] },
  { id: "receiving-stolen-property", name: "Receiving Stolen Property", category: "Property", aliases: [] },
  { id: "criminal-trespass", name: "Criminal Trespass", category: "Property", aliases: ["trespassing"] },
  { id: "criminal-damaging", name: "Criminal Damaging", category: "Property", aliases: ["vandalism", "criminal mischief"] },

  { id: "assault", name: "Assault", category: "Violence", aliases: [] },
  { id: "aggravated-assault", name: "Aggravated Assault", category: "Violence", aliases: [] },
  { id: "battery", name: "Battery", category: "Violence", aliases: [] },
  { id: "domestic-violence", name: "Domestic Violence", category: "Violence", aliases: ["dv"] },
  { id: "menacing", name: "Menacing", category: "Violence", aliases: ["aggravated menacing"] },
  { id: "disorderly-conduct", name: "Disorderly Conduct", category: "Public Order", aliases: [] },
  { id: "resisting-arrest", name: "Resisting Arrest", category: "Public Order", aliases: [] },
  { id: "obstruction", name: "Obstruction", category: "Public Order", aliases: ["obstructing official business"] },

  { id: "dui", name: "DUI / OVI / DWI", category: "Driving", aliases: ["dui", "owi", "ovi", "dwi"] },
  { id: "driving-suspended", name: "Driving Under Suspension", category: "Driving", aliases: ["driving on suspended license"] },
  { id: "reckless-driving", name: "Reckless Driving", category: "Driving", aliases: [] },
  { id: "hit-skip", name: "Hit and Skip / Leaving Scene", category: "Driving", aliases: ["leaving the scene"] },

  { id: "drug-possession", name: "Drug Possession", category: "Drugs", aliases: ["possession of controlled substance", "controlled substance possession"] },
  { id: "drug-paraphernalia", name: "Drug Paraphernalia", category: "Drugs", aliases: ["paraphernalia"] },
  { id: "drug-trafficking", name: "Drug Trafficking", category: "Drugs", aliases: ["trafficking"] },
  { id: "drug-distribution", name: "Drug Distribution", category: "Drugs", aliases: ["distribution of controlled substance"] },
  { id: "marijuana-possession", name: "Marijuana Possession", category: "Drugs", aliases: ["cannabis possession"] },

  { id: "weapons-under-disability", name: "Weapons Under Disability", category: "Weapons", aliases: [] },
  { id: "unlawful-possession-weapon", name: "Unlawful Possession of a Weapon", category: "Weapons", aliases: [] },
  { id: "carrying-concealed-weapon", name: "Carrying Concealed Weapon", category: "Weapons", aliases: ["ccw offense"] },

  { id: "forgery", name: "Forgery", category: "Fraud", aliases: [] },
  { id: "identity-fraud", name: "Identity Fraud", category: "Fraud", aliases: ["identity theft"] },
  { id: "passing-bad-checks", name: "Passing Bad Checks", category: "Fraud", aliases: ["bad checks"] },
  { id: "falsification", name: "Falsification", category: "Fraud", aliases: ["false statement"] },
  { id: "unauthorized-use", name: "Unauthorized Use of Property", category: "Fraud", aliases: [] },

  { id: "public-intoxication", name: "Public Intoxication", category: "Public Order", aliases: [] },
  { id: "open-container", name: "Open Container", category: "Public Order", aliases: [] },
  { id: "inducing-panic", name: "Inducing Panic", category: "Public Order", aliases: [] },
  { id: "telephone-harassment", name: "Telephone Harassment", category: "Public Order", aliases: ["harassment"] },

  { id: "probation-violation", name: "Probation Violation", category: "Court / Compliance", aliases: [] },
  { id: "failure-to-appear", name: "Failure to Appear", category: "Court / Compliance", aliases: ["fta"] },
  { id: "contempt", name: "Contempt", category: "Court / Compliance", aliases: [] }
];


// Section-level reference labels (not a charge, degree, or eligibility determination).
const ohioChargeReferences=[
 {
  "id": "oh-2903.01",
  "state": "OH",
  "code": "2903.01",
  "name": "Aggravated murder",
  "category": "Homicide and assault",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2903.01",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2903.02",
  "state": "OH",
  "code": "2903.02",
  "name": "Murder",
  "category": "Homicide and assault",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2903.02",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2903.03",
  "state": "OH",
  "code": "2903.03",
  "name": "Voluntary manslaughter",
  "category": "Homicide and assault",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2903.03",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2903.04",
  "state": "OH",
  "code": "2903.04",
  "name": "Involuntary manslaughter",
  "category": "Homicide and assault",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2903.04",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2903.041",
  "state": "OH",
  "code": "2903.041",
  "name": "Reckless homicide",
  "category": "Homicide and assault",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2903.041",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2903.05",
  "state": "OH",
  "code": "2903.05",
  "name": "Negligent homicide",
  "category": "Homicide and assault",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2903.05",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2903.06",
  "state": "OH",
  "code": "2903.06",
  "name": "Aggravated vehicular homicide / vehicular homicide / vehicular manslaughter",
  "category": "Homicide and assault",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2903.06",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2903.08",
  "state": "OH",
  "code": "2903.08",
  "name": "Aggravated vehicular assault / vehicular assault",
  "category": "Homicide and assault",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2903.08",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2903.11",
  "state": "OH",
  "code": "2903.11",
  "name": "Felonious assault",
  "category": "Homicide and assault",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2903.11",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2903.12",
  "state": "OH",
  "code": "2903.12",
  "name": "Aggravated assault",
  "category": "Homicide and assault",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2903.12",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2903.13",
  "state": "OH",
  "code": "2903.13",
  "name": "Assault",
  "category": "Homicide and assault",
  "aliases": [
   "simple assault"
  ],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2903.13",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2903.14",
  "state": "OH",
  "code": "2903.14",
  "name": "Negligent assault",
  "category": "Homicide and assault",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2903.14",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2903.15",
  "state": "OH",
  "code": "2903.15",
  "name": "Permitting child abuse",
  "category": "Homicide and assault",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2903.15",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2903.16",
  "state": "OH",
  "code": "2903.16",
  "name": "Failing to provide for a functionally impaired person",
  "category": "Homicide and assault",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2903.16",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2903.18",
  "state": "OH",
  "code": "2903.18",
  "name": "Strangulation",
  "category": "Homicide and assault",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2903.18",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2903.21",
  "state": "OH",
  "code": "2903.21",
  "name": "Aggravated menacing",
  "category": "Homicide and assault",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2903.21",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2903.211",
  "state": "OH",
  "code": "2903.211",
  "name": "Menacing by stalking",
  "category": "Homicide and assault",
  "aliases": [
   "stalking"
  ],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2903.211",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2903.22",
  "state": "OH",
  "code": "2903.22",
  "name": "Menacing",
  "category": "Homicide and assault",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2903.22",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2905.01",
  "state": "OH",
  "code": "2905.01",
  "name": "Kidnapping",
  "category": "Kidnapping and extortion",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2905.01",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2905.02",
  "state": "OH",
  "code": "2905.02",
  "name": "Abduction",
  "category": "Kidnapping and extortion",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2905.02",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2905.03",
  "state": "OH",
  "code": "2905.03",
  "name": "Unlawful restraint",
  "category": "Kidnapping and extortion",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2905.03",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2905.05",
  "state": "OH",
  "code": "2905.05",
  "name": "Criminal child enticement",
  "category": "Kidnapping and extortion",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2905.05",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2905.11",
  "state": "OH",
  "code": "2905.11",
  "name": "Extortion and sexual extortion",
  "category": "Kidnapping and extortion",
  "aliases": [
   "blackmail"
  ],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2905.11",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2905.111",
  "state": "OH",
  "code": "2905.111",
  "name": "Sexual extortion",
  "category": "Kidnapping and extortion",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2905.111",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2905.12",
  "state": "OH",
  "code": "2905.12",
  "name": "Coercion",
  "category": "Kidnapping and extortion",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2905.12",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2905.22",
  "state": "OH",
  "code": "2905.22",
  "name": "Extortionate extension of credit",
  "category": "Kidnapping and extortion",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2905.22",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2905.32",
  "state": "OH",
  "code": "2905.32",
  "name": "Trafficking in persons",
  "category": "Kidnapping and extortion",
  "aliases": [
   "human trafficking"
  ],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2905.32",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2905.33",
  "state": "OH",
  "code": "2905.33",
  "name": "Unlawful conduct with respect to documents",
  "category": "Kidnapping and extortion",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2905.33",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2907.02",
  "state": "OH",
  "code": "2907.02",
  "name": "Rape",
  "category": "Sex offenses",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2907.02",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2907.03",
  "state": "OH",
  "code": "2907.03",
  "name": "Sexual battery",
  "category": "Sex offenses",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2907.03",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2907.04",
  "state": "OH",
  "code": "2907.04",
  "name": "Unlawful sexual conduct with minor",
  "category": "Sex offenses",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2907.04",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2907.05",
  "state": "OH",
  "code": "2907.05",
  "name": "Gross sexual imposition",
  "category": "Sex offenses",
  "aliases": [
   "GSI"
  ],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2907.05",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2907.06",
  "state": "OH",
  "code": "2907.06",
  "name": "Sexual imposition",
  "category": "Sex offenses",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2907.06",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2907.07",
  "state": "OH",
  "code": "2907.07",
  "name": "Importuning",
  "category": "Sex offenses",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2907.07",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2907.071",
  "state": "OH",
  "code": "2907.071",
  "name": "Grooming",
  "category": "Sex offenses",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2907.071",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2907.08",
  "state": "OH",
  "code": "2907.08",
  "name": "Voyeurism",
  "category": "Sex offenses",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2907.08",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2907.09",
  "state": "OH",
  "code": "2907.09",
  "name": "Public indecency",
  "category": "Sex offenses",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2907.09",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2907.13",
  "state": "OH",
  "code": "2907.13",
  "name": "Fraudulent assisted reproduction",
  "category": "Sex offenses",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2907.13",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2907.19",
  "state": "OH",
  "code": "2907.19",
  "name": "Commercial sexual exploitation of a minor",
  "category": "Sex offenses",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2907.19",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2907.21",
  "state": "OH",
  "code": "2907.21",
  "name": "Compelling prostitution",
  "category": "Sex offenses",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2907.21",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2907.22",
  "state": "OH",
  "code": "2907.22",
  "name": "Promoting prostitution",
  "category": "Sex offenses",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2907.22",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2909.02",
  "state": "OH",
  "code": "2909.02",
  "name": "Aggravated arson",
  "category": "Property damage",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2909.02",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2909.03",
  "state": "OH",
  "code": "2909.03",
  "name": "Arson",
  "category": "Property damage",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2909.03",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2909.04",
  "state": "OH",
  "code": "2909.04",
  "name": "Disrupting public services",
  "category": "Property damage",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2909.04",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2909.05",
  "state": "OH",
  "code": "2909.05",
  "name": "Vandalism",
  "category": "Property damage",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2909.05",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2909.06",
  "state": "OH",
  "code": "2909.06",
  "name": "Criminal damaging or endangering",
  "category": "Property damage",
  "aliases": [
   "criminal damaging"
  ],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2909.06",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2909.07",
  "state": "OH",
  "code": "2909.07",
  "name": "Criminal mischief",
  "category": "Property damage",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2909.07",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2909.08",
  "state": "OH",
  "code": "2909.08",
  "name": "Endangering aircraft or airport operations",
  "category": "Property damage",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2909.08",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2909.081",
  "state": "OH",
  "code": "2909.081",
  "name": "Interfering with operation of aircraft with laser",
  "category": "Property damage",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2909.081",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2909.09",
  "state": "OH",
  "code": "2909.09",
  "name": "Vehicular vandalism",
  "category": "Property damage",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2909.09",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2909.10",
  "state": "OH",
  "code": "2909.10",
  "name": "Railroad vandalism / criminal trespass / interference with operation of train",
  "category": "Property damage",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2909.10",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2909.101",
  "state": "OH",
  "code": "2909.101",
  "name": "Railroad grade crossing device vandalism",
  "category": "Property damage",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2909.101",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2909.22",
  "state": "OH",
  "code": "2909.22",
  "name": "Soliciting or providing support for act of terrorism",
  "category": "Property damage",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2909.22",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2909.23",
  "state": "OH",
  "code": "2909.23",
  "name": "Making terroristic threat",
  "category": "Property damage",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2909.23",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2909.24",
  "state": "OH",
  "code": "2909.24",
  "name": "Terrorism",
  "category": "Property damage",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2909.24",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2911.01",
  "state": "OH",
  "code": "2911.01",
  "name": "Aggravated robbery",
  "category": "Robbery burglary and trespass",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2911.01",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2911.02",
  "state": "OH",
  "code": "2911.02",
  "name": "Robbery",
  "category": "Robbery burglary and trespass",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2911.02",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2911.11",
  "state": "OH",
  "code": "2911.11",
  "name": "Aggravated burglary",
  "category": "Robbery burglary and trespass",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2911.11",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2911.12",
  "state": "OH",
  "code": "2911.12",
  "name": "Burglary",
  "category": "Robbery burglary and trespass",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2911.12",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2911.13",
  "state": "OH",
  "code": "2911.13",
  "name": "Breaking and entering",
  "category": "Robbery burglary and trespass",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2911.13",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2911.21",
  "state": "OH",
  "code": "2911.21",
  "name": "Criminal trespass",
  "category": "Robbery burglary and trespass",
  "aliases": [
   "trespassing"
  ],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2911.21",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2911.211",
  "state": "OH",
  "code": "2911.211",
  "name": "Aggravated trespass",
  "category": "Robbery burglary and trespass",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2911.211",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2911.23",
  "state": "OH",
  "code": "2911.23",
  "name": "Criminal trespass on place of public amusement",
  "category": "Robbery burglary and trespass",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2911.23",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2911.31",
  "state": "OH",
  "code": "2911.31",
  "name": "Safecracking",
  "category": "Robbery burglary and trespass",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2911.31",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2911.32",
  "state": "OH",
  "code": "2911.32",
  "name": "Tampering with coin machines",
  "category": "Robbery burglary and trespass",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2911.32",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2913.02",
  "state": "OH",
  "code": "2913.02",
  "name": "Theft",
  "category": "Theft and fraud",
  "aliases": [
   "petty theft",
   "petit theft",
   "grand theft",
   "shoplifting"
  ],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2913.02",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2913.021",
  "state": "OH",
  "code": "2913.021",
  "name": "Theft of mail",
  "category": "Theft and fraud",
  "aliases": [
   "mail theft"
  ],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2913.021",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2913.03",
  "state": "OH",
  "code": "2913.03",
  "name": "Unauthorized use of a vehicle",
  "category": "Theft and fraud",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2913.03",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2913.04",
  "state": "OH",
  "code": "2913.04",
  "name": "Unauthorized use of property",
  "category": "Theft and fraud",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2913.04",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2913.041",
  "state": "OH",
  "code": "2913.041",
  "name": "Possession or sale of unauthorized cable television device",
  "category": "Theft and fraud",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2913.041",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2913.05",
  "state": "OH",
  "code": "2913.05",
  "name": "Telecommunications fraud",
  "category": "Theft and fraud",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2913.05",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2913.06",
  "state": "OH",
  "code": "2913.06",
  "name": "Unlawful use of telecommunications device",
  "category": "Theft and fraud",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2913.06",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2913.07",
  "state": "OH",
  "code": "2913.07",
  "name": "Motion picture piracy",
  "category": "Theft and fraud",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2913.07",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2913.08",
  "state": "OH",
  "code": "2913.08",
  "name": "Organized theft of retail property",
  "category": "Theft and fraud",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2913.08",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2913.11",
  "state": "OH",
  "code": "2913.11",
  "name": "Passing bad checks",
  "category": "Theft and fraud",
  "aliases": [
   "bad checks"
  ],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2913.11",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2913.21",
  "state": "OH",
  "code": "2913.21",
  "name": "Misuse of credit cards",
  "category": "Theft and fraud",
  "aliases": [
   "credit card fraud"
  ],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2913.21",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2913.30",
  "state": "OH",
  "code": "2913.30",
  "name": "Counterfeiting",
  "category": "Theft and fraud",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2913.30",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2913.31",
  "state": "OH",
  "code": "2913.31",
  "name": "Forgery",
  "category": "Theft and fraud",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2913.31",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2913.32",
  "state": "OH",
  "code": "2913.32",
  "name": "Criminal simulation",
  "category": "Theft and fraud",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2913.32",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2913.33",
  "state": "OH",
  "code": "2913.33",
  "name": "Making or using slugs",
  "category": "Theft and fraud",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2913.33",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2913.34",
  "state": "OH",
  "code": "2913.34",
  "name": "Trademark counterfeiting",
  "category": "Theft and fraud",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2913.34",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2913.40",
  "state": "OH",
  "code": "2913.40",
  "name": "Medicaid fraud",
  "category": "Theft and fraud",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2913.40",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2913.401",
  "state": "OH",
  "code": "2913.401",
  "name": "Medicaid eligibility fraud",
  "category": "Theft and fraud",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2913.401",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2913.41",
  "state": "OH",
  "code": "2913.41",
  "name": "Defrauding a rental agency or hostelry",
  "category": "Theft and fraud",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2913.41",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2913.42",
  "state": "OH",
  "code": "2913.42",
  "name": "Tampering with records",
  "category": "Theft and fraud",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2913.42",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2913.421",
  "state": "OH",
  "code": "2913.421",
  "name": "Illegally transmitting multiple commercial electronic mail messages",
  "category": "Theft and fraud",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2913.421",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2913.43",
  "state": "OH",
  "code": "2913.43",
  "name": "Securing writings by deception",
  "category": "Theft and fraud",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2913.43",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2913.47",
  "state": "OH",
  "code": "2913.47",
  "name": "Insurance fraud",
  "category": "Theft and fraud",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2913.47",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2913.49",
  "state": "OH",
  "code": "2913.49",
  "name": "Identity fraud",
  "category": "Theft and fraud",
  "aliases": [
   "identity theft"
  ],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2913.49",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2913.51",
  "state": "OH",
  "code": "2913.51",
  "name": "Receiving stolen property",
  "category": "Theft and fraud",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2913.51",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2915.02",
  "state": "OH",
  "code": "2915.02",
  "name": "Gambling",
  "category": "Gambling",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2915.02",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2915.03",
  "state": "OH",
  "code": "2915.03",
  "name": "Operating a gambling house",
  "category": "Gambling",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2915.03",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2915.04",
  "state": "OH",
  "code": "2915.04",
  "name": "Public gaming",
  "category": "Gambling",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2915.04",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2915.05",
  "state": "OH",
  "code": "2915.05",
  "name": "Cheating / corrupting sports",
  "category": "Gambling",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2915.05",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2915.06",
  "state": "OH",
  "code": "2915.06",
  "name": "Skill-based amusement machine prohibited conduct",
  "category": "Gambling",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2915.06",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2915.07",
  "state": "OH",
  "code": "2915.07",
  "name": "Conducting illegal bingo",
  "category": "Gambling",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2915.07",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2915.081",
  "state": "OH",
  "code": "2915.081",
  "name": "Illegally operating as distributor of bingo supplies",
  "category": "Gambling",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2915.081",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2915.082",
  "state": "OH",
  "code": "2915.082",
  "name": "Illegally operating as manufacturer of bingo supplies",
  "category": "Gambling",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2915.082",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2915.09",
  "state": "OH",
  "code": "2915.09",
  "name": "Illegally conducting bingo game",
  "category": "Gambling",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2915.09",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2915.091",
  "state": "OH",
  "code": "2915.091",
  "name": "Illegally conducting instant bingo",
  "category": "Gambling",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2915.091",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2915.092",
  "state": "OH",
  "code": "2915.092",
  "name": "Illegal conduct of raffle",
  "category": "Gambling",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2915.092",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2915.14",
  "state": "OH",
  "code": "2915.14",
  "name": "Illegal electronic instant bingo conduct",
  "category": "Gambling",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2915.14",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2917.01",
  "state": "OH",
  "code": "2917.01",
  "name": "Inciting to violence",
  "category": "Public peace",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2917.01",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2917.02",
  "state": "OH",
  "code": "2917.02",
  "name": "Aggravated riot",
  "category": "Public peace",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2917.02",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2917.03",
  "state": "OH",
  "code": "2917.03",
  "name": "Riot",
  "category": "Public peace",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2917.03",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2917.04",
  "state": "OH",
  "code": "2917.04",
  "name": "Failure to disperse",
  "category": "Public peace",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2917.04",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2917.11",
  "state": "OH",
  "code": "2917.11",
  "name": "Disorderly conduct",
  "category": "Public peace",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2917.11",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2917.12",
  "state": "OH",
  "code": "2917.12",
  "name": "Disturbing a lawful meeting",
  "category": "Public peace",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2917.12",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2917.13",
  "state": "OH",
  "code": "2917.13",
  "name": "Misconduct at emergency",
  "category": "Public peace",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2917.13",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2917.14",
  "state": "OH",
  "code": "2917.14",
  "name": "Unlawfully impeding public passage of an emergency service responder",
  "category": "Public peace",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2917.14",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2917.21",
  "state": "OH",
  "code": "2917.21",
  "name": "Telecommunications harassment",
  "category": "Public peace",
  "aliases": [
   "telephone harassment"
  ],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2917.21",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2917.211",
  "state": "OH",
  "code": "2917.211",
  "name": "Dissemination of image of another person",
  "category": "Public peace",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2917.211",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2917.31",
  "state": "OH",
  "code": "2917.31",
  "name": "Inducing panic",
  "category": "Public peace",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2917.31",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2917.32",
  "state": "OH",
  "code": "2917.32",
  "name": "Making false alarms",
  "category": "Public peace",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2917.32",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2917.321",
  "state": "OH",
  "code": "2917.321",
  "name": "Swatting",
  "category": "Public peace",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2917.321",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2917.33",
  "state": "OH",
  "code": "2917.33",
  "name": "Unlawful possession or use of a hoax weapon of mass destruction",
  "category": "Public peace",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2917.33",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2917.41",
  "state": "OH",
  "code": "2917.41",
  "name": "Misconduct involving public transportation system",
  "category": "Public peace",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2917.41",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2917.46",
  "state": "OH",
  "code": "2917.46",
  "name": "Unauthorized use of a block parent symbol",
  "category": "Public peace",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2917.46",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2917.47",
  "state": "OH",
  "code": "2917.47",
  "name": "Improperly handling infectious agents",
  "category": "Public peace",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2917.47",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2919.01",
  "state": "OH",
  "code": "2919.01",
  "name": "Bigamy",
  "category": "Family",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2919.01",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2919.21",
  "state": "OH",
  "code": "2919.21",
  "name": "Nonsupport or contributing to nonsupport of dependents",
  "category": "Family",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2919.21",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2919.22",
  "state": "OH",
  "code": "2919.22",
  "name": "Endangering children",
  "category": "Family",
  "aliases": [
   "child endangerment"
  ],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2919.22",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2919.222",
  "state": "OH",
  "code": "2919.222",
  "name": "Parental education neglect",
  "category": "Family",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2919.222",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2919.224",
  "state": "OH",
  "code": "2919.224",
  "name": "Misrepresentation relating to provision of child care",
  "category": "Family",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2919.224",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2919.23",
  "state": "OH",
  "code": "2919.23",
  "name": "Interference with custody",
  "category": "Family",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2919.23",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2919.24",
  "state": "OH",
  "code": "2919.24",
  "name": "Contributing to unruliness or delinquency of a child",
  "category": "Family",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2919.24",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2919.25",
  "state": "OH",
  "code": "2919.25",
  "name": "Domestic violence",
  "category": "Family",
  "aliases": [
   "DV"
  ],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2919.25",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2919.27",
  "state": "OH",
  "code": "2919.27",
  "name": "Violating protection order",
  "category": "Family",
  "aliases": [
   "violation of order of protection",
   "restraining order violation"
  ],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2919.27",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2921.02",
  "state": "OH",
  "code": "2921.02",
  "name": "Bribery",
  "category": "Justice and public administration",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2921.02",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2921.03",
  "state": "OH",
  "code": "2921.03",
  "name": "Intimidation",
  "category": "Justice and public administration",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2921.03",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2921.04",
  "state": "OH",
  "code": "2921.04",
  "name": "Intimidation of attorney victim or witness",
  "category": "Justice and public administration",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2921.04",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2921.05",
  "state": "OH",
  "code": "2921.05",
  "name": "Retaliation",
  "category": "Justice and public administration",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2921.05",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2921.11",
  "state": "OH",
  "code": "2921.11",
  "name": "Perjury",
  "category": "Justice and public administration",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2921.11",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2921.12",
  "state": "OH",
  "code": "2921.12",
  "name": "Tampering with evidence",
  "category": "Justice and public administration",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2921.12",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2921.13",
  "state": "OH",
  "code": "2921.13",
  "name": "Falsification",
  "category": "Justice and public administration",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2921.13",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2921.14",
  "state": "OH",
  "code": "2921.14",
  "name": "Making or causing false report of child abuse or neglect",
  "category": "Justice and public administration",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2921.14",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2921.15",
  "state": "OH",
  "code": "2921.15",
  "name": "Making false allegation of peace officer misconduct",
  "category": "Justice and public administration",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2921.15",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2921.21",
  "state": "OH",
  "code": "2921.21",
  "name": "Compounding a crime",
  "category": "Justice and public administration",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2921.21",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2921.22",
  "state": "OH",
  "code": "2921.22",
  "name": "Failure to report a crime or knowledge of a death or burn injury",
  "category": "Justice and public administration",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2921.22",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2921.23",
  "state": "OH",
  "code": "2921.23",
  "name": "Failure to aid a law enforcement officer",
  "category": "Justice and public administration",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2921.23",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2921.24",
  "state": "OH",
  "code": "2921.24",
  "name": "Disclosure of confidential information",
  "category": "Justice and public administration",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2921.24",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2921.29",
  "state": "OH",
  "code": "2921.29",
  "name": "Failure to disclose personal information",
  "category": "Justice and public administration",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2921.29",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2921.31",
  "state": "OH",
  "code": "2921.31",
  "name": "Obstructing official business",
  "category": "Justice and public administration",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2921.31",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2921.32",
  "state": "OH",
  "code": "2921.32",
  "name": "Obstructing justice",
  "category": "Justice and public administration",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2921.32",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2921.321",
  "state": "OH",
  "code": "2921.321",
  "name": "Assaulting or harassing police dog or horse or service dog",
  "category": "Justice and public administration",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2921.321",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2921.33",
  "state": "OH",
  "code": "2921.33",
  "name": "Resisting arrest",
  "category": "Justice and public administration",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2921.33",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2921.331",
  "state": "OH",
  "code": "2921.331",
  "name": "Failure to comply with order or signal of police officer",
  "category": "Justice and public administration",
  "aliases": [
   "fleeing",
   "eluding"
  ],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2921.331",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2921.34",
  "state": "OH",
  "code": "2921.34",
  "name": "Escape",
  "category": "Justice and public administration",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2921.34",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2921.35",
  "state": "OH",
  "code": "2921.35",
  "name": "Aiding escape or resistance to lawful authority",
  "category": "Justice and public administration",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2921.35",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2921.36",
  "state": "OH",
  "code": "2921.36",
  "name": "Illegal conveyance of prohibited items onto grounds of detention facility",
  "category": "Justice and public administration",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2921.36",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2921.38",
  "state": "OH",
  "code": "2921.38",
  "name": "Harassment by inmate",
  "category": "Justice and public administration",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2921.38",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2921.41",
  "state": "OH",
  "code": "2921.41",
  "name": "Theft in office",
  "category": "Justice and public administration",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2921.41",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2921.42",
  "state": "OH",
  "code": "2921.42",
  "name": "Having an unlawful interest in a public contract",
  "category": "Justice and public administration",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2921.42",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2921.43",
  "state": "OH",
  "code": "2921.43",
  "name": "Soliciting or accepting improper compensation",
  "category": "Justice and public administration",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2921.43",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2921.44",
  "state": "OH",
  "code": "2921.44",
  "name": "Dereliction of duty",
  "category": "Justice and public administration",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2921.44",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2921.45",
  "state": "OH",
  "code": "2921.45",
  "name": "Interfering with civil rights",
  "category": "Justice and public administration",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2921.45",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2921.51",
  "state": "OH",
  "code": "2921.51",
  "name": "Impersonation of peace officer or private police officer",
  "category": "Justice and public administration",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2921.51",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2921.52",
  "state": "OH",
  "code": "2921.52",
  "name": "Using sham legal process",
  "category": "Justice and public administration",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2921.52",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2923.01",
  "state": "OH",
  "code": "2923.01",
  "name": "Conspiracy",
  "category": "Weapons and complicity",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2923.01",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2923.02",
  "state": "OH",
  "code": "2923.02",
  "name": "Attempt to commit an offense",
  "category": "Weapons and complicity",
  "aliases": [
   "attempt"
  ],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2923.02",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2923.03",
  "state": "OH",
  "code": "2923.03",
  "name": "Complicity",
  "category": "Weapons and complicity",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2923.03",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2923.12",
  "state": "OH",
  "code": "2923.12",
  "name": "Carrying concealed weapons",
  "category": "Weapons and complicity",
  "aliases": [
   "CCW"
  ],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2923.12",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2923.121",
  "state": "OH",
  "code": "2923.121",
  "name": "Possession of firearm in beer liquor permit premises",
  "category": "Weapons and complicity",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2923.121",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2923.122",
  "state": "OH",
  "code": "2923.122",
  "name": "Illegal conveyance or possession of deadly weapon in school safety zone",
  "category": "Weapons and complicity",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2923.122",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2923.123",
  "state": "OH",
  "code": "2923.123",
  "name": "Illegal conveyance or possession of deadly weapon in courthouse",
  "category": "Weapons and complicity",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2923.123",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2923.1211",
  "state": "OH",
  "code": "2923.1211",
  "name": "Falsification of concealed handgun license",
  "category": "Weapons and complicity",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2923.1211",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2923.13",
  "state": "OH",
  "code": "2923.13",
  "name": "Having weapons while under disability",
  "category": "Weapons and complicity",
  "aliases": [
   "weapons under disability"
  ],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2923.13",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2923.131",
  "state": "OH",
  "code": "2923.131",
  "name": "Possession of deadly weapon while under detention",
  "category": "Weapons and complicity",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2923.131",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2923.132",
  "state": "OH",
  "code": "2923.132",
  "name": "Use of firearm or dangerous ordnance by violent career criminal",
  "category": "Weapons and complicity",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2923.132",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2923.15",
  "state": "OH",
  "code": "2923.15",
  "name": "Using weapons while intoxicated",
  "category": "Weapons and complicity",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2923.15",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2923.16",
  "state": "OH",
  "code": "2923.16",
  "name": "Improperly handling firearms in a motor vehicle",
  "category": "Weapons and complicity",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2923.16",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2923.161",
  "state": "OH",
  "code": "2923.161",
  "name": "Improperly discharging firearm at or into a habitation",
  "category": "Weapons and complicity",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2923.161",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2923.162",
  "state": "OH",
  "code": "2923.162",
  "name": "Discharge of firearm on or near prohibited premises",
  "category": "Weapons and complicity",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2923.162",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2923.17",
  "state": "OH",
  "code": "2923.17",
  "name": "Unlawful possession of dangerous ordnance",
  "category": "Weapons and complicity",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2923.17",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2923.19",
  "state": "OH",
  "code": "2923.19",
  "name": "Failure to secure dangerous ordnance",
  "category": "Weapons and complicity",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2923.19",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2923.20",
  "state": "OH",
  "code": "2923.20",
  "name": "Unlawful transaction in weapons",
  "category": "Weapons and complicity",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2923.20",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2923.201",
  "state": "OH",
  "code": "2923.201",
  "name": "Possessing a defaced firearm",
  "category": "Weapons and complicity",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2923.201",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2923.21",
  "state": "OH",
  "code": "2923.21",
  "name": "Improperly furnishing firearms to minor",
  "category": "Weapons and complicity",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2923.21",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2923.211",
  "state": "OH",
  "code": "2923.211",
  "name": "Underage purchase of firearm or handgun",
  "category": "Weapons and complicity",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2923.211",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2923.32",
  "state": "OH",
  "code": "2923.32",
  "name": "Engaging in pattern of corrupt activity",
  "category": "Weapons and complicity",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2923.32",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2923.42",
  "state": "OH",
  "code": "2923.42",
  "name": "Participating in criminal gang",
  "category": "Weapons and complicity",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2923.42",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2925.02",
  "state": "OH",
  "code": "2925.02",
  "name": "Corrupting another with drugs",
  "category": "Drug offenses",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2925.02",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2925.03",
  "state": "OH",
  "code": "2925.03",
  "name": "Trafficking / aggravated trafficking in drugs",
  "category": "Drug offenses",
  "aliases": [
   "drug trafficking",
   "drug distribution"
  ],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2925.03",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2925.04",
  "state": "OH",
  "code": "2925.04",
  "name": "Illegal manufacture of drugs / illegal cultivation of marihuana",
  "category": "Drug offenses",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2925.04",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2925.041",
  "state": "OH",
  "code": "2925.041",
  "name": "Illegal assembly or possession of chemicals for manufacture of drugs",
  "category": "Drug offenses",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2925.041",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2925.05",
  "state": "OH",
  "code": "2925.05",
  "name": "Funding / aggravated funding of drug trafficking",
  "category": "Drug offenses",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2925.05",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2925.06",
  "state": "OH",
  "code": "2925.06",
  "name": "Illegal administration or distribution of anabolic steroids",
  "category": "Drug offenses",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2925.06",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2925.09",
  "state": "OH",
  "code": "2925.09",
  "name": "Unapproved drugs / dangerous drug offenses involving livestock",
  "category": "Drug offenses",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2925.09",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2925.11",
  "state": "OH",
  "code": "2925.11",
  "name": "Possession of controlled substances",
  "category": "Drug offenses",
  "aliases": [
   "possession of drugs",
   "drug possession",
   "drug abuse",
   "marihuana possession",
   "marijuana possession"
  ],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2925.11",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2925.12",
  "state": "OH",
  "code": "2925.12",
  "name": "Possessing drug abuse instruments",
  "category": "Drug offenses",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2925.12",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2925.13",
  "state": "OH",
  "code": "2925.13",
  "name": "Permitting drug abuse",
  "category": "Drug offenses",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2925.13",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2925.14",
  "state": "OH",
  "code": "2925.14",
  "name": "Illegal use or possession of drug paraphernalia",
  "category": "Drug offenses",
  "aliases": [
   "drug paraphernalia"
  ],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2925.14",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2925.22",
  "state": "OH",
  "code": "2925.22",
  "name": "Deception to obtain a dangerous drug",
  "category": "Drug offenses",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2925.22",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2925.23",
  "state": "OH",
  "code": "2925.23",
  "name": "Illegal processing of drug documents",
  "category": "Drug offenses",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2925.23",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2925.24",
  "state": "OH",
  "code": "2925.24",
  "name": "Tampering with drugs",
  "category": "Drug offenses",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2925.24",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2925.31",
  "state": "OH",
  "code": "2925.31",
  "name": "Abusing harmful intoxicants",
  "category": "Drug offenses",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2925.31",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2925.32",
  "state": "OH",
  "code": "2925.32",
  "name": "Trafficking in harmful intoxicants",
  "category": "Drug offenses",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2925.32",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2925.33",
  "state": "OH",
  "code": "2925.33",
  "name": "Possessing nitrous oxide in motor vehicle",
  "category": "Drug offenses",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2925.33",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2925.34",
  "state": "OH",
  "code": "2925.34",
  "name": "Sale of pure caffeine product",
  "category": "Drug offenses",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2925.34",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2925.36",
  "state": "OH",
  "code": "2925.36",
  "name": "Illegal dispensing of drug samples",
  "category": "Drug offenses",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2925.36",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2925.37",
  "state": "OH",
  "code": "2925.37",
  "name": "Counterfeit controlled substance offenses",
  "category": "Drug offenses",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2925.37",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2925.55",
  "state": "OH",
  "code": "2925.55",
  "name": "Unlawful purchase of pseudoephedrine or ephedrine product",
  "category": "Drug offenses",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2925.55",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2925.56",
  "state": "OH",
  "code": "2925.56",
  "name": "Unlawful sale of pseudoephedrine or ephedrine product",
  "category": "Drug offenses",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2925.56",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2925.57",
  "state": "OH",
  "code": "2925.57",
  "name": "Illegal pseudoephedrine or ephedrine product transaction scan",
  "category": "Drug offenses",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2925.57",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2925.58",
  "state": "OH",
  "code": "2925.58",
  "name": "Unlawful sale of pseudoephedrine product to minor",
  "category": "Drug offenses",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2925.58",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2925.62",
  "state": "OH",
  "code": "2925.62",
  "name": "Illegally selling dextromethorphan",
  "category": "Drug offenses",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2925.62",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2927.03",
  "state": "OH",
  "code": "2927.03",
  "name": "Injure intimidate or interfere with fair housing rights",
  "category": "Miscellaneous",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2927.03",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2927.11",
  "state": "OH",
  "code": "2927.11",
  "name": "Desecration",
  "category": "Miscellaneous",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2927.11",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2927.12",
  "state": "OH",
  "code": "2927.12",
  "name": "Ethnic intimidation",
  "category": "Miscellaneous",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2927.12",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2927.13",
  "state": "OH",
  "code": "2927.13",
  "name": "Selling or donating contaminated blood",
  "category": "Miscellaneous",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2927.13",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2927.17",
  "state": "OH",
  "code": "2927.17",
  "name": "Advertising of massage services",
  "category": "Miscellaneous",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2927.17",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2927.21",
  "state": "OH",
  "code": "2927.21",
  "name": "Receiving proceeds of an offense subject to forfeiture proceedings",
  "category": "Miscellaneous",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2927.21",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2927.22",
  "state": "OH",
  "code": "2927.22",
  "name": "Soliciting or accepting a fee to remove or modify criminal record information",
  "category": "Miscellaneous",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2927.22",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2927.24",
  "state": "OH",
  "code": "2927.24",
  "name": "Contaminating substance for human consumption or use",
  "category": "Miscellaneous",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2927.24",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-2927.27",
  "state": "OH",
  "code": "2927.27",
  "name": "Illegal bail bond agent practices",
  "category": "Miscellaneous",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-2927.27",
  "referenceEdition": "2025 Ohio Revised Code section index",
  "kind": "statute_reference"
 },
 {
  "id": "oh-4511.19",
  "state": "OH",
  "code": "4511.19",
  "name": "Operating vehicle under the influence",
  "category": "Traffic and vehicle",
  "aliases": [
   "OVI",
   "DUI",
   "DWI"
  ],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-4511.19",
  "referenceEdition": "Ohio BMV 2025 reference",
  "kind": "statute_reference"
 },
 {
  "id": "oh-4510.11",
  "state": "OH",
  "code": "4510.11",
  "name": "Driving under suspension",
  "category": "Traffic and vehicle",
  "aliases": [
   "DUS"
  ],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-4510.11",
  "referenceEdition": "Ohio BMV 2025 reference",
  "kind": "statute_reference"
 },
 {
  "id": "oh-4510.12",
  "state": "OH",
  "code": "4510.12",
  "name": "Driving without a valid license",
  "category": "Traffic and vehicle",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-4510.12",
  "referenceEdition": "Ohio BMV 2025 reference",
  "kind": "statute_reference"
 },
 {
  "id": "oh-4510.16",
  "state": "OH",
  "code": "4510.16",
  "name": "Driving under financial responsibility suspension",
  "category": "Traffic and vehicle",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-4510.16",
  "referenceEdition": "Ohio BMV 2025 reference",
  "kind": "statute_reference"
 },
 {
  "id": "oh-4511.21",
  "state": "OH",
  "code": "4511.21",
  "name": "Speeding",
  "category": "Traffic and vehicle",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-4511.21",
  "referenceEdition": "Ohio BMV 2025 reference",
  "kind": "statute_reference"
 },
 {
  "id": "oh-4511.22",
  "state": "OH",
  "code": "4511.22",
  "name": "Slow speed",
  "category": "Traffic and vehicle",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-4511.22",
  "referenceEdition": "Ohio BMV 2025 reference",
  "kind": "statute_reference"
 },
 {
  "id": "oh-4511.12",
  "state": "OH",
  "code": "4511.12",
  "name": "Traffic control devices",
  "category": "Traffic and vehicle",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-4511.12",
  "referenceEdition": "Ohio BMV 2025 reference",
  "kind": "statute_reference"
 },
 {
  "id": "oh-4511.13",
  "state": "OH",
  "code": "4511.13",
  "name": "Traffic control lights",
  "category": "Traffic and vehicle",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-4511.13",
  "referenceEdition": "Ohio BMV 2025 reference",
  "kind": "statute_reference"
 },
 {
  "id": "oh-4511.33",
  "state": "OH",
  "code": "4511.33",
  "name": "Marked lanes violation",
  "category": "Traffic and vehicle",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-4511.33",
  "referenceEdition": "Ohio BMV 2025 reference",
  "kind": "statute_reference"
 },
 {
  "id": "oh-4511.34",
  "state": "OH",
  "code": "4511.34",
  "name": "Following too closely",
  "category": "Traffic and vehicle",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-4511.34",
  "referenceEdition": "Ohio BMV 2025 reference",
  "kind": "statute_reference"
 },
 {
  "id": "oh-4511.39",
  "state": "OH",
  "code": "4511.39",
  "name": "Turn signals violation",
  "category": "Traffic and vehicle",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-4511.39",
  "referenceEdition": "Ohio BMV 2025 reference",
  "kind": "statute_reference"
 },
 {
  "id": "oh-4511.43",
  "state": "OH",
  "code": "4511.43",
  "name": "Stop sign violation",
  "category": "Traffic and vehicle",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-4511.43",
  "referenceEdition": "Ohio BMV 2025 reference",
  "kind": "statute_reference"
 },
 {
  "id": "oh-4511.75",
  "state": "OH",
  "code": "4511.75",
  "name": "Failure to stop for school bus",
  "category": "Traffic and vehicle",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-4511.75",
  "referenceEdition": "Ohio BMV 2025 reference",
  "kind": "statute_reference"
 },
 {
  "id": "oh-4511.81",
  "state": "OH",
  "code": "4511.81",
  "name": "Child restraint violation",
  "category": "Traffic and vehicle",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-4511.81",
  "referenceEdition": "Ohio BMV 2025 reference",
  "kind": "statute_reference"
 },
 {
  "id": "oh-4549.02",
  "state": "OH",
  "code": "4549.02",
  "name": "Failure to stop after accident",
  "category": "Traffic and vehicle",
  "aliases": [
   "hit skip",
   "leaving scene"
  ],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-4549.02",
  "referenceEdition": "Ohio BMV 2025 reference",
  "kind": "statute_reference"
 },
 {
  "id": "oh-4549.021",
  "state": "OH",
  "code": "4549.021",
  "name": "Failure to stop after accident on property other than public road",
  "category": "Traffic and vehicle",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-4549.021",
  "referenceEdition": "Ohio BMV 2025 reference",
  "kind": "statute_reference"
 },
 {
  "id": "oh-4549.03",
  "state": "OH",
  "code": "4549.03",
  "name": "Failure to stop after accident involving property adjacent to highway",
  "category": "Traffic and vehicle",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-4549.03",
  "referenceEdition": "Ohio BMV 2025 reference",
  "kind": "statute_reference"
 },
 {
  "id": "oh-4511.201",
  "state": "OH",
  "code": "4511.201",
  "name": "Willful or wanton disregard of safety on private property",
  "category": "Traffic and vehicle",
  "aliases": [],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-4511.201",
  "referenceEdition": "Ohio BMV 2025 reference",
  "kind": "statute_reference"
 },
 {
  "id": "oh-4511.251",
  "state": "OH",
  "code": "4511.251",
  "name": "Street racing",
  "category": "Traffic and vehicle",
  "aliases": [
   "drag racing"
  ],
  "source": "https://codes.ohio.gov/ohio-revised-code/section-4511.251",
  "referenceEdition": "Ohio BMV 2025 reference",
  "kind": "statute_reference"
 }
];
const additionalChargeTerms=[
 {
  "id": "general-murder",
  "name": "Murder",
  "category": "Violence and personal offenses",
  "aliases": [],
  "kind": "general_term",
  "source": null
 },
 {
  "id": "general-manslaughter",
  "name": "Manslaughter",
  "category": "Violence and personal offenses",
  "aliases": [],
  "kind": "general_term",
  "source": null
 },
 {
  "id": "general-homicide",
  "name": "Homicide",
  "category": "Violence and personal offenses",
  "aliases": [],
  "kind": "general_term",
  "source": null
 },
 {
  "id": "general-negligent-homicide",
  "name": "Negligent homicide",
  "category": "Violence and personal offenses",
  "aliases": [],
  "kind": "general_term",
  "source": null
 },
 {
  "id": "general-vehicular-homicide",
  "name": "Vehicular homicide",
  "category": "Violence and personal offenses",
  "aliases": [],
  "kind": "general_term",
  "source": null
 },
 {
  "id": "general-kidnapping",
  "name": "Kidnapping",
  "category": "Violence and personal offenses",
  "aliases": [],
  "kind": "general_term",
  "source": null
 },
 {
  "id": "general-abduction",
  "name": "Abduction",
  "category": "Violence and personal offenses",
  "aliases": [],
  "kind": "general_term",
  "source": null
 },
 {
  "id": "general-false-imprisonment",
  "name": "False imprisonment",
  "category": "Violence and personal offenses",
  "aliases": [],
  "kind": "general_term",
  "source": null
 },
 {
  "id": "general-stalking",
  "name": "Stalking",
  "category": "Violence and personal offenses",
  "aliases": [],
  "kind": "general_term",
  "source": null
 },
 {
  "id": "general-harassment",
  "name": "Harassment",
  "category": "Violence and personal offenses",
  "aliases": [],
  "kind": "general_term",
  "source": null
 },
 {
  "id": "general-threats",
  "name": "Threats",
  "category": "Violence and personal offenses",
  "aliases": [],
  "kind": "general_term",
  "source": null
 },
 {
  "id": "general-intimidation",
  "name": "Intimidation",
  "category": "Violence and personal offenses",
  "aliases": [],
  "kind": "general_term",
  "source": null
 },
 {
  "id": "general-strangulation",
  "name": "Strangulation",
  "category": "Violence and personal offenses",
  "aliases": [],
  "kind": "general_term",
  "source": null
 },
 {
  "id": "general-child-abuse",
  "name": "Child abuse",
  "category": "Violence and personal offenses",
  "aliases": [],
  "kind": "general_term",
  "source": null
 },
 {
  "id": "general-elder-abuse",
  "name": "Elder abuse",
  "category": "Violence and personal offenses",
  "aliases": [],
  "kind": "general_term",
  "source": null
 },
 {
  "id": "general-human-trafficking",
  "name": "Human trafficking",
  "category": "Violence and personal offenses",
  "aliases": [],
  "kind": "general_term",
  "source": null
 },
 {
  "id": "general-extortion",
  "name": "Extortion",
  "category": "Violence and personal offenses",
  "aliases": [],
  "kind": "general_term",
  "source": null
 },
 {
  "id": "general-blackmail",
  "name": "Blackmail",
  "category": "Violence and personal offenses",
  "aliases": [],
  "kind": "general_term",
  "source": null
 },
 {
  "id": "general-coercion",
  "name": "Coercion",
  "category": "Violence and personal offenses",
  "aliases": [],
  "kind": "general_term",
  "source": null
 },
 {
  "id": "general-arson",
  "name": "Arson",
  "category": "Property and financial offenses",
  "aliases": [],
  "kind": "general_term",
  "source": null
 },
 {
  "id": "general-aggravated-arson",
  "name": "Aggravated arson",
  "category": "Property and financial offenses",
  "aliases": [],
  "kind": "general_term",
  "source": null
 },
 {
  "id": "general-motor-vehicle-theft",
  "name": "Motor vehicle theft",
  "category": "Property and financial offenses",
  "aliases": [],
  "kind": "general_term",
  "source": null
 },
 {
  "id": "general-auto-theft",
  "name": "Auto theft",
  "category": "Property and financial offenses",
  "aliases": [],
  "kind": "general_term",
  "source": null
 },
 {
  "id": "general-larceny",
  "name": "Larceny",
  "category": "Property and financial offenses",
  "aliases": [],
  "kind": "general_term",
  "source": null
 },
 {
  "id": "general-petty-theft",
  "name": "Petty theft",
  "category": "Property and financial offenses",
  "aliases": [],
  "kind": "general_term",
  "source": null
 },
 {
  "id": "general-grand-theft",
  "name": "Grand theft",
  "category": "Property and financial offenses",
  "aliases": [],
  "kind": "general_term",
  "source": null
 },
 {
  "id": "general-embezzlement",
  "name": "Embezzlement",
  "category": "Property and financial offenses",
  "aliases": [],
  "kind": "general_term",
  "source": null
 },
 {
  "id": "general-counterfeiting",
  "name": "Counterfeiting",
  "category": "Property and financial offenses",
  "aliases": [],
  "kind": "general_term",
  "source": null
 },
 {
  "id": "general-credit-card-fraud",
  "name": "Credit card fraud",
  "category": "Property and financial offenses",
  "aliases": [],
  "kind": "general_term",
  "source": null
 },
 {
  "id": "general-bank-fraud",
  "name": "Bank fraud",
  "category": "Property and financial offenses",
  "aliases": [],
  "kind": "general_term",
  "source": null
 },
 {
  "id": "general-mail-fraud",
  "name": "Mail fraud",
  "category": "Property and financial offenses",
  "aliases": [],
  "kind": "general_term",
  "source": null
 },
 {
  "id": "general-wire-fraud",
  "name": "Wire fraud",
  "category": "Property and financial offenses",
  "aliases": [],
  "kind": "general_term",
  "source": null
 },
 {
  "id": "general-insurance-fraud",
  "name": "Insurance fraud",
  "category": "Property and financial offenses",
  "aliases": [],
  "kind": "general_term",
  "source": null
 },
 {
  "id": "general-tax-fraud",
  "name": "Tax fraud",
  "category": "Property and financial offenses",
  "aliases": [],
  "kind": "general_term",
  "source": null
 },
 {
  "id": "general-tax-evasion",
  "name": "Tax evasion",
  "category": "Property and financial offenses",
  "aliases": [],
  "kind": "general_term",
  "source": null
 },
 {
  "id": "general-welfare-fraud",
  "name": "Welfare fraud",
  "category": "Property and financial offenses",
  "aliases": [],
  "kind": "general_term",
  "source": null
 },
 {
  "id": "general-medicaid-fraud",
  "name": "Medicaid fraud",
  "category": "Property and financial offenses",
  "aliases": [],
  "kind": "general_term",
  "source": null
 },
 {
  "id": "general-mortgage-fraud",
  "name": "Mortgage fraud",
  "category": "Property and financial offenses",
  "aliases": [],
  "kind": "general_term",
  "source": null
 },
 {
  "id": "general-computer-fraud",
  "name": "Computer fraud",
  "category": "Property and financial offenses",
  "aliases": [],
  "kind": "general_term",
  "source": null
 },
 {
  "id": "general-hacking",
  "name": "Hacking",
  "category": "Property and financial offenses",
  "aliases": [],
  "kind": "general_term",
  "source": null
 },
 {
  "id": "general-criminal-mischief",
  "name": "Criminal mischief",
  "category": "Property and financial offenses",
  "aliases": [],
  "kind": "general_term",
  "source": null
 },
 {
  "id": "general-vandalism",
  "name": "Vandalism",
  "category": "Property and financial offenses",
  "aliases": [],
  "kind": "general_term",
  "source": null
 },
 {
  "id": "general-burglary-tools",
  "name": "Burglary tools",
  "category": "Property and financial offenses",
  "aliases": [],
  "kind": "general_term",
  "source": null
 },
 {
  "id": "general-breaking-and-entering",
  "name": "Breaking and entering",
  "category": "Property and financial offenses",
  "aliases": [],
  "kind": "general_term",
  "source": null
 },
 {
  "id": "general-money-laundering",
  "name": "Money laundering",
  "category": "Property and financial offenses",
  "aliases": [],
  "kind": "general_term",
  "source": null
 },
 {
  "id": "general-retail-theft",
  "name": "Retail theft",
  "category": "Property and financial offenses",
  "aliases": [],
  "kind": "general_term",
  "source": null
 },
 {
  "id": "general-identity-theft",
  "name": "Identity theft",
  "category": "Property and financial offenses",
  "aliases": [],
  "kind": "general_term",
  "source": null
 },
 {
  "id": "general-possession-of-drugs",
  "name": "Possession of drugs",
  "category": "Drugs and controlled substances",
  "aliases": [],
  "kind": "general_term",
  "source": null
 },
 {
  "id": "general-possession-of-controlled-substances",
  "name": "Possession of controlled substances",
  "category": "Drugs and controlled substances",
  "aliases": [],
  "kind": "general_term",
  "source": null
 },
 {
  "id": "general-possession-with-intent-to-distribute",
  "name": "Possession with intent to distribute",
  "category": "Drugs and controlled substances",
  "aliases": [],
  "kind": "general_term",
  "source": null
 },
 {
  "id": "general-drug-manufacturing",
  "name": "Drug manufacturing",
  "category": "Drugs and controlled substances",
  "aliases": [],
  "kind": "general_term",
  "source": null
 },
 {
  "id": "general-drug-cultivation",
  "name": "Drug cultivation",
  "category": "Drugs and controlled substances",
  "aliases": [],
  "kind": "general_term",
  "source": null
 },
 {
  "id": "general-drug-smuggling",
  "name": "Drug smuggling",
  "category": "Drugs and controlled substances",
  "aliases": [],
  "kind": "general_term",
  "source": null
 },
 {
  "id": "general-drug-sale",
  "name": "Drug sale",
  "category": "Drugs and controlled substances",
  "aliases": [],
  "kind": "general_term",
  "source": null
 },
 {
  "id": "general-drug-trafficking",
  "name": "Drug trafficking",
  "category": "Drugs and controlled substances",
  "aliases": [],
  "kind": "general_term",
  "source": null
 },
 {
  "id": "general-possession-of-drug-abuse-instruments",
  "name": "Possession of drug abuse instruments",
  "category": "Drugs and controlled substances",
  "aliases": [],
  "kind": "general_term",
  "source": null
 },
 {
  "id": "general-controlled-substance-prescription-fraud",
  "name": "Controlled substance prescription fraud",
  "category": "Drugs and controlled substances",
  "aliases": [],
  "kind": "general_term",
  "source": null
 },
 {
  "id": "general-rape",
  "name": "Rape",
  "category": "Sex and family offenses",
  "aliases": [],
  "kind": "general_term",
  "source": null
 },
 {
  "id": "general-sexual-assault",
  "name": "Sexual assault",
  "category": "Sex and family offenses",
  "aliases": [],
  "kind": "general_term",
  "source": null
 },
 {
  "id": "general-sexual-battery",
  "name": "Sexual battery",
  "category": "Sex and family offenses",
  "aliases": [],
  "kind": "general_term",
  "source": null
 },
 {
  "id": "general-gross-sexual-imposition",
  "name": "Gross sexual imposition",
  "category": "Sex and family offenses",
  "aliases": [],
  "kind": "general_term",
  "source": null
 },
 {
  "id": "general-statutory-rape",
  "name": "Statutory rape",
  "category": "Sex and family offenses",
  "aliases": [],
  "kind": "general_term",
  "source": null
 },
 {
  "id": "general-sexual-exploitation-of-a-minor",
  "name": "Sexual exploitation of a minor",
  "category": "Sex and family offenses",
  "aliases": [],
  "kind": "general_term",
  "source": null
 },
 {
  "id": "general-indecent-exposure",
  "name": "Indecent exposure",
  "category": "Sex and family offenses",
  "aliases": [],
  "kind": "general_term",
  "source": null
 },
 {
  "id": "general-voyeurism",
  "name": "Voyeurism",
  "category": "Sex and family offenses",
  "aliases": [],
  "kind": "general_term",
  "source": null
 },
 {
  "id": "general-prostitution",
  "name": "Prostitution",
  "category": "Sex and family offenses",
  "aliases": [],
  "kind": "general_term",
  "source": null
 },
 {
  "id": "general-solicitation",
  "name": "Solicitation",
  "category": "Sex and family offenses",
  "aliases": [],
  "kind": "general_term",
  "source": null
 },
 {
  "id": "general-failure-to-register-as-a-sex-offender",
  "name": "Failure to register as a sex offender",
  "category": "Sex and family offenses",
  "aliases": [],
  "kind": "general_term",
  "source": null
 },
 {
  "id": "general-child-endangerment",
  "name": "Child endangerment",
  "category": "Sex and family offenses",
  "aliases": [],
  "kind": "general_term",
  "source": null
 },
 {
  "id": "general-nonsupport",
  "name": "Nonsupport",
  "category": "Sex and family offenses",
  "aliases": [],
  "kind": "general_term",
  "source": null
 },
 {
  "id": "general-interference-with-custody",
  "name": "Interference with custody",
  "category": "Sex and family offenses",
  "aliases": [],
  "kind": "general_term",
  "source": null
 },
 {
  "id": "general-violation-of-protection-order",
  "name": "Violation of protection order",
  "category": "Sex and family offenses",
  "aliases": [],
  "kind": "general_term",
  "source": null
 },
 {
  "id": "general-violation-of-restraining-order",
  "name": "Violation of restraining order",
  "category": "Sex and family offenses",
  "aliases": [],
  "kind": "general_term",
  "source": null
 },
 {
  "id": "general-bigamy",
  "name": "Bigamy",
  "category": "Sex and family offenses",
  "aliases": [],
  "kind": "general_term",
  "source": null
 },
 {
  "id": "general-bribery",
  "name": "Bribery",
  "category": "Public order and justice",
  "aliases": [],
  "kind": "general_term",
  "source": null
 },
 {
  "id": "general-perjury",
  "name": "Perjury",
  "category": "Public order and justice",
  "aliases": [],
  "kind": "general_term",
  "source": null
 },
 {
  "id": "general-tampering-with-evidence",
  "name": "Tampering with evidence",
  "category": "Public order and justice",
  "aliases": [],
  "kind": "general_term",
  "source": null
 },
 {
  "id": "general-witness-intimidation",
  "name": "Witness intimidation",
  "category": "Public order and justice",
  "aliases": [],
  "kind": "general_term",
  "source": null
 },
 {
  "id": "general-obstruction-of-justice",
  "name": "Obstruction of justice",
  "category": "Public order and justice",
  "aliases": [],
  "kind": "general_term",
  "source": null
 },
 {
  "id": "general-escape",
  "name": "Escape",
  "category": "Public order and justice",
  "aliases": [],
  "kind": "general_term",
  "source": null
 },
 {
  "id": "general-aiding-escape",
  "name": "Aiding escape",
  "category": "Public order and justice",
  "aliases": [],
  "kind": "general_term",
  "source": null
 },
 {
  "id": "general-failure-to-comply",
  "name": "Failure to comply",
  "category": "Public order and justice",
  "aliases": [],
  "kind": "general_term",
  "source": null
 },
 {
  "id": "general-fleeing-and-eluding",
  "name": "Fleeing and eluding",
  "category": "Public order and justice",
  "aliases": [],
  "kind": "general_term",
  "source": null
 },
 {
  "id": "general-violation-of-parole",
  "name": "Violation of parole",
  "category": "Public order and justice",
  "aliases": [],
  "kind": "general_term",
  "source": null
 },
 {
  "id": "general-violation-of-probation",
  "name": "Violation of probation",
  "category": "Public order and justice",
  "aliases": [],
  "kind": "general_term",
  "source": null
 },
 {
  "id": "general-violation-of-court-order",
  "name": "Violation of court order",
  "category": "Public order and justice",
  "aliases": [],
  "kind": "general_term",
  "source": null
 },
 {
  "id": "general-false-report",
  "name": "False report",
  "category": "Public order and justice",
  "aliases": [],
  "kind": "general_term",
  "source": null
 },
 {
  "id": "general-false-alarm",
  "name": "False alarm",
  "category": "Public order and justice",
  "aliases": [],
  "kind": "general_term",
  "source": null
 },
 {
  "id": "general-riot",
  "name": "Riot",
  "category": "Public order and justice",
  "aliases": [],
  "kind": "general_term",
  "source": null
 },
 {
  "id": "general-inciting-violence",
  "name": "Inciting violence",
  "category": "Public order and justice",
  "aliases": [],
  "kind": "general_term",
  "source": null
 },
 {
  "id": "general-gambling",
  "name": "Gambling",
  "category": "Public order and justice",
  "aliases": [],
  "kind": "general_term",
  "source": null
 },
 {
  "id": "general-public-gaming",
  "name": "Public gaming",
  "category": "Public order and justice",
  "aliases": [],
  "kind": "general_term",
  "source": null
 },
 {
  "id": "general-animal-cruelty",
  "name": "Animal cruelty",
  "category": "Public order and justice",
  "aliases": [],
  "kind": "general_term",
  "source": null
 },
 {
  "id": "general-loitering",
  "name": "Loitering",
  "category": "Public order and justice",
  "aliases": [],
  "kind": "general_term",
  "source": null
 },
 {
  "id": "general-liquor-law-violation",
  "name": "Liquor law violation",
  "category": "Public order and justice",
  "aliases": [],
  "kind": "general_term",
  "source": null
 },
 {
  "id": "general-public-indecency",
  "name": "Public indecency",
  "category": "Public order and justice",
  "aliases": [],
  "kind": "general_term",
  "source": null
 },
 {
  "id": "general-contempt-of-court",
  "name": "Contempt of court",
  "category": "Public order and justice",
  "aliases": [],
  "kind": "general_term",
  "source": null
 },
 {
  "id": "general-impersonation",
  "name": "Impersonation",
  "category": "Public order and justice",
  "aliases": [],
  "kind": "general_term",
  "source": null
 },
 {
  "id": "general-conspiracy",
  "name": "Conspiracy",
  "category": "Public order and justice",
  "aliases": [],
  "kind": "general_term",
  "source": null
 },
 {
  "id": "general-attempt",
  "name": "Attempt",
  "category": "Public order and justice",
  "aliases": [],
  "kind": "general_term",
  "source": null
 },
 {
  "id": "general-aiding-and-abetting",
  "name": "Aiding and abetting",
  "category": "Public order and justice",
  "aliases": [],
  "kind": "general_term",
  "source": null
 },
 {
  "id": "general-complicity",
  "name": "Complicity",
  "category": "Public order and justice",
  "aliases": [],
  "kind": "general_term",
  "source": null
 },
 {
  "id": "general-organized-criminal-activity",
  "name": "Organized criminal activity",
  "category": "Public order and justice",
  "aliases": [],
  "kind": "general_term",
  "source": null
 },
 {
  "id": "general-driving-without-a-license",
  "name": "Driving without a license",
  "category": "Driving and regulatory",
  "aliases": [],
  "kind": "general_term",
  "source": null
 },
 {
  "id": "general-driving-without-insurance",
  "name": "Driving without insurance",
  "category": "Driving and regulatory",
  "aliases": [],
  "kind": "general_term",
  "source": null
 },
 {
  "id": "general-speeding",
  "name": "Speeding",
  "category": "Driving and regulatory",
  "aliases": [],
  "kind": "general_term",
  "source": null
 },
 {
  "id": "general-street-racing",
  "name": "Street racing",
  "category": "Driving and regulatory",
  "aliases": [],
  "kind": "general_term",
  "source": null
 },
 {
  "id": "general-failure-to-stop",
  "name": "Failure to stop",
  "category": "Driving and regulatory",
  "aliases": [],
  "kind": "general_term",
  "source": null
 },
 {
  "id": "general-failure-to-yield",
  "name": "Failure to yield",
  "category": "Driving and regulatory",
  "aliases": [],
  "kind": "general_term",
  "source": null
 },
 {
  "id": "general-leaving-scene-of-accident",
  "name": "Leaving scene of accident",
  "category": "Driving and regulatory",
  "aliases": [],
  "kind": "general_term",
  "source": null
 },
 {
  "id": "general-reckless-operation",
  "name": "Reckless operation",
  "category": "Driving and regulatory",
  "aliases": [],
  "kind": "general_term",
  "source": null
 },
 {
  "id": "general-commercial-driver-violation",
  "name": "Commercial driver violation",
  "category": "Driving and regulatory",
  "aliases": [],
  "kind": "general_term",
  "source": null
 },
 {
  "id": "general-traffic-control-violation",
  "name": "Traffic control violation",
  "category": "Driving and regulatory",
  "aliases": [],
  "kind": "general_term",
  "source": null
 },
 {
  "id": "general-driving-under-revocation",
  "name": "Driving under revocation",
  "category": "Driving and regulatory",
  "aliases": [],
  "kind": "general_term",
  "source": null
 },
 {
  "id": "general-open-container-violation",
  "name": "Open container violation",
  "category": "Driving and regulatory",
  "aliases": [],
  "kind": "general_term",
  "source": null
 },
 {
  "id": "general-unlawful-possession-of-firearm",
  "name": "Unlawful possession of firearm",
  "category": "Weapons and other offenses",
  "aliases": [],
  "kind": "general_term",
  "source": null
 },
 {
  "id": "general-felon-in-possession",
  "name": "Felon in possession",
  "category": "Weapons and other offenses",
  "aliases": [],
  "kind": "general_term",
  "source": null
 },
 {
  "id": "general-unlawful-discharge-of-firearm",
  "name": "Unlawful discharge of firearm",
  "category": "Weapons and other offenses",
  "aliases": [],
  "kind": "general_term",
  "source": null
 },
 {
  "id": "general-possession-of-prohibited-weapon",
  "name": "Possession of prohibited weapon",
  "category": "Weapons and other offenses",
  "aliases": [],
  "kind": "general_term",
  "source": null
 },
 {
  "id": "general-unlawful-carrying",
  "name": "Unlawful carrying",
  "category": "Weapons and other offenses",
  "aliases": [],
  "kind": "general_term",
  "source": null
 },
 {
  "id": "general-unlawful-sale-of-firearm",
  "name": "Unlawful sale of firearm",
  "category": "Weapons and other offenses",
  "aliases": [],
  "kind": "general_term",
  "source": null
 },
 {
  "id": "general-weapons-trafficking",
  "name": "Weapons trafficking",
  "category": "Weapons and other offenses",
  "aliases": [],
  "kind": "general_term",
  "source": null
 },
 {
  "id": "general-criminal-gang-participation",
  "name": "Criminal gang participation",
  "category": "Weapons and other offenses",
  "aliases": [],
  "kind": "general_term",
  "source": null
 },
 {
  "id": "general-terroristic-threats",
  "name": "Terroristic threats",
  "category": "Weapons and other offenses",
  "aliases": [],
  "kind": "general_term",
  "source": null
 },
 {
  "id": "general-terrorism",
  "name": "Terrorism",
  "category": "Weapons and other offenses",
  "aliases": [],
  "kind": "general_term",
  "source": null
 },
 {
  "id": "general-federal-offense",
  "name": "Federal offense",
  "category": "Weapons and other offenses",
  "aliases": [],
  "kind": "general_term",
  "source": null
 },
 {
  "id": "general-municipal-ordinance-violation",
  "name": "Municipal ordinance violation",
  "category": "Weapons and other offenses",
  "aliases": [],
  "kind": "general_term",
  "source": null
 }
];
window.chargeLibrary=[...ohioChargeReferences,...window.chargeLibrary.map(r=>({...r,kind:"general_term"})),...additionalChargeTerms];

(function(root){
 const normalize=s=>String(s||"").trim().toLowerCase().replace(/[^a-z0-9.]+/g," ").replace(/\s+/g," ").trim();
 const stateCode=s=>String(s||"").trim().toUpperCase();
 function entries(state){
  const jurisdiction=stateCode(state);
  const unique=new Map();
  for(const entry of root.chargeLibrary){
   if(entry.state&&entry.state!==jurisdiction)continue;
   const key=entry.state?entry.state+":"+entry.code:"general:"+normalize(entry.name);
   if(!unique.has(key))unique.set(key,entry);
  }
  return [...unique.values()];
 }
 function search(query,state,limit=20){
  const q=normalize(query);if(!q)return [];
  const terms=q.split(" ");
  return entries(state).map(e=>{
   const name=normalize(e.name),code=normalize(e.code),aliases=(e.aliases||[]).map(normalize);
   const hay=[name,code,...aliases].join(" ");
   const subsectionMatch=Boolean(code&&q.startsWith(code+" ")&&/^[a-z0-9 ]+$/.test(q.slice(code.length+1)));
   if(!subsectionMatch&&!terms.every(t=>hay.includes(t)))return null;
   const score=(code===q?100:code&&q.startsWith(code+" ")?90:code&&code.startsWith(q)?70:0)+(name===q?50:name.startsWith(q)?30:name.includes(q)?20:10)+(aliases.includes(q)?40:aliases.some(a=>a.includes(q))?15:0)+(e.state?25:0);
   return {...e,score};
  }).filter(Boolean).sort((a,b)=>b.score-a.score||a.name.localeCompare(b.name)||String(a.code||"").localeCompare(String(b.code||""))).slice(0,Math.max(1,Math.min(500,Number(limit)||20)));
 }
 function mount(form){
  if(!form||form.dataset.chargeLibraryMounted==="1")return;
  const state=form.querySelector("#caseState"),scope=form.ownerDocument;
  const names=form.querySelector("#chargeNameSuggestions")||scope.getElementById("chargeNameSuggestions");
  const codes=form.querySelector("#offenseCodeSuggestions")||scope.getElementById("offenseCodeSuggestions");
  if(!state||!names||!codes)return;
  form.dataset.chargeLibraryMounted="1";
  const update=()=>{
   const data=entries(state.value),seen=new Set();
   const options=[],statutes=[];
   for(const row of data){
    for(const name of [row.name,...(row.aliases||[])]){
     const k=normalize(name);if(!k||seen.has(k))continue;seen.add(k);
     const o=scope.createElement("option");o.value=name;if(row.code)o.label=row.code+" — "+row.name;options.push(o);
    }
    if(row.code){const o=scope.createElement("option");o.value=row.code;o.label=row.name;statutes.push(o);}
   }
   names.replaceChildren(...options);codes.replaceChildren(...statutes);
  };
  state.addEventListener("change",update);state.addEventListener("input",update);update();
  // Explicit per-charge lookup; do not overwrite an existing court-record value.
  form.addEventListener("click",e=>{
   const trigger=e.target.closest?.("[data-charge-library-open]");if(!trigger||!form.contains(trigger))return;
   const card=trigger.closest(".record-card");if(!card)return;
   const panel=card.querySelector("[data-charge-library-panel]");if(panel){panel.hidden=!panel.hidden;return;}
   const box=scope.createElement("div");box.dataset.chargeLibraryPanel="1";box.className="charge-library-panel";
   const label=scope.createElement("label");label.textContent="Search charge name or statute";const input=scope.createElement("input");input.type="search";input.autocomplete="off";input.placeholder="e.g. possession, theft, 2925.11";label.append(input);
   const note=scope.createElement("p");note.textContent="Suggestions only. Verify the exact court charge, subsection, degree and offense date. General names are not jurisdiction-specific statutes.";
   const results=scope.createElement("div");results.setAttribute("aria-live","polite");box.append(label,note,results);trigger.after(box);
   function render(){
    results.replaceChildren();
    const matches=search(input.value,state.value,20);
    if(!matches.length){const p=scope.createElement("p");p.textContent=input.value.trim()?"No matches. Enter your exact charge and statute manually.":"Enter a charge name or statute to search.";results.append(p);return;}
    for(const row of matches){
     const item=scope.createElement("div"),button=scope.createElement("button");item.className="charge-library-result";
     button.type="button";button.textContent=row.name+(row.code?" — "+row.code:" (general name)");
     button.addEventListener("click",()=>{
      if(row.state&&row.state!==stateCode(state.value))return;
      const name=card.querySelector('[data-field="charge_name"]'),code=card.querySelector('[data-field="charge_code"]');
      if(!name||!code)return;
      const existingCode=normalize(code.value),baseCode=normalize(row.code);
      const preserveSubsection=Boolean(baseCode&&existingCode.startsWith(baseCode+" "));
      const chosenCode=preserveSubsection?code.value:row.code;
      if((name.value&&name.value!==row.name)||(row.code&&code.value&&code.value!==chosenCode)||(!row.code&&code.value&&name.value!==row.name)){
       if(!root.confirm("Replace the entered final charge name"+(row.code?" and statute":" (the entered statute will remain unchanged)")+"? Check the exact court record before continuing."))return;
      }
      name.value=row.name;if(row.code)code.value=chosenCode;
      name.dispatchEvent(new Event("change",{bubbles:true}));if(row.code)code.dispatchEvent(new Event("change",{bubbles:true}));
      box.hidden=true;
     });item.append(button);
     if(row.code&&row.source){const a=scope.createElement("a");a.href=row.source;a.target="_blank";a.rel="noopener noreferrer";a.textContent="Official statute";item.append(a);}
     results.append(item);
    }
   }
   input.addEventListener("input",event=>{event.stopPropagation();render();});input.addEventListener("change",event=>event.stopPropagation());state.addEventListener("change",()=>{if(box.isConnected)render();});render();input.focus();
  });
 }
 root.RecordPathChargeLibrary={entries,search,mount};
 root.searchChargeLibrary=(query,state)=>search(query,state,8);
})(window);
