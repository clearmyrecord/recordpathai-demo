# Shared charge reference library

The browser-shared catalog in js/charge-library.js is a reference and data-entry aid, not an eligibility rules engine. Both consumer and professional Step 2 use the same reference picker and retain manual entry.

## Coverage and provenance

- 234 unique Ohio section references, based on the 2025 Ohio Revised Code chapter indexes (2903, 2905, 2907, 2909, 2911, 2913, 2915, 2917, 2919, 2921, 2923, 2925, 2927) and Ohio BMV offense reference. Each section links to https://codes.ohio.gov/ohio-revised-code/section-{code}. Titles are normalized reference labels, not necessarily exact statutory offense names or current law.
- Ohio official index: https://codes.ohio.gov/ohio-revised-code/title-29
- Ohio BMV code list: https://www.bmv.ohio.gov/government.aspx
- 2025 chapter indexes: https://law.justia.com/codes/ohio/title-29/
- General offense names are search vocabulary, not legal citations. National classification reference: https://secure.ssa.gov/poms.Nsf/lnx/0202613900
- Other states have general search vocabulary only until a jurisdiction-specific dataset is verified. A 50-state selector does not mean 50-state statutory coverage. The Ohio references are not exhaustive and are not certified against every effective date or subsection.

## Next source datasets to review

- National Corrections Reporting Program offense code crosswalk: https://www.icpsr.umich.edu/sites/nacjd/posts/shared/national-corrections-reporting-program-resource-guide (state reporting codes may not be statutes; never import them into the statute field without verifying their meaning).
- Nevada Offense Code reference: https://www.nvcrimemapping.com/noc-table-updates
- New York DCJS Charge Code Manual: https://www.criminaljustice.ny.gov/crimnet/ccman/ccman.htm
- Arizona Citable Criminal Offense Table: https://www.azcjc.gov/Programs/Criminal-Justice-Systems-Improvement/Criminal-Statutes
- Maryland Criminal Charge Code: https://www.mdcourts.gov/district/chargedb
- Texas DPS offense code tables: https://www.dps.texas.gov/section/crime-records/appendix-k-offense-codes

For every imported state catalog, preserve the original source, source edition, jurisdiction, statute and subsection when actually provided, and distinguish reporting codes from statutory citations. Verify legal changes, repeals, offense dates, municipal codes and historic versions independently. Do not use private client case records as public catalog data.

## Safety and tests

Selection is explicit. Existing exact subsections are preserved when selecting a matching section. Changing an already-entered name or incompatible code requires confirmation. No charge selection sets degree, disposition, sentence/discharge, exclusions, waiting period or eligibility. A general name never inserts a statute. No client search term is transmitted to an external service. Run node --test tests/charge-library.test.mjs and the existing regression suite. Verify the shared intake in a browser after production deployment.
