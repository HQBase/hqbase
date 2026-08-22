import * as React from "react";
import { AgentConnectionDetails } from "@/features/agents/connection-dialog";
import type { CurrentUser } from "@/features/auth/types";
import { SettingsSection } from "@/features/settings/settings-section";

type McpSettingsProps = {
  user: CurrentUser;
};

export function McpSettings({ user }: McpSettingsProps): React.ReactElement {
  const [readOnlyEndpoint, setReadOnlyEndpoint] = React.useState("/mcp");
  const [fullEndpoint, setFullEndpoint] = React.useState("/mcp/full");
  const [skillUrl, setSkillUrl] = React.useState("/skills/hqbase-mail/SKILL.md");
  const readOnlyEndpointId = React.useId();
  const fullEndpointId = React.useId();
  const skillUrlId = React.useId();

  React.useEffect(() => {
    setReadOnlyEndpoint(new URL("/mcp", window.location.origin).toString());
    setFullEndpoint(new URL("/mcp/full", window.location.origin).toString());
    setSkillUrl(new URL("/skills/hqbase-mail/SKILL.md", window.location.origin).toString());
  }, []);

  return (
    <SettingsSection
      description="Connect through MCP or install this deployment's Agent Skill."
      title="MCP"
    >
      <AgentConnectionDetails
        fullEndpoint={fullEndpoint}
        fullEndpointId={fullEndpointId}
        readOnlyEndpoint={readOnlyEndpoint}
        readOnlyEndpointId={readOnlyEndpointId}
        skillUrl={skillUrl}
        skillUrlId={skillUrlId}
        user={user}
      />
    </SettingsSection>
  );
}
