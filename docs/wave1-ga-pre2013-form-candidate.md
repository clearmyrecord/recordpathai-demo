# Wave 1 Georgia pre-2013 record restriction — mapper candidate

## Official source and scope

- Source: https://gbi.georgia.gov/services/georgia-criminal-history-record-restrictions
- Original blank PDF: https://gbi.georgia.gov/document/publication/request-restrict-arrest-record-instructions-and-request-form/download
- Versioned repository copy: `assets/forms/ga/statewide/arrest-agency/restrict-arrest-record-prior-2013.pdf`.
- SHA-256: `5fe841de263070f192ddfb0e322e41b2c2a97e8d07e7e643e98fdf780aefa1ab`
- Four PDF pages: instructions, applicant Section One, arresting agency Section Two, prosecutor Section Three.
- **Use only for arrests before July 1, 2013.** The current Georgia Bureau of Investigation page says that for arrests on/after that date there is no application process; contact the prosecutor about restriction.

## Applicant field discovery

`js/pdf-auto-map.js` detects the specific four-page official form and suggests 12 **draft** field boxes, all on the applicant's Section One:

- Full name, birth date, telephone, email, street/city/state/ZIP.
- Arresting agency, date of arrest and arrested-for charge description.
- Applicant signature placeholder (never auto-sign).
- The form also requests SSN, race and sex, but **does not** auto-collect or store these sensitive attributes in the public eligibility/browser-local storage workflow; use an approved private completion channel.

Agency/prosecutor sections **must never** be populated from applicant submissions, and no generic text label suggestions are shown on those pages.

The output at `admin/form-candidates/ga:statewide:arrest-agency:record-restriction:5fe841de2630.json` is `pending_review` with all approval flags false. It is **not** in `templates/index.json` as an active filing packet and no fees, signatures, court filing or mail can be generated through this asset.

## Test it

After the static preview deploys:

https://recordpathai-global-public.onrender.com/pdf-mapper-v7.html?form=ga-pre2013

1. The official 4-page blank PDF loads automatically.
2. Check the 12 applicant-only suggestions on PDF page 2 (review every coordinate).
3. Select **Apply selected**, then **Bind PDF and create draft manifest**.
4. Select **Load synthetic record**, **Preview field values** and **Download synthetic PDF** (watermarked, not for filing).
5. Export the draft review bundle for independent legal and visual review.

This workflow does not connect Georgia to a private approved record index; Georgia real-case auto-fill requires a separate secure data source, recipient verification, and consent workflow.
