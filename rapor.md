# shelby-mcp Audit Report

Audit date: 2026-03-16

## 1. Executive Summary

`shelby-mcp` is in strong shape as a local-first, STDIO-first MCP server with credible internal architecture, a genuinely useful mock provider, real sandbox enforcement, meaningful MCP resources/prompts, and disciplined repo standards. The codebase is not a toy demo. The local mock-backed workflow is real, validated, and usable.

Scorecard:

- Architecture: 8.5/10
- Security posture: 8.5/10
- MCP UX: 8.5/10
- DX / onboarding: 8/10
- Real provider maturity: 6/10
- Upstream readiness: 7.5/10

Practical verdict:

- Commit-ready: Yes
- Publish-ready: Yes, as experimental/local-first
- Ready for formal upstream Shelby proposal: Not quite yet

Reasoning:

- The mock path, STDIO runtime, sandbox, tests, docs, and CI are solid.
- The real provider is credible and integrated with the official Shelby SDK, but it still relies on buffered uploads at the SDK boundary and lacks live integration validation.
- During this audit, two small issues were fixed: the one-command setup flow was broken by blank optional env values in `.env.example`, and several docs used machine-local absolute markdown links.

## 2. Repository Snapshot

Top-level snapshot observed during audit:

- `apps/server-stdio/`: executable STDIO MCP server entrypoint
- `packages/mcp-core/`: MCP server composition, tool registry, resources, prompts, MCP log bridge
- `packages/shelby-service/`: service layer, providers, sandbox, blob/account/media services, domain types, errors
- `packages/shared/`: config, fs helpers, logger, telemetry, validation/utilities
- `tests/unit/`: config, sandbox, streaming, telemetry, setup, mock-provider tests
- `tests/integration/`: MCP core, resources/prompts, strict metadata, destructive gating, batch upload, readback tests
- `docs/`: architecture, security, observability, tool spec, resources/prompts, roadmap
- `scripts/`: setup/bootstrap helpers for local onboarding
- `.github/workflows/ci.yml`: CI pipeline
- `.changeset/`: release/version scaffolding

Layout notes:

- The repo uses a monorepo-style source layout, but package management is single-root `npm`, not actual npm workspaces.
- `dist/` and `node_modules/` were present in the local audit environment; `.gitignore` excludes them.
- The current workspace snapshot is not inside a Git repository, so commit history, branch state, and release automation beyond static config could not be audited.

## 3. System Overview

End-to-end flow:

1. An MCP host such as Claude Code or Cursor connects to the STDIO runtime in `apps/server-stdio/src/index.ts`.
2. The entrypoint loads validated config, creates the Pino-based logger, initializes optional telemetry, constructs the selected provider, then composes `ShelbyService`.
3. `packages/mcp-core/src/server.ts` builds the MCP-facing server using the official `@modelcontextprotocol/sdk`, registers tools/resources/prompts, and attaches the MCP logging bridge.
4. Tool calls are routed through `ToolRegistry`, which validates input with Zod, calls the selected handler, parses the response envelope, logs tool failures, and emits coarse telemetry when enabled.
5. The service layer splits responsibilities:
   - `AccountService`: health/capabilities/account context
   - `BlobService`: list/upload/download/read/verify/delete flows
   - `SandboxService`: path confinement and safe-scope narrowing
   - `UploadPolicyService`: strict metadata and upload limits
   - `MediaService`: minimal capability summary for future growth
6. File-based flows pass through the sandbox before they reach any provider implementation.
7. The provider abstraction selects either:
   - `MockShelbyProvider`: fully working local provider backed by filesystem storage and an index file
   - `RealShelbyProvider`: official Shelby SDK adapter with honest capability gating
8. Logs go to `stderr`, selected warnings/errors can also be bridged to MCP client notifications, and telemetry can optionally emit sanitized anonymous events.

Concrete upload request path:

