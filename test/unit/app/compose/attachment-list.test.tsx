import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AttachmentList } from "@/features/compose/attachment-list";

describe("compose attachment list", () => {
  it("hides inline images from the normal attachment list", () => {
    const html = renderToStaticMarkup(
      <AttachmentList
        attachments={[
          {
            id: "inline-1",
            filename: "logo.png",
            contentType: "image/png",
            sizeBytes: 8,
            inline: true
          },
          {
            id: "file-1",
            filename: "report.pdf",
            contentType: "application/pdf",
            sizeBytes: 12,
            inline: false
          }
        ]}
        onRemove={() => undefined}
      />
    );

    expect(html).not.toContain("logo.png");
    expect(html).toContain("report.pdf");
  });

  it("shows original files as included without a remove action", () => {
    const html = renderToStaticMarkup(
      <AttachmentList
        attachments={[]}
        includedAttachments={[
          {
            id: "original-file",
            filename: "original.pdf",
            contentType: "application/pdf",
            sizeBytes: 2048,
            contentId: null,
            disposition: "attachment"
          }
        ]}
        onRemove={() => undefined}
      />
    );

    expect(html).toContain("Included from original message");
    expect(html).toContain("original.pdf");
    expect(html).not.toContain("Remove original.pdf");
  });
});
