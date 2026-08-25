import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@worker/features/drafts/queries", () => ({
  addDraftAttachment: vi.fn(),
  deleteDraftAttachmentRecord: vi.fn()
}));
vi.mock("@worker/features/drafts/attachment-lookups", () => ({
  draftAttachmentRecordExists: vi.fn()
}));

import { draftAttachmentRecordExists } from "@worker/features/drafts/attachment-lookups";
import { storeDraftAttachment } from "@worker/features/drafts/attachments";
import { addDraftAttachment, deleteDraftAttachmentRecord } from "@worker/features/drafts/queries";

const attachment = {
  id: "att_inline",
  filename: "pixel.png",
  contentType: "image/png",
  sizeBytes: 8,
  inline: true
};
const pngHeader = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe("draft attachment storage", () => {
  const put = vi.fn();
  const deleteObject = vi.fn();
  const env = {
    DB: {} as D1Database,
    MAIL_OBJECTS: { delete: deleteObject, put } as unknown as R2Bucket
  };

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(draftAttachmentRecordExists).mockResolvedValue(true);
    vi.mocked(addDraftAttachment).mockResolvedValue({
      attachment,
      r2Key: "drafts/usr_1/drf_1/att_inline"
    });
  });

  it("stores an inline image after recording its metadata", async () => {
    const file = new File([pngHeader], "pixel.png", { type: "image/png" });

    await expect(storeDraftAttachment(env, "usr_1", "drf_1", file, true)).resolves.toEqual(
      attachment
    );
    expect(addDraftAttachment).toHaveBeenCalledWith(env.DB, "usr_1", "drf_1", file, true);
    expect(put).toHaveBeenCalledWith("drafts/usr_1/drf_1/att_inline", expect.any(ReadableStream), {
      httpMetadata: { contentType: "image/png" }
    });
    expect(draftAttachmentRecordExists).toHaveBeenCalledWith(
      env.DB,
      "usr_1",
      "drf_1",
      "att_inline",
      "drafts/usr_1/drf_1/att_inline"
    );
    expect(deleteDraftAttachmentRecord).not.toHaveBeenCalled();
  });

  it("removes a recreated object when its metadata was deleted during upload", async () => {
    vi.mocked(draftAttachmentRecordExists).mockResolvedValue(false);

    await expect(
      storeDraftAttachment(
        env,
        "usr_1",
        "drf_1",
        new File([pngHeader], "pixel.png", { type: "image/png" }),
        true
      )
    ).rejects.toMatchObject({ code: "ATTACHMENT_NOT_FOUND", status: 404 });
    expect(deleteDraftAttachmentRecord).toHaveBeenCalledWith(env.DB, "drf_1", "att_inline");
    expect(deleteObject).toHaveBeenCalledWith("drafts/usr_1/drf_1/att_inline");
  });

  it("removes recorded metadata when R2 storage fails", async () => {
    const failure = new Error("R2 unavailable");
    put.mockRejectedValue(failure);

    await expect(
      storeDraftAttachment(
        env,
        "usr_1",
        "drf_1",
        new File([pngHeader], "pixel.png", { type: "image/png" }),
        true
      )
    ).rejects.toBe(failure);
    expect(deleteDraftAttachmentRecord).toHaveBeenCalledWith(env.DB, "drf_1", "att_inline");
    expect(deleteObject).toHaveBeenCalledWith("drafts/usr_1/drf_1/att_inline");
  });

  it("rejects unsupported inline media before recording metadata", async () => {
    await expect(
      storeDraftAttachment(
        env,
        "usr_1",
        "drf_1",
        new File(["text"], "note.txt", { type: "text/plain" }),
        true
      )
    ).rejects.toMatchObject({ code: "INLINE_MEDIA_UNSUPPORTED", status: 415 });
    expect(addDraftAttachment).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();
  });

  it("rejects an inline file whose bytes do not match its image MIME type", async () => {
    await expect(
      storeDraftAttachment(
        env,
        "usr_1",
        "drf_1",
        new File(["<svg></svg>"], "spoofed.png", { type: "image/png" }),
        true
      )
    ).rejects.toMatchObject({ code: "INLINE_MEDIA_UNSUPPORTED", status: 415 });
    expect(addDraftAttachment).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();
  });
});