1. The model calls `shelby_upload_file`.
2. The tool schema validates arguments.
3. `BlobService.uploadFile()` resolves the input path through `SandboxService.resolveInputFile()`.
4. The service checks upload size and applies `UploadPolicyService.resolveMetadata()`.
5. If the provider exposes `uploadFileStream()`, the service uses the streaming path with configured chunk size.
6. The provider persists the blob and returns structured metadata.
7. The tool registry returns a stable `{ ok: true, data: ... }` envelope.
8. If policy or provider errors occur, the registry logs them, surfaces a clean error envelope, and optionally emits sanitized telemetry.

## 4. Implemented Features

### Tools

Implemented and registered:

- `shelby_healthcheck`
- `shelby_capabilities`
- `shelby_account_info`
- `shelby_get_upload_policy`
- `shelby_get_safe_path_status`
- `shelby_set_safe_path`
- `shelby_list_local_upload_candidates`
- `shelby_list_blobs`
- `shelby_get_blob_metadata`
- `shelby_upload_file`
- `shelby_upload_text`
- `shelby_write_json`
- `shelby_download_blob`
- `shelby_read_blob_text`
- `shelby_get_blob_url`
- `shelby_batch_upload`
- `shelby_verify_blob`
- `shelby_delete_blob`

### Resources

Implemented:

- `shelby://system/capabilities`
- `shelby://system/account`
- `shelby://system/upload-policy`
- `shelby://system/sandbox`
- `shelby://system/tools`
- `shelby://system/workflows`

### Prompts

Implemented:

- `onboard-account`
- `prepare-batch-upload`
- `safe-upload-file`
- `inspect-and-read-blob`
- `verify-local-against-blob`

### Providers

- `MockShelbyProvider`: fully working local provider
- `RealShelbyProvider`: official Shelby SDK-backed adapter, partial but credible

### Security / Safety

- strict root scoping to `SHELBY_WORKDIR`
- active safe-scope narrowing via `shelby_set_safe_path`
- reserved internal directory blocking
- symlink escape checks using real-path validation
- upload size limits
- safe text-read truncation
- destructive tool gating
- strict metadata mode

### Enterprise / Operational Features

- streaming upload path in core service and mock provider
- opt-in telemetry with payload sanitization
- MCP logging bridge
- validated env config
- setup/bootstrap script
- `dev:mock` fast local entrypoint
- CI, ESLint, Prettier, Changesets, EditorConfig

### What Is Scaffolded Or Partial

- HTTP / streamable HTTP transport: future work only
- dashboard/admin UI: future work only
- auth/session and wallet-aware context: future work only
- media pipeline: only minimal service surface exists
- team/org features: future work only
- real provider streaming: not yet end-to-end streaming, currently buffered at the SDK boundary
- signed URLs: not yet implemented

## 5. Validation Results

Commands run during audit:

- `npm.cmd run setup`
- `npm.cmd run format:check`
- `npm.cmd run lint`
- `npm.cmd run typecheck`
- `npm.cmd test`
- `npm.cmd run build`
- `npm.cmd run dev:mock`
- `npm.cmd run start`

Results:

| Check                  | Status  | Notes                                                                                                                                                             |
| ---------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| install/setup          | PASS    | Initially failed because blank optional env vars from `.env.example` were treated as invalid values; fixed in config parsing, then `npm.cmd run setup` succeeded. |
| format                 | PASS    | `npm.cmd run format:check` passed after formatting touched files.                                                                                                 |
| lint                   | PASS    | `npm.cmd run lint` passed with strict ESLint rules enabled.                                                                                                       |
| typecheck              | PASS    | `npm.cmd run typecheck` passed.                                                                                                                                   |
| test                   | PASS    | `npm.cmd test` passed: 14 test files, 32 tests.                                                                                                                   |
| build                  | PASS    | `npm.cmd run build` passed.                                                                                                                                       |
| dev:mock               | PASS    | `npm.cmd run dev:mock` started and logged `Shelby MCP STDIO server is ready.`                                                                                     |
| compiled start         | PASS    | `npm.cmd run start` booted the built STDIO server and logged readiness.                                                                                           |
| mock provider workflow | PASS    | Covered by unit/integration tests and startup validation.                                                                                                         |
| resource registration  | PASS    | Verified by `tests/integration/resources-prompts.test.ts`.                                                                                                        |
| prompt registration    | PASS    | Verified by `tests/integration/resources-prompts.test.ts`.                                                                                                        |
| streaming upload       | PARTIAL | Fully validated for the core service and mock provider; real provider still buffers at the SDK boundary.                                                          |
| strict metadata        | PASS    | Covered by `tests/integration/strict-metadata.test.ts` and upload policy wiring.                                                                                  |
| telemetry toggle       | PASS    | Covered by unit and integration tests; no sensitive raw fields are emitted.                                                                                       |
| sandbox protection     | PASS    | Covered by unit tests and visible in service implementation.                                                                                                      |

