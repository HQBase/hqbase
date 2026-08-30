import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ComposeFields } from "@/features/compose/compose-fields";

describe("compose fields", () => {
  it("renders editable reply recipients without hardcoded explanatory copy", () => {
    const html = renderToStaticMarkup(
      <ComposeFields
        bcc=""
        cc=""
        from="support@example.com"
        fromDisabled={false}
        identities={[
          { mailboxId: "mbx_1", address: "support@example.com", displayName: "Support" }
        ]}
        mode="reply"
        subject="Re: Account access"
        to="customer@example.com"
        setBcc={() => undefined}
        setCc={() => undefined}
        setFrom={() => undefined}
        setSubject={() => undefined}
        setTo={() => undefined}
      />
    );

    expect(html).toContain('aria-label="To"');
    expect(html).toContain('aria-label="Show Cc and Bcc"');
    expect(html).not.toContain('aria-label="Cc"');
    expect(html).not.toContain('aria-label="Bcc"');
    expect(html).toContain("Support — support@example.com");
    expect(html).toContain("[&amp;_input]:h-[38px]");
    expect(html).not.toContain("Replying to");
  });

  it("shows optional recipient fields when a draft contains Cc or Bcc recipients", () => {
    for (const [cc, bcc] of [
      ["team@example.net", ""],
      ["", "audit@example.net"]
    ]) {
      const html = renderToStaticMarkup(
        <ComposeFields
          bcc={bcc}
          cc={cc}
          from="support@example.com"
          fromDisabled={false}
          identities={[
            { mailboxId: "mbx_1", address: "support@example.com", displayName: "Support" }
          ]}
          mode="new"
          subject="Status update"
          to="customer@example.com"
          setBcc={() => undefined}
          setCc={() => undefined}
          setFrom={() => undefined}
          setSubject={() => undefined}
          setTo={() => undefined}
        />
      );

      expect(html).toContain('aria-label="Cc"');
      expect(html).toContain('aria-label="Bcc"');
      expect(html).not.toContain('aria-label="Show Cc and Bcc"');
    }
  });
});
