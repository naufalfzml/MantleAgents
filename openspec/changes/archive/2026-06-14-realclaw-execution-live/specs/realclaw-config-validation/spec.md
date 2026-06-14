## ADDED Requirements

### Requirement: isRealClawConfigured validates both required env vars
`isRealClawConfigured()` SHALL return `true` only when both `REALCLAW_API_KEY` and `REALCLAW_API_BASE` are set to non-empty strings. If either is missing, it MUST return `false` and log a structured warning listing which variable(s) are absent.

#### Scenario: Both vars set — returns true
- **WHEN** `REALCLAW_API_KEY` and `REALCLAW_API_BASE` are both set to non-empty strings
- **THEN** `isRealClawConfigured()` MUST return `true`

#### Scenario: API key missing — returns false with warning
- **WHEN** `REALCLAW_API_KEY` is unset or empty
- **THEN** `isRealClawConfigured()` MUST return `false` and a warning log MUST name `REALCLAW_API_KEY` as missing

#### Scenario: Base URL missing — returns false with warning
- **WHEN** `REALCLAW_API_BASE` is unset or empty
- **THEN** `isRealClawConfigured()` MUST return `false` and a warning log MUST name `REALCLAW_API_BASE` as missing

### Requirement: RealClaw configuration is checked at API server startup
The API server startup sequence SHALL call `isRealClawConfigured()` once at boot and log the result so operators can see whether Mantle trade execution is active before any agent run occurs.

#### Scenario: Startup log reflects configured state
- **WHEN** the API server starts with both RealClaw env vars set
- **THEN** the startup log MUST include a message indicating RealClaw execution is active

#### Scenario: Startup log reflects unconfigured state
- **WHEN** the API server starts with one or both RealClaw env vars missing
- **THEN** the startup log MUST include a warning indicating RealClaw is not configured and Mantle trades will be skipped

### Requirement: RealClaw API schema is documented
A file `docs/REALCLAW_API.md` SHALL exist in the repository documenting the confirmed live API schema: base URL, auth scheme, skill name, request payload shape, and all possible response shapes (success, pending_confirmation, failed, error).

#### Scenario: API schema doc exists before implementation
- **WHEN** implementation of `executeRealClawSwap` begins
- **THEN** `docs/REALCLAW_API.md` MUST exist and contain at minimum: endpoint path, auth header format, swap request payload example, and success response example
