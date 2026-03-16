# Security

## Security Posture

`shelby-mcp` is a local MCP server, so its security model is centered on safe local operation rather than hosted multi-tenant isolation. The most important current control is strict filesystem confinement to `SHELBY_WORKDIR`.

## Filesystem Sandbox

All agent-facing filesystem operations must pass through the sandbox layer in [packages/shelby-service/src/sandbox/sandbox-service.ts](../packages/shelby-service/src/sandbox/sandbox-service.ts).

The sandbox enforces:

- path normalization and resolution
- root confinement to `SHELBY_WORKDIR`
- active-scope confinement to the currently narrowed safe path
- rejection of path traversal outside the root
- rejection of symlink-based escapes using real-path checks
- rejection of reserved internal directories such as storage and temp internals

This is mandatory behavior, not a soft convention.

## Safe Path Narrowing

The sandbox starts at `SHELBY_WORKDIR` and can be narrowed with `shelby_set_safe_path`.

Important properties:

- narrowing is allowed only to an existing subdirectory
- narrowing never widens the active scope
- all later file inputs are resolved relative to the active safe scope unless absolute paths are still inside the scope

This gives users and agents a practical way to reduce blast radius during a session.

## Reserved Internal Paths

Some directories inside `SHELBY_WORKDIR` are reserved for server internals:

- `SHELBY_STORAGE_DIR`
- `TEMP_DIR`
- their internal parent system directories

These are blocked from direct agent path access so the agent cannot manipulate the mock provider index or internal temp staging areas directly.

## Upload And Read Limits

The service enforces:

- `MAX_UPLOAD_SIZE_MB` for uploads
- `MAX_READ_TEXT_BYTES` for text readback truncation
- `STREAM_UPLOAD_CHUNK_SIZE_BYTES` for controlled file-read chunking during uploads

These guardrails reduce accidental oversized operations and prevent the model from being handed arbitrarily large text payloads.

## Strict Metadata Mode

When `SHELBY_STRICT_METADATA=true`, uploads are rejected unless they provide all configured `SHELBY_REQUIRED_METADATA_KEYS`.

This applies consistently to:

- `shelby_upload_file`
- `shelby_upload_text`
- `shelby_write_json`
- `shelby_batch_upload`

When strict mode is disabled, configured default metadata values can still be applied automatically in the service layer for more flexible local workflows.

## Destructive Tools

`shelby_delete_blob` is disabled by default.

It requires:

- `ALLOW_DESTRUCTIVE_TOOLS=true`

This matters because MCP clients may execute tools semi-autonomously. Delete should require explicit operator intent.

## Logging And Secret Handling

The logger:

- writes to `stderr`, not `stdout`, to avoid corrupting STDIO transport
- redacts sensitive fields such as API keys, private keys, tokens, and authorization-like fields
- only forwards selected warnings/errors to MCP clients

The server does not return raw stack traces to MCP tool callers.

## Telemetry Privacy Model

Telemetry is opt-in only.

When enabled:

- it sends coarse anonymous failure events and a startup capability snapshot
- it strips raw absolute paths, metadata payloads, and secret-bearing fields
- telemetry delivery failures do not crash the server or alter tool results

Telemetry is not intended to be a usage analytics system. It is a narrow operational signal for failure pattern visibility.

## Real Provider Expectations

The real provider can perform genuine Shelby operations when configuration is sufficient. That makes credential handling operationally important.

Current expectations:

- keep secrets in environment variables
- do not commit `.env`
- treat `SHELBY_PRIVATE_KEY` and `SHELBY_API_KEY` as sensitive
- assume the local machine user controls the process environment

There is not yet a multi-user secret store, scoped auth layer, or session-level delegation model.

## Mock Provider Limitations

The mock provider is useful for:

- local development
- CI
- deterministic tool testing

It is not a security boundary and should not be mistaken for a hosted Shelby deployment model.

## Threat Model Notes

This MVP is designed primarily against:

- accidental path traversal by an agent
- accidental writes outside the intended workspace
- unsafe default delete behavior
- overly large file/text operations
- secret leakage through logs or tool payloads

It does not yet fully address:

- remote attacker models
- per-user isolation
- multi-tenant authz
- audit-complete hosted operations

## Future Hardening Areas

- HTTP transport auth and request signing
- per-user or per-team sandbox isolation
- session-aware account resolution
- audit logging for destructive actions
- policy controls around provider capability use
- stronger credential lifecycle and rotation support