Notable test coverage shape:

- config validation: `tests/unit/config.test.ts`
- path guard and safe scope: `tests/unit/fs-paths.test.ts`, `tests/unit/sandbox.test.ts`
- mock provider: `tests/unit/mock-provider.test.ts`
- streaming uploads: `tests/unit/streaming-upload.test.ts`
- telemetry: `tests/unit/telemetry.test.ts`, `tests/integration/telemetry.test.ts`
- strict metadata: `tests/integration/strict-metadata.test.ts`
- batch upload: `tests/integration/batch-upload.test.ts`
- destructive tool gating: `tests/integration/destructive-tools.test.ts`
- resources/prompts: `tests/integration/resources-prompts.test.ts`
- tool registration/core server: `tests/integration/mcp-core.test.ts`

## 6. Architecture Assessment

Overall assessment: good.

What works well:

- Clean layering is real, not cosmetic.
- MCP transport concerns live in `mcp-core` and the STDIO app entrypoint, not inside provider code.
- The service layer owns business rules such as upload size limits, download safety, metadata policy, and destructive gating.
- The sandbox is a dedicated boundary, not a helper sprinkled across handlers.
- Provider types are stable and JSON-friendly.
- The design is compatible with a future HTTP transport because tool/resource/prompt registration and domain services are already separate.

Extensibility assessment:

- HTTP transport readiness: good
- dashboard/auth/media/team extensions: good structural readiness
- independent package publishing readiness: moderate; the layout supports it, but actual workspace/package boundaries are still single-root

Minor design debt:

- Some directory structure is future-facing and partially re-export-based, for example `packages/mcp-core/src/server/index.ts` and `packages/mcp-core/src/registry/index.ts`. This is not harmful, but it reflects forward planning more than immediate necessity.
- `MediaService` is intentionally thin today.

## 7. Security Assessment

Overall assessment: strong for a local-first MCP server.

Positive findings:

- `SandboxService` enforces root confinement to `SHELBY_WORKDIR`.
- Safe-path narrowing cannot widen once restricted.
- Reserved internal directories such as storage/temp internals are blocked from agent access.
- Real-path validation reduces symlink escape risk.
- Output paths for downloads are resolved through the sandbox before writes.
- Delete is disabled unless `ALLOW_DESTRUCTIVE_TOOLS=true`.
- Strict metadata policy is consistently applied before upload begins.
- Telemetry redacts paths, metadata, authorization-like fields, and oversized strings.
- Logs go to `stderr`, preserving STDIO transport integrity.

Limitations to understand:

- This is still a local trusted-user model. There is no auth/session boundary.
- The real provider download and verification paths read remote content into memory; this is more of an operational/performance concern than a sandbox issue, but it matters for large blobs.
- There is no multi-user isolation, hosted policy engine, or destructive-action audit trail beyond logs.

## 8. Provider Assessment

### MockShelbyProvider

What works well:

