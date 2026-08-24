import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { LabelBadges, LabelFilter } from "@/features/labels/label-controls";
import { LabelSettings } from "@/features/labels/label-settings";
import type { MailLabel } from "@/features/labels/types";

const label: MailLabel = {
  color: "blue",
  createdAt: "2026-08-24T12:00:00.000Z",
  id: "label-1",
  name: "Customer",
  updatedAt: "2026-08-24T12:00:00.000Z"
};

describe("label controls", () => {
  it("shows a label filter and compact visible assignments", () => {
    const filter = renderToStaticMarkup(
      <LabelFilter labels={[label]} value="all" onChange={() => undefined} />
    );
    const badges = renderToStaticMarkup(<LabelBadges labels={[label]} />);

    expect(filter).toContain('aria-label="Filter by label"');
    expect(filter).toContain("All labels");
    expect(badges).toContain("Customer");
  });

  it("lets managers maintain shared labels with compact actions", () => {
    const html = renderToStaticMarkup(
      <LabelSettings canManage labels={[label]} onChanged={async () => undefined} />
    );

    expect(html).toContain("Shared organization for people and mail agents");
    expect(html).toContain("Add label");
    expect(html).toContain('aria-label="Edit Customer"');
    expect(html).toContain('aria-label="Delete Customer"');
    expect(html).not.toContain("h-11");
  });
});
