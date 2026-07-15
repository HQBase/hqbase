import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Sidebar } from "@/components/layout/sidebar";
import { TopBar } from "@/components/layout/top-bar";

const user = {
  id: "user-1",
  email: "olivia@example.com",
  name: "Olivia Berman",
  role: "owner" as const
};

describe("mail shell", () => {
  it("uses the full header width and keeps mail actions in a right-aligned group", () => {
    const html = renderToStaticMarkup(
      <TopBar
        mailboxId="all"
        mailboxes={[]}
        search=""
        user={user}
        onCompose={() => undefined}
        onMailboxChange={() => undefined}
        onSearchChange={() => undefined}
        onSignedOut={() => undefined}
      />
    );

    expect(html).toContain("h-14 w-full");
    expect(html).toContain("relative min-w-0 max-w-xl flex-1");
    expect(html).toContain("ml-auto flex shrink-0 items-center gap-2");
    expect(html).toContain("Search mail");
    expect(html).toContain("Compose");
    expect(html).toContain("OB");
  });

  it("renders the canonical logo instead of the HQ placeholder", () => {
    const html = renderToStaticMarkup(
      <Sidebar activeFolder="inbox" onFolderChange={() => undefined} />
    );

    expect(html).toContain('src="/logo.svg"');
    expect(html).not.toContain(">HQ<");
    expect(html).not.toContain(">Mail</div>");
  });
});