- It is fully functional and suitable for CI and local development.
- Uploads are persisted on disk inside `SHELBY_STORAGE_DIR/mock-provider`.
- Metadata is indexed in a local JSON index.
- Checksums are computed.
- Pagination works.
- Text reads support truncation.
- Downloads write to safe local paths.
- URLs are returned as local file URLs.
- Stream-based upload is implemented for file uploads, including partial-write cleanup.

What is credible:

- The mock provider behaves like a believable local Shelby development environment rather than a fake success stub.
- Capability reporting is honest.

What is incomplete:

- No signed URLs
- No media features
- Naturally limited to local filesystem semantics

What should improve before upstream proposal:

- Add one or two more integration tests around mock-provider pagination edge cases and index recovery/corruption handling.

### RealShelbyProvider

What works well:

- It uses the official `@shelby-protocol/sdk/node` package and Aptos signer types.
- Read-only flows such as list, metadata lookup, download, read text, URL generation, and verification are implemented in a real adapter, not a placeholder.
- Write operations are capability-gated on signer/account configuration.
- Upload results fall back honestly when indexer metadata is not immediately available.

What is credible:

- The provider is materially useful and much better than a TODO shell.
- Capability flags accurately reflect the degraded areas.

What is incomplete:

- `supportsStreamingUpload` is false because file uploads still buffer at the SDK boundary.
- Batch uploads also buffer in memory before submission.
- Verification downloads the full remote blob into memory.
- Signed URLs are not supported.
- There are no live-network integration tests in CI.

What should improve before upstream proposal:

- End-to-end streaming support in the real adapter if/when the Shelby SDK allows it
- Real-provider smoke tests against a controlled environment
- Better per-file failure reporting for real-provider batch uploads
- Clearer production auth/session story before claiming hosted-readiness

## 9. Tooling / MCP UX Assessment

Overall assessment: strong.

Positive findings:

- Tool naming is explicit and coherent.
- Response envelopes are consistent across tools.
- Error codes are actionable and intentionally avoid raw stack traces.
- `shelby://system/*` resources are genuinely useful for agent planning.
- Prompts are workflow-oriented rather than decorative.
- The combination of resources, prompts, upload policy visibility, and sandbox status makes the server realistically usable by an LLM host.

Current limitations:

- There is no external MCP-client end-to-end automation test; validation relies on direct core-server integration tests plus manual boot checks.
- The resource system is currently dynamic but simple; there is no templated resource expansion or richer state browsing yet.

## 10. Observability Assessment

Overall assessment: good and appropriately scoped.

Strengths:

- Pino-based structured logs go to `stderr`.
- `McpLogBridge` forwards important warnings/errors to MCP clients.
- Startup warnings, strict metadata denials, sandbox violations, and provider failures are surfaced appropriately.
- Telemetry is disabled by default and safely isolated from core tool behavior.
- Telemetry send failures do not affect tool success/failure semantics.

Remaining gaps:

- No request IDs or correlation IDs yet
- No metrics/traces
- No batching/retry/backoff strategy for telemetry beyond best-effort fire-and-forget

## 11. Developer Experience Assessment

Overall assessment: good.

What works:

- `setup` now prepares a working local environment without overwriting an existing `.env`.
- `dev:mock` gives a fast path into a working local server.
- `check`/lint/typecheck/test/build scripts are coherent.
- CI and local commands are aligned.
- The mock provider makes the repo immediately usable without real credentials.

DX caveats:

- The README currently uses `npm.cmd` throughout, which is accurate on this Windows machine but not ideal for a cross-platform open-source README.
- The project uses a monorepo-style layout without real workspace tooling, which is fine for the current size but slightly less formal than a true multi-package workspace.

## 12. Documentation Assessment

Overall assessment: good, with one audit-time portability fix applied.

By document:

