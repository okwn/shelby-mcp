# Resources And Prompts

`shelby-mcp` ships MCP resources and prompts as first-class parts of the agent experience. They are intended to reduce unsafe guesswork and make the recommended Shelby workflows discoverable to the host model.

Together with the path-guard model, the `shelby://system/*` resources are one of the repository's defining DX features: agents can inspect state and policy before they ever touch the filesystem or provider layer.

Implementation:

- [packages/mcp-core/src/resources/system-resources.ts](../packages/mcp-core/src/resources/system-resources.ts)
- [packages/mcp-core/src/prompts/system-prompts.ts](../packages/mcp-core/src/prompts/system-prompts.ts)

## Resources

## `shelby://system/capabilities`

- Purpose: expose current provider state, transport mode, and destructive-tool status
- Contents:
  - account/provider info
  - provider capabilities
  - telemetry status
  - upload policy state
  - `transport: "stdio"`
  - destructive tool enablement
- Use when: an agent needs to know what operations are actually safe and supported before acting

## `shelby://system/account`

- Purpose: expose active account context and current provider health
- Contents:
  - account info
  - healthcheck result
- Use when: an agent needs to understand current network/account readiness

## `shelby://system/upload-policy`

- Purpose: expose the active upload policy without making the agent infer it from config
- Contents:
  - strict metadata mode
  - required metadata keys
  - default metadata key names
  - max upload size
  - stream chunk sizing
  - streaming support
  - telemetry status
- Use when: an agent needs to plan uploads safely before calling mutating tools

## `shelby://system/sandbox`

- Purpose: explain the active filesystem sandbox
- Contents:
  - root path
  - active scope path
  - effective relative scope
  - storage and temp directories
  - upload/read limits
  - safety restrictions
- Use when: an agent must reason about safe file paths before upload or download

## `shelby://system/tools`

- Purpose: provide a machine-readable tool catalog
- Contents:
  - tool names
  - short descriptions
- Use when: an agent wants a quick catalog without making assumptions

## `shelby://system/workflows`

- Purpose: provide recommended tool sequences
- Contents:
  - account inspection flow
  - upload policy inspection flow
  - safe upload flow
  - batch upload flow
  - text readback flow
  - verification flow
- Use when: an agent needs workflow guidance instead of just raw tool names

## Prompts

## `onboard-account`

- Purpose: bootstrap into the environment safely
- Guides the model to:
  - call `shelby_healthcheck`
  - call `shelby_capabilities`
  - call `shelby_account_info`
  - call `shelby_get_upload_policy`
  - call `shelby_get_safe_path_status`
  - summarize degraded real-provider conditions, streaming support, and strict metadata requirements before attempting uploads

## `prepare-batch-upload`

- Purpose: inspect the current safe path, list candidate files, and plan batch work
- Arguments:
  - `directory?`
- Guides the model to:
  - confirm sandbox scope
  - inspect upload policy
  - list candidate files
  - gather required metadata if strict mode is active
  - propose an upload plan
  - call `shelby_batch_upload`

## `safe-upload-file`

- Purpose: perform a metadata-aware, sandbox-aware single-file upload
- Arguments:
  - `path`
  - `targetName?`
- Guides the model to:
  - check sandbox status
  - check upload policy
  - upload the file
  - fetch metadata
  - fetch a blob URL

## `inspect-and-read-blob`

- Purpose: inspect blob metadata before reading text content
- Arguments:
  - `blobId?`
  - `blobKey?`
  - `maxBytes?`
- Guides the model to:
  - inspect metadata first
  - decide whether the content looks text-safe
  - call `shelby_read_blob_text`
  - report truncation behavior

## `verify-local-against-blob`

- Purpose: compare a local file to a remote blob
- Arguments:
  - `blobId?`
  - `blobKey?`
  - `localPath`
- Guides the model to:
  - inspect metadata
  - call `shelby_verify_blob`
  - report local and remote checksums where available

## Why They Matter

The resources and prompts are meant to shape safer, more reliable agent behavior:

- resources reduce hidden state
- prompts teach intended tool order
- both reduce accidental sandbox misuse and capability confusion

They are not decorative metadata; they are part of the MCP UX contract for this server.
