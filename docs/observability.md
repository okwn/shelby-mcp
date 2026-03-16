# Observability

## Overview

`shelby-mcp` supports two observability channels:

- structured terminal logging via Pino
- MCP logging notifications for connected clients
- optional anonymous telemetry for coarse failure reporting

The implementation is designed so the server remains diagnosable without polluting STDIO protocol traffic.

## Terminal Logging

The shared logger lives in [packages/shared/src/logger/index.ts](../packages/shared/src/logger/index.ts).

Key behavior:

- logs are emitted to `stderr`
- log records are structured JSON through Pino
- child loggers can carry component names
- sinks can subscribe to the internal log stream

Typical logged events:

- server startup
- provider initialization
- successful safe-path narrowing
- upload execution
- strict metadata rejections
- provider errors
- sandbox denials

## MCP Logging Bridge

The MCP bridge lives in [packages/mcp-core/src/logging/mcp-log-bridge.ts](../packages/mcp-core/src/logging/mcp-log-bridge.ts).

Behavior:

- attaches once the MCP server is connected
- maps internal log levels to MCP levels
- forwards important warnings and errors to the client
- suppresses routine debug chatter unless explicitly marked for client visibility

Level mapping:

- `debug` -> `debug`
- `info` -> `info`
- `warn` -> `warning`
- `error` -> `error`

## When Client Notifications Are Used

Important client-visible events include:

- startup ready messages
- startup healthcheck warnings
- sandbox violations
- safe-scope violations
- strict metadata policy denials
- destructive tool denial
- real-provider operational failures

This is meant to surface important operational context to the host model without spamming it.

## Sensitive Data Protection

The shared logger sanitizes likely secret-bearing fields, including values associated with:

- `apiKey`
- `privateKey`
- `token`
- `authorization`
- `secret`

Safe config summaries expose only booleans for whether sensitive values are configured, not the sensitive values themselves.

## Telemetry

Telemetry is disabled by default. When `TELEMETRY_ENABLED=true`, the server can send:

- a startup capability snapshot once per run
- coarse tool error events with fields such as tool name, provider mode, error code, size bucket, and strict-metadata state

Telemetry never sends:

- file contents
- raw absolute local paths
- raw metadata payloads
- API keys, private keys, or authorization values
- full environment dumps

The telemetry client sanitizes event payloads before delivery and falls back safely if the endpoint is misconfigured or unavailable.

## Operational Guidance

For local runs:

- watch `stderr` for server-side logs
- inspect MCP client logs for forwarded warnings
- enable telemetry only if you want coarse anonymous error reporting
- use `shelby_healthcheck` and `shelby://system/account` to confirm environment state

For future HTTP transport:

- request IDs
- user/session correlation
- structured audit events
- metrics and traces

should be layered in without replacing the existing logger abstraction.
