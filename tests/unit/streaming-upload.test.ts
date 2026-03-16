import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import {
  BlobService,
  SandboxService,
  type ShelbyProvider,
  UploadPolicyService
} from "../../packages/shelby-service/src/index.js";
import { createLogger, streamFileToDestination } from "../../packages/shared/src/index.js";
import {
  cleanupDirectory,
  createTempWorkspace,
  createTestConfig,
  writeFixtureFile
} from "../helpers.js";

describe("streaming uploads", () => {
  const created: string[] = [];

  afterEach(async () => {
    await Promise.all(created.map((directory) => cleanupDirectory(directory)));
    created.length = 0;
  });

  test("BlobService routes file uploads through the provider streaming path", async () => {
    const workspace = await createTempWorkspace();
    created.push(workspace);
    const workdir = path.join(workspace, "workdir");
    const logger = createLogger({ logLevel: "silent" });

    let streamCall:
      | {
          path: string;
          chunkSizeBytes: number;
          sizeBytes: number;
        }
      | undefined;

    const provider: ShelbyProvider = {
      capabilities: () => ({
        supportsDelete: false,
        supportsSignedUrls: false,
        supportsMetadata: true,
        supportsBatch: false,
        supportsVerification: false,
        supportsMedia: false,
        supportsPagination: false,
        supportsStreamingUpload: true,
        supportsStrictMetadataValidation: true,
        mode: "mock"
      }),
      getAccountInfo: async () => ({
        provider: "test",
        mode: "mock",
        status: "ready",
        capabilities: {
          supportsDelete: false,
          supportsSignedUrls: false,
          supportsMetadata: true,
          supportsBatch: false,
          supportsVerification: false,
          supportsMedia: false,
          supportsPagination: false,
          supportsStreamingUpload: true,
          supportsStrictMetadataValidation: true,
          mode: "mock"
        }
      }),
      listBlobs: async () => ({ items: [] }),
      getBlobMetadata: async () => {
        throw new Error("not used");
      },
      uploadFile: async () => {
        throw new Error("buffered upload path should not be used");
      },
      uploadFileStream: async (input) => {
        streamCall = {
          path: input.path,
          chunkSizeBytes: input.chunkSizeBytes,
          sizeBytes: input.sizeBytes
        };
        return {
          id: "blob-1",
          key: "blob-1",
          name: "demo.txt",
          size: input.sizeBytes,
          contentType: input.contentType,
          createdAt: new Date().toISOString()
        };
      },
      uploadText: async () => {
        throw new Error("not used");
      },
      downloadBlob: async () => {
        throw new Error("not used");
      },
      readBlobText: async () => {
        throw new Error("not used");
      },
      getBlobUrl: async () => {
        throw new Error("not used");
      },
      deleteBlob: async () => {
        throw new Error("not used");
      },
      batchUpload: async () => {
        throw new Error("not used");
      },
      verifyBlob: async () => {
        throw new Error("not used");
      },
      healthcheck: async () => ({
        ok: true,
        provider: "test",
        mode: "mock",
        config: {},
        warnings: []
      })
    };

    const config = createTestConfig({
      shelbyWorkdir: workdir,
      shelbyStorageDir: path.join(workdir, ".shelby-system", "storage"),
      tempDir: path.join(workdir, ".shelby-system", "tmp")
    });
    const sandbox = new SandboxService(config, logger);
    await sandbox.initialize();

    const blobService = new BlobService(
      provider,
      config,
      sandbox,
      logger,
      new UploadPolicyService(config, provider, logger)
    );

    const sourcePath = path.join(workdir, "input", "demo.txt");
    await writeFixtureFile(sourcePath, "stream me");

    const result = await blobService.uploadFile({
      path: "input/demo.txt"
    });

    expect(result.key).toBe("blob-1");
    expect(streamCall?.chunkSizeBytes).toBe(config.streamUploadChunkSizeBytes);
    expect(streamCall?.path).toBe(sourcePath);
  });

  test("streaming uploads still respect sandbox path restrictions", async () => {
    const workspace = await createTempWorkspace();
    created.push(workspace);
    const workdir = path.join(workspace, "workdir");
    const outsidePath = path.join(workspace, "outside.txt");
    await writeFixtureFile(outsidePath, "outside");

    let uploadCalled = false;
    const provider: ShelbyProvider = {
      capabilities: () => ({
        supportsDelete: false,
        supportsSignedUrls: false,
        supportsMetadata: true,
        supportsBatch: false,
        supportsVerification: false,
        supportsMedia: false,
        supportsPagination: false,
        supportsStreamingUpload: true,
        supportsStrictMetadataValidation: true,
        mode: "mock"
      }),
      getAccountInfo: async () => ({
        provider: "test",
        mode: "mock",
        status: "ready",
        capabilities: {
          supportsDelete: false,
          supportsSignedUrls: false,
          supportsMetadata: true,
          supportsBatch: false,
          supportsVerification: false,
          supportsMedia: false,
          supportsPagination: false,
          supportsStreamingUpload: true,
          supportsStrictMetadataValidation: true,
          mode: "mock"
        }
      }),
      listBlobs: async () => ({ items: [] }),
      getBlobMetadata: async () => {
        throw new Error("not used");
      },
      uploadFile: async () => {
        throw new Error("not used");
      },
      uploadFileStream: async () => {
        uploadCalled = true;
        throw new Error("not used");
      },
      uploadText: async () => {
        throw new Error("not used");
      },
      downloadBlob: async () => {
        throw new Error("not used");
      },
      readBlobText: async () => {
        throw new Error("not used");
      },
      getBlobUrl: async () => {
        throw new Error("not used");
      },
      deleteBlob: async () => {
        throw new Error("not used");
      },
      batchUpload: async () => {
        throw new Error("not used");
      },
      verifyBlob: async () => {
        throw new Error("not used");
      },
      healthcheck: async () => ({
        ok: true,
        provider: "test",
        mode: "mock",
        config: {},
        warnings: []
      })
    };

    const config = createTestConfig({
      shelbyWorkdir: workdir,
      shelbyStorageDir: path.join(workdir, ".shelby-system", "storage"),
      tempDir: path.join(workdir, ".shelby-system", "tmp")
    });
    const logger = createLogger({ logLevel: "silent" });
    const sandbox = new SandboxService(config, logger);
    await sandbox.initialize();

    const blobService = new BlobService(
      provider,
      config,
      sandbox,
      logger,
      new UploadPolicyService(config, provider, logger)
    );

    await expect(
      blobService.uploadFile({
        path: outsidePath
      })
    ).rejects.toThrow(/configured Shelby workdir/i);
    expect(uploadCalled).toBe(false);
  });

  test("stream file helper cleans up partial output on failure", async () => {
    const workspace = await createTempWorkspace();
    created.push(workspace);

    const sourcePath = path.join(workspace, "source.bin");
    const destinationPath = path.join(workspace, "output.bin");
    await fs.writeFile(sourcePath, Buffer.alloc(2048, 7));

    await expect(
      streamFileToDestination({
        sourcePath,
        destinationPath,
        chunkSizeBytes: 128,
        onChunk: () => {
          throw new Error("forced stream failure");
        }
      })
    ).rejects.toThrow(/forced stream failure/i);

    await expect(fs.stat(destinationPath)).rejects.toThrow();
  });
});
