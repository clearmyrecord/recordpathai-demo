# Wave 1 County Discovery — Human Review Dashboard

**Geographic catalog complete:** 512 of 512 county-level jurisdictions indexed from the 2026 U.S. Census. **Court-form discovery completed:** 0 of 512 counties.

| State | County equivalents | Searched by agents | Still to search |
|---|---:|---:|---:|
| NV | 17 | 0 | 17 |
| TX | 254 | 0 | 254 |
| FL | 67 | 0 | 67 |
| AZ | 15 | 0 | 15 |
| GA | 159 | 0 | 159 |
| **Total** | **512** | **0** | **512** |

Ten counties have pre-existing research seeds. **Seeded does not mean searched, mapped, approved or filing-ready.**

The scheduled GitHub Actions research agent runs weekday previews. It sends search-provider requests only if repository variable `WAVE1_SEARCH_ENABLED` is set to `true` **and** secret `SERPAPI_KEY` is configured. Each state is capped at five counties and one provider query per county by default (25 calls per full five-state run). A manual dispatch can request up to 15 counties and two queries per county.

Generated source leads are deduplicated by HTTPS URL and form type, and held in `automation/wave1-discovery` for independent approval. No discovered source becomes an active PDF, legal rule, payment, mailing or filing.

The current 2026 Census input and checksum appear in `data/wave1-county-provenance.json`. No private criminal-history records or user data are included.
