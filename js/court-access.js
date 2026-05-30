(function (global) {
  "use strict";

  const COURT_ACCESS_ROLES = Object.freeze({
    CLERK: "CLERK",
    COURT_ADMIN: "COURT_ADMIN",
    FILING_REVIEWER: "FILING_REVIEWER",
    READ_ONLY_PARTNER: "READ_ONLY_PARTNER",
    SUPER_ADMIN: "SUPER_ADMIN"
  });

  const FILING_STATUSES = Object.freeze({
    DRAFT: "DRAFT",
    SUBMITTED: "SUBMITTED",
    RECEIVED: "RECEIVED",
    INCOMPLETE: "INCOMPLETE",
    ACCEPTED: "ACCEPTED",
    FILED: "FILED",
    HEARING_SCHEDULED: "HEARING_SCHEDULED",
    GRANTED: "GRANTED",
    DENIED: "DENIED",
    CLOSED: "CLOSED"
  });

  const REVIEW_PACKET_ROLES = Object.freeze([
    COURT_ACCESS_ROLES.CLERK,
    COURT_ACCESS_ROLES.COURT_ADMIN,
    COURT_ACCESS_ROLES.FILING_REVIEWER,
    COURT_ACCESS_ROLES.SUPER_ADMIN
  ]);

  const UPDATE_STATUS_ROLES = Object.freeze([
    COURT_ACCESS_ROLES.CLERK,
    COURT_ACCESS_ROLES.COURT_ADMIN,
    COURT_ACCESS_ROLES.FILING_REVIEWER,
    COURT_ACCESS_ROLES.SUPER_ADMIN
  ]);

  const MANAGE_COURT_USERS_ROLES = Object.freeze([
    COURT_ACCESS_ROLES.COURT_ADMIN,
    COURT_ACCESS_ROLES.SUPER_ADMIN
  ]);

  const VIEW_AUDIT_LOG_ROLES = Object.freeze([
    COURT_ACCESS_ROLES.COURT_ADMIN,
    COURT_ACCESS_ROLES.SUPER_ADMIN
  ]);

  function normalizeRole(role) {
    return typeof role === "string" ? role.trim().toUpperCase() : "";
  }

  function roleIsOneOf(role, allowedRoles) {
    return allowedRoles.includes(normalizeRole(role));
  }

  function getCourtAccessRole() {
    const storedRole = global.localStorage ? global.localStorage.getItem("recordpathai_court_access_role") : "";
    return normalizeRole(storedRole) || COURT_ACCESS_ROLES.READ_ONLY_PARTNER;
  }

  function canReviewPackets(role) {
    return roleIsOneOf(role, REVIEW_PACKET_ROLES);
  }

  function canUpdateFilingStatus(role) {
    return roleIsOneOf(role, UPDATE_STATUS_ROLES);
  }

  function canManageCourtUsers(role) {
    return roleIsOneOf(role, MANAGE_COURT_USERS_ROLES);
  }

  function canViewAuditLog(role) {
    return roleIsOneOf(role, VIEW_AUDIT_LOG_ROLES);
  }

  global.RecordPathCourtAccess = Object.freeze({
    COURT_ACCESS_ROLES,
    FILING_STATUSES,
    getCourtAccessRole,
    canReviewPackets,
    canUpdateFilingStatus,
    canManageCourtUsers,
    canViewAuditLog
  });
})(window);
