# Tool Spec

All tools return one of these envelopes:

```json
{ "ok": true, "data": { "...": "..." } }
```

```json
{
  "ok": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable explanation",
    "details": {}
  }
}
```

## `shelby_healthcheck`

- Purpose: perform a lightweight provider and configuration sanity check
- Inputs: none
- Outputs: `ok`, `provider`, `mode`, safe config summary, `warnings[]`, `uploadPolicy?`, `telemetry?`
- Failure cases: provider initialization errors

## `shelby_capabilities`

- Purpose: expose provider capabilities in machine-readable form
- Inputs: none
- Outputs: capability flags, provider mode, notes
- Failure cases: provider initialization errors

## `shelby_account_info`

- Purpose: return current provider, account, network, status, and capabilities
- Inputs: none
- Outputs: `provider`, `mode`, `accountId?`, `network?`, `status`, `capabilities`, `notes?`
- Failure cases: provider initialization errors

## `shelby_get_upload_policy`

- Purpose: return the active upload policy, including strict metadata rules and stream chunk sizing
- Inputs: none
- Outputs: `strictMetadata`, `requiredMetadataKeys[]`, `defaultMetadataKeys[]`, upload limits, streaming support, destructive tool status
- Failure cases: unexpected runtime policy errors

## `shelby_get_safe_path_status`

- Purpose: show the current sandbox root and narrowed active scope
- Inputs: none
- Outputs: `rootPath`, `activeScopePath`, `effectiveScope`, `storageDir`, `tempDir`, limits, restrictions
- Failure cases: unexpected sandbox initialization errors

## `shelby_set_safe_path`

- Purpose: narrow the active safe working scope to a subdirectory within `SHELBY_WORKDIR`
- Inputs: `path`
- Outputs: `safePath`, `resolvedPath`, `rootPath`, `effectiveScope`, `ok`
- Failure cases: path outside root, path outside current safe scope, reserved internal directory, directory missing, symlink escape

## `shelby_list_local_upload_candidates`

- Purpose: inspect a safe local directory before upload
- Inputs: `directory`, `recursive?`, `maxEntries?`
- Outputs: `files[]`, `totalDiscovered`, `truncated`
- Failure cases: sandbox violation, directory missing, invalid path type

## `shelby_list_blobs`

- Purpose: list blobs for the active provider/account context
- Inputs: `prefix?`, `limit?`, `cursor?`
- Outputs: `items[]`, `nextCursor?`, `totalKnown?`
- Failure cases: invalid cursor, provider list failure

## `shelby_get_blob_metadata`

- Purpose: fetch metadata for a blob by `blobId` or `blobKey`
- Inputs: `blobId?`, `blobKey?`
- Outputs: blob metadata including size, content type, timestamps, checksum if available, provider metadata
- Failure cases: missing identifier, blob not found, provider metadata failure

## `shelby_upload_file`

- Purpose: upload a local file from within the active sandbox scope
- Inputs: `path`, `targetName?`, `contentType?`, `metadata?`
- Outputs: upload metadata, checksum when available, retrieval info when available
- Failure cases: sandbox violation, file missing, file too large, strict metadata rejection, provider upload failure
- Notes: the core service routes file uploads through the provider streaming entrypoint when available

## `shelby_upload_text`

- Purpose: upload inline text content as a blob
- Inputs: `text`, `targetName`, `contentType?`, `metadata?`
- Outputs: upload result metadata
- Failure cases: payload too large, strict metadata rejection, provider upload failure

## `shelby_write_json`

- Purpose: serialize JSON content and upload it as a blob
- Inputs: `data`, `targetName`, `metadata?`
- Outputs: upload result metadata
- Failure cases: serialization failure, payload too large, strict metadata rejection, provider upload failure

## `shelby_download_blob`

- Purpose: download a blob into a safe local output path
- Inputs: `blobId?`, `blobKey?`, `outputPath?`
- Outputs: `savedPath`, `bytesWritten`, `metadata`
- Failure cases: blob not found, sandbox violation, local write failure, provider download failure

## `shelby_read_blob_text`

- Purpose: read blob contents as text with safe truncation
- Inputs: `blobId?`, `blobKey?`, `maxBytes?`
- Outputs: `text`, `truncated`, `bytesRead`, `metadata`
- Failure cases: blob not found, non-text content, read failure

## `shelby_get_blob_url`

- Purpose: return retrieval URL information when supported
- Inputs: `blobId?`, `blobKey?`
- Outputs: `url`, `expiresAt?`, `note?`
- Failure cases: blob not found, URL generation unsupported

## `shelby_batch_upload`

- Purpose: upload multiple local files from the active sandbox scope
- Inputs: `paths[]`, `prefix?`, `continueOnError?`, `metadata?`
- Outputs: `successes[]`, `failures[]`
- Failure cases: sandbox violation, file missing, file too large, strict metadata rejection, provider batch failure

## `shelby_verify_blob`

- Purpose: compare remote blob integrity with remote checksum and optional local file checksum
- Inputs: `blobId?`, `blobKey?`, `localPath?`
- Outputs: `verified`, `checksumLocal?`, `checksumRemote?`, `note?`, `metadata?`
- Failure cases: blob not found, sandbox violation for local file, checksum unavailable, provider verification failure

## `shelby_delete_blob`

- Purpose: delete a blob
- Inputs: `blobId?`, `blobKey?`
- Outputs: `success`, `deletedId`
- Failure cases: destructive tools disabled, blob not found, delete unsupported, provider delete failure

## Error Semantics

Common error codes include:

- `VALIDATION_ERROR`
- `FILE_NOT_FOUND`
- `INVALID_PATH_TYPE`
- `SANDBOX_VIOLATION`
- `SAFE_SCOPE_VIOLATION`
- `SANDBOX_RESERVED_PATH`
- `SANDBOX_SYMLINK_ESCAPE`
- `BLOB_NOT_FOUND`
- `BLOB_NOT_TEXT`
- `STRICT_METADATA_REQUIRED`
- `UPLOAD_TOO_LARGE`
- `TOOL_DISABLED`
- `REAL_PROVIDER_CONFIG_ERROR`
- `REAL_PROVIDER_AUTH_REQUIRED`
- `REAL_PROVIDER_ERROR`

The exact details payload depends on context, but raw stack traces are intentionally not returned to MCP clients.
