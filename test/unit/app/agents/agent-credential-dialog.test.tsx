import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Dialog } from "@/components/ui/dialog";
import { AgentCredentialContent } from "@/features/agents/agent-credential-dialog";

describe("agent credential reveal", () => {
  it("makes the one-time credential warning explicit", () => {
    const html = renderToStaticMarkup(
      <Dialog>
        <AgentCredentialContent
          agentName="Support assistant"
          agentProfile="mailbox"
          credential="hqb_agent_secret"
          onDone={() => undefined}
        />
      </Dialog>
    );

    expect(html).toContain("Agent credential created");
    expect(html).toContain("Shown once");
    expect(html).toContain("stores only a hash");
    expect(html).toContain('aria-label="Agent credential"');
    expect(html).toContain("hqb_agent_secret");
    expect(html).toContain("Copy this credential before you close");
    expect(html).toContain("/skills/hqbase-mailbox/SKILL.md");
    expect(html).not.toContain("/skills/hqbase-provisioner/SKILL.md");
  });

  it("shows a provisioner the matching skill", () => {
    const html = renderToStaticMarkup(
      <Dialog>
        <AgentCredentialContent
          agentName="Mailbox factory"
          agentProfile="provisioner"
          credential="hqb_agent_secret"
          onDone={() => undefined}
        />
      </Dialog>
    );

    expect(html).toContain("Provisioner skill");
    expect(html).toContain("/skills/hqbase-provisioner/SKILL.md");
    expect(html).not.toContain("/skills/hqbase-mailbox/SKILL.md");
  });
});
