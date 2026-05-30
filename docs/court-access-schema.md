# Court Access Supabase Schema Draft

This draft outlines a future-ready Supabase data model for RecordPathAI Court Access. The goal is to support court clerks, court administrators, filing staff, court partner agencies, and future e-filing integration partners without making the portal judge-specific.

## Proposed Tables

### `courts`

| Column | Purpose |
| --- | --- |
| `id` | Primary key for the court record. |
| `state` | State or jurisdiction abbreviation. |
| `county` | County assigned to the court. |
| `court_name` | Public court name. |
| `court_type` | Court category, such as municipal, common pleas, district, superior, or other local type. |
| `address` | Mailing or physical filing address. |
| `clerk_email` | General clerk or filing contact email. |
| `filing_url` | Public filing instructions, court filing page, or e-filing endpoint URL. |
| `accepts_digital_packets` | Boolean flag for whether this court can accept digital packet submission. |
| `created_at` | Timestamp when the court record was created. |

### `court_users`

| Column | Purpose |
| --- | --- |
| `id` | Primary key for the court user record. |
| `auth_user_id` | Supabase Auth user ID for login and identity linkage. |
| `court_id` | Foreign key to `courts.id`. |
| `role` | Court Access role, such as `CLERK`, `COURT_ADMIN`, `FILING_REVIEWER`, `READ_ONLY_PARTNER`, or `SUPER_ADMIN`. |
| `full_name` | Staff member or partner user display name. |
| `email` | Staff member or partner user email address. |
| `status` | Invitation or account status, such as invited, active, suspended, or disabled. |
| `created_at` | Timestamp when the court user record was created. |

### `packet_submissions`

| Column | Purpose |
| --- | --- |
| `id` | Primary key for the packet submission. |
| `applicant_user_id` | Applicant Supabase Auth user ID. |
| `court_id` | Foreign key to the assigned court. |
| `case_id` | Internal case identifier or external court case reference when available. |
| `packet_pdf_url` | Storage URL for the generated packet PDF. |
| `packet_data_json` | Structured packet data used for review and integration. |
| `status` | Current filing status. |
| `submitted_at` | Timestamp when the packet was submitted. |
| `updated_at` | Timestamp when the packet was last updated. |

### `filing_status_events`

| Column | Purpose |
| --- | --- |
| `id` | Primary key for the status event. |
| `submission_id` | Foreign key to `packet_submissions.id`. |
| `status` | Filing status applied by the system or court user. |
| `note` | Optional status note. |
| `changed_by` | User ID that changed the status. |
| `created_at` | Timestamp when the status event was created. |

### `court_notes`

| Column | Purpose |
| --- | --- |
| `id` | Primary key for the note. |
| `submission_id` | Foreign key to `packet_submissions.id`. |
| `court_user_id` | Foreign key to the court user who wrote the note. |
| `note` | Note text. |
| `visibility` | Visibility scope, such as internal court-only or applicant-visible. |
| `created_at` | Timestamp when the note was created. |

### `document_requests`

| Column | Purpose |
| --- | --- |
| `id` | Primary key for the document request. |
| `submission_id` | Foreign key to `packet_submissions.id`. |
| `requested_document` | Name or description of the missing or corrected document. |
| `reason` | Explanation for why the document is needed. |
| `status` | Request status, such as open, applicant-submitted, reviewed, or closed. |
| `created_at` | Timestamp when the request was created. |

### `audit_logs`

| Column | Purpose |
| --- | --- |
| `id` | Primary key for the audit log entry. |
| `actor_user_id` | User ID for the person or service account that performed the action. |
| `actor_role` | Court Access role active at the time of the action. |
| `action` | Action name, such as status update, note created, document downloaded, or user invited. |
| `resource_type` | Type of resource affected. |
| `resource_id` | ID of the affected resource. |
| `metadata` | JSON metadata for request ID, IP metadata, status transitions, or integration context. |
| `created_at` | Timestamp when the audit event was created. |

## RLS Notes

- Applicants only see their own submissions.
- Court users only see packets assigned to their court.
- Court admins manage users for their court.
- Super admins can manage all courts.
- All court actions must write audit logs.
