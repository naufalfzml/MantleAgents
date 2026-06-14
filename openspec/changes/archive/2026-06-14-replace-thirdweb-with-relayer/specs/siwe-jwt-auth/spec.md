## ADDED Requirements

### Requirement: SIWE login challenge generation
The system SHALL generate an EIP-4361 (Sign-In with Ethereum) message for a given wallet address via `POST /api/auth/payload`, bound to the configured `AUTH_DOMAIN`, a server-generated nonce, the request chain id, and issuance/expiry timestamps. The response shape MUST be sufficient for the frontend to reconstruct and sign the message.

#### Scenario: Payload requested for a valid address
- **WHEN** `POST /api/auth/payload` is called with `{ address: "0xabc..." }`
- **THEN** the system returns a SIWE message (or its fields) containing the address, `AUTH_DOMAIN`, a fresh nonce, and an expiry timestamp

#### Scenario: Address missing from request
- **WHEN** `POST /api/auth/payload` is called without an `address`
- **THEN** the system responds with HTTP 400 and does not generate a payload

### Requirement: SIWE signature verification and JWT issuance
The system SHALL verify a signed SIWE message via `POST /api/auth/login` using the `siwe` library and, on success, issue a JWT signed with `jose` (HS256) using `JWT_SECRET`, with `sub` set to the wallet address.

#### Scenario: Valid signature
- **WHEN** `POST /api/auth/login` receives a payload whose signature matches the message signer and the message is within its validity window
- **THEN** the system returns `{ token }` where the JWT's `sub` claim equals the signer's wallet address

#### Scenario: Invalid signature
- **WHEN** the provided signature does not match the SIWE message signer
- **THEN** the system responds with HTTP 401 and does not issue a token

#### Scenario: Expired message
- **WHEN** the SIWE message expiry timestamp is in the past
- **THEN** verification fails and the system responds with HTTP 401

### Requirement: JWT verification middleware
The system SHALL protect authenticated routes by verifying the `Authorization: Bearer <jwt>` header with `jose.jwtVerify` against `JWT_SECRET`, populating `request.user.walletAddress` from the token `sub` claim.

#### Scenario: Valid bearer token
- **WHEN** a protected route receives a request with a valid JWT in the Authorization header
- **THEN** the middleware sets `request.user.walletAddress` to the token `sub` and allows the request to proceed

#### Scenario: Missing or malformed Authorization header
- **WHEN** a protected route receives a request without a `Bearer ` token
- **THEN** the middleware responds with HTTP 401 and does not invoke the handler

#### Scenario: Invalid or expired token
- **WHEN** a protected route receives a JWT that fails `jose.jwtVerify`
- **THEN** the middleware responds with HTTP 401

### Requirement: Stateless logout
The system SHALL expose `POST /api/auth/logout` that acknowledges logout without server-side token revocation; token invalidation is handled client-side.

#### Scenario: Logout acknowledged
- **WHEN** `POST /api/auth/logout` is called
- **THEN** the system returns a success acknowledgment and performs no server-side state change

### Requirement: No Thirdweb dependency in auth
The system SHALL NOT import or invoke the `thirdweb` package for authentication. Required configuration is `AUTH_DOMAIN` and `JWT_SECRET`; `THIRDWEB_SECRET_KEY` and `THIRDWEB_ADMIN_PRIVATE_KEY` are no longer used.

#### Scenario: Missing JWT secret at startup
- **WHEN** the API starts without `JWT_SECRET` set
- **THEN** the system fails loud with an error indicating `JWT_SECRET` is required

#### Scenario: Thirdweb auth removed
- **WHEN** the auth routes and middleware are loaded
- **THEN** no symbol from the `thirdweb` package is referenced in the auth code path