- `README.md`: strong overview, feature map, architecture explanation, tool/resource/prompt catalog, and quick-start instructions. Accurate to the implementation.
- `docs/architecture.md`: accurately reflects the current codebase and now includes a useful Mermaid diagram and request flow explanation.
- `docs/tool-spec.md`: aligned with the tool surface and response envelopes.
- `docs/resources-prompts.md`: accurately describes the actual `shelby://system/*` resources and prompts.
- `docs/security.md`: matches the actual sandbox, gating, telemetry, and trust model well.
- `docs/observability.md`: accurate to the implemented logger, MCP bridge, and telemetry behavior.
- `docs/roadmap.md`: clearly future-oriented without pretending future phases already exist.

Documentation gap that remains:

- The docs are now path-portable, but the command examples are still Windows-biased.

## 13. Code Quality Assessment

Overall assessment: disciplined and maintainable.

Positive findings:

- ESLint is strict enough to catch real issues without becoming unusable.
- Type safety is strong.
- Public/domain types are explicit.
- Test structure is sensible and easy to follow.
- Comments are sparse and mostly justified.
- The code avoids giant framework-heavy abstractions.

Technical debt hotspots:

- Real-provider memory behavior for upload/batch/verify paths
- Single-root package management despite multi-package source layout
- Minimal live integration coverage outside mock mode

Lint/format posture:

- no unused vars unless intentionally underscore-prefixed
- no duplicate imports
- consistent type-only imports
- no `console`
- `no-floating-promises` enabled
- Prettier enforced in CI

## 14. Small Corrective Fixes Applied During Audit

### Fix 1: setup flow restored for default `.env.example`

Files:

- `packages/shared/src/config/index.ts`
- `tests/unit/config.test.ts`

Change:

- Optional env vars such as `SHELBY_API_URL`, `TELEMETRY_ENDPOINT`, and default metadata fields now treat blank strings as unset values instead of invalid configuration.

Why:

- `npm.cmd run setup` copied `.env.example`, then failed because blank optional fields were being validated as invalid strings/URLs.

Impact:

- The documented one-command setup flow now works as intended.

### Fix 2: documentation links made repo-portable

Files:

- `README.md`
- `docs/architecture.md`
- `docs/observability.md`
- `docs/resources-prompts.md`
- `docs/roadmap.md`
- `docs/security.md`
- `docs/tool-spec.md`

Change:

- Replaced absolute local markdown links pointing at `C:/Users/...` with repo-relative links.

Why:

- Machine-local absolute links are unsuitable for GitHub and misleading for maintainers on other machines.

Impact:

- The docs are now portable and credible for publication.

## 15. Risks / Gaps / Inconsistencies

1. The real provider is credible but not production-mature yet. Its upload and batch paths still buffer files in memory, so the streaming story is local/mock-first today.
2. There are no live real-provider integration tests in CI. This is the biggest remaining confidence gap before a serious upstream proposal.
3. CI is Linux-only. Given the strong local DX focus and Windows-visible path behavior, a Windows CI leg would be valuable.
4. The README is Windows-skewed (`npm.cmd` examples and Windows-centric MCP config). That is acceptable for this environment but not ideal for a broadly published repo.
5. The current workspace snapshot is not a Git repository, so release/version flow could only be checked statically via config files, not operationally.
6. `RealShelbyProvider.batchUpload()` cannot provide rich per-file continuation semantics because it submits buffered blobs as one batch operation.
7. `MediaService` exists mainly as future-proof structure today; it is not a meaningful feature area yet.
8. The monorepo-style source layout is clean, but packages are not independently versioned or published.

## 16. Recommended Next Steps

### Must do before publish

- Normalize README command examples to cross-platform `npm` usage or document Windows/Linux variants explicitly.
- Mark the real provider clearly as experimental in release messaging unless live smoke tests are added first.
- Add a Windows job to CI, or a matrix with Linux and Windows.

### Should do soon

- Add live real-provider smoke tests against a controlled Shelby environment.
- Improve real-provider upload and batch memory behavior when the Shelby SDK supports streaming inputs.
- Add an external MCP-client smoke test script to validate discovery/boot from a host perspective, not just direct core-server tests.
- Add request/correlation IDs to logs for easier operator debugging.

### Nice-to-have future work

