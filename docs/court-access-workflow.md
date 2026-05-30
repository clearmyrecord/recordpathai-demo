# Court Access Workflow Draft

This workflow describes the future RecordPathAI clerk and court administrator experience for record-relief packet intake, review, status tracking, and applicant notifications.

## Future Clerk Workflow

1. Applicant submits packet.
2. System validates packet completeness.
3. Submission enters clerk queue.
4. Clerk reviews packet details, filing checklist items, attached documents, and court-specific requirements.
5. Clerk can request corrections when packet data or required documents are missing, incomplete, or inconsistent.
6. Clerk can mark packet filed after it is accepted for filing by the court.
7. Clerk can add hearing date when a hearing is scheduled.
8. Clerk can mark outcome granted or denied after final court action.
9. Applicant dashboard updates automatically as filing status events are recorded.
10. RecordWatch updates based on final outcome so the applicant can monitor post-relief record correction tasks.

## Status Flow

A future implementation should preserve an append-only `filing_status_events` history while keeping the current status on the packet submission for fast dashboard display.

Typical statuses:

- `DRAFT`
- `SUBMITTED`
- `RECEIVED`
- `INCOMPLETE`
- `ACCEPTED`
- `FILED`
- `HEARING_SCHEDULED`
- `GRANTED`
- `DENIED`
- `CLOSED`

## Operational Notes

- Court users should only see packet submissions assigned to their court unless they have super admin access.
- Applicant-facing updates should be generated from status events and applicant-visible notes.
- Document correction requests should be tied to packet submissions and visible in the applicant dashboard.
- Hearing dates should be stored in structured fields during implementation so reminders and calendar integrations can be added later.
- RecordWatch should react to final outcomes to update correction monitoring, agency follow-up, and relief confirmation tasks.
