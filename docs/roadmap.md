# Roadmap

## Phase 1: Current MVP

- local-first STDIO transport
- strict filesystem sandboxing rooted in `SHELBY_WORKDIR`
- safe-path narrowing tools
- full mock provider for development and CI
- official-SDK-backed real provider baseline
- MCP tools, resources, prompts, and logging bridge
- CI, linting, formatting, and release scaffolding

## Phase 2: Expand Real Shelby Integration

- deepen coverage of official Shelby SDK capabilities
- improve metadata mapping and retrieval semantics
- support richer signed or time-bounded URL patterns if Shelby exposes them
- add more precise capability detection per network/environment
- improve write result reconciliation beyond indexer polling fallback

## Phase 3: HTTP And Streamable HTTP Transport

- add `apps/server-http`
- expose transport adapters without changing the service layer
- support hosted and remote MCP deployment topologies
- add request-scoped observability and correlation

## Phase 4: Auth And Session Model

- authenticated remote access
- request/session-bound provider context
- user-aware and agent-aware policy hooks
- stronger destructive-operation controls

## Phase 5: Wallet-Aware User Context

- wallet-linked user identity
- delegated agent operation models
- policy checks for account ownership and signing authority

## Phase 6: Media Pipeline

- file preprocessing
- content-aware extraction
- media metadata tools
- future `packages/media` expansion

## Phase 7: Team And Org Support

- team-scoped and org-scoped views
- shared credentials with governance controls
- policy enforcement and administrative auditability

## Phase 8: Dashboard And Admin UI

- `apps/dashboard`
- runtime status visibility
- provider/account management
- workflow and audit inspection
- admin-oriented operational tooling