- HTTP / streamable HTTP transport
- richer media pipeline
- auth/session model
- wallet-aware user context
- team/org support
- signed URLs
- more advanced telemetry delivery controls

## 17. Upstream Readiness Verdict

Verdict: Publish-ready as experimental; needs real-provider maturation before formal Shelby upstream proposal.

Reasoning:

- The repo is already credible as a Shelby-adjacent developer tool.
- The local-first mock-backed story is very strong.
- The architecture is clean enough to extend without rewrites.
- The biggest thing holding it back from an upstream-quality proposal is not the core design; it is confidence in the real-provider production path and lack of live-network validation.

If the goal is:

- commit and continue iterating: yes
- publish as an experimental open-source repo: yes
- present as a serious Shelby ecosystem candidate: yes
- propose as an official upstream repo immediately: wait until the real-provider story is better exercised

## 18. Appendix

### Key Scripts

- `npm run setup`
- `npm run dev`
- `npm run dev:mock`
- `npm run build`
- `npm run start`
- `npm test`
- `npm run lint`
- `npm run typecheck`
- `npm run format:check`
- `npm run check`

### Key Environment Variables

- `SHELBY_PROVIDER`
- `SHELBY_WORKDIR`
- `SHELBY_STORAGE_DIR`
- `TEMP_DIR`
- `MAX_UPLOAD_SIZE_MB`
- `MAX_READ_TEXT_BYTES`
- `STREAM_UPLOAD_CHUNK_SIZE_BYTES`
- `ALLOW_DESTRUCTIVE_TOOLS`
- `SHELBY_STRICT_METADATA`
- `SHELBY_REQUIRED_METADATA_KEYS`
- `SHELBY_DEFAULT_CONTENT_OWNER`
- `SHELBY_DEFAULT_CLASSIFICATION`
- `SHELBY_DEFAULT_SOURCE`
- `TELEMETRY_ENABLED`
- `TELEMETRY_ENDPOINT`
- `TELEMETRY_ENVIRONMENT`
- `TELEMETRY_SAMPLE_RATE`
- `SHELBY_NETWORK`
- `SHELBY_ACCOUNT_ID`
- `SHELBY_API_URL`
- `SHELBY_API_KEY`
- `SHELBY_PRIVATE_KEY`

### Key Modules

- `apps/server-stdio/src/index.ts`
- `packages/mcp-core/src/server.ts`
- `packages/mcp-core/src/tool-registry.ts`
- `packages/mcp-core/src/resources/system-resources.ts`
- `packages/mcp-core/src/prompts/system-prompts.ts`
- `packages/shelby-service/src/index.ts`
- `packages/shelby-service/src/blob/blob-service.ts`
- `packages/shelby-service/src/blob/upload-policy.ts`
- `packages/shelby-service/src/sandbox/sandbox-service.ts`
- `packages/shelby-service/src/provider/mock-provider.ts`
- `packages/shelby-service/src/provider/real-provider.ts`
- `packages/shared/src/config/index.ts`
- `packages/shared/src/logger/index.ts`
- `packages/shared/src/telemetry/index.ts`

### Brief Feature Matrix

| Area                            | State                                                |
| ------------------------------- | ---------------------------------------------------- |
| STDIO MCP server                | Implemented and runnable                             |
| MCP tools                       | Implemented                                          |
| MCP resources                   | Implemented                                          |
| MCP prompts                     | Implemented                                          |
| Mock provider                   | Implemented and validated                            |
| Real provider                   | Implemented, partial maturity                        |
| Sandbox / safe scope            | Implemented and validated                            |
| Streaming uploads               | Implemented in core + mock, partial in real provider |
| Strict metadata                 | Implemented                                          |
| Telemetry toggle                | Implemented                                          |
| CI / lint / format / tests      | Implemented                                          |
| HTTP transport                  | Future                                               |
| Dashboard UI                    | Future                                               |
| Auth / session / wallet context | Future                                               |
| Team / org support              | Future                                               |
