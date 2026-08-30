import * as React from "react";
import { PiMagnifyingGlass, PiPlus } from "react-icons/pi";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownSelect } from "@/components/ui/dropdown-select";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLabelRow
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupInput } from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

import { InventorySection, Specimen } from "./design-preview-shared";

const colorTokens = [
  ["Background", "bg-background"],
  ["Foreground", "bg-foreground"],
  ["Card", "bg-card"],
  ["Primary", "bg-primary"],
  ["Secondary", "bg-secondary"],
  ["Muted", "bg-muted"],
  ["Accent", "bg-accent"],
  ["Destructive", "bg-destructive"],
  ["Border", "bg-border"],
  ["Sidebar", "bg-sidebar"],
  ["List", "bg-list"],
  ["Selected", "bg-selected"]
] as const;

const typography = [
  ["Display", "text-4xl", "Shared work, clearly managed."],
  ["Page title", "text-2xl", "Workspace settings"],
  ["Section", "text-xl", "Email domains"],
  ["Body", "text-base", "Keep customer mail in customer infrastructure."],
  ["Compact", "text-sm", "privacy@northstar.example"],
  ["Metadata", "text-xs", "Updated a few seconds ago"]
] as const;

const spacing = [8, 12, 16, 20, 24, 32] as const;

const fieldOptions = [
  { label: "Deliver to privacy@northstar.example", value: "privacy" },
  { label: "Keep in Catch-all for owner review", value: "catchall" },
  { label: "Reject the message", value: "reject" }
];

export function FoundationsControlsPreview(): React.ReactElement {
  return (
    <>
      <FoundationsPreview />
      <ActionsPreview />
      <FormsPreview />
    </>
  );
}

function FoundationsPreview(): React.ReactElement {
  return (
    <InventorySection
      description="The product tokens that control color, type, shape, and rhythm."
      id="foundations"
      title="Foundations"
    >
      <Specimen path="app/styles.css" title="Color tokens" wide>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {colorTokens.map(([label, className]) => (
            <div className="overflow-hidden rounded-lg border" key={label}>
              <div className={`h-16 ${className}`} />
              <div className="border-t bg-card px-3 py-2 text-xs">{label}</div>
            </div>
          ))}
        </div>
      </Specimen>
      <Specimen path="tailwind.config.ts" title="Typography" wide>
        <div className="divide-y rounded-lg border bg-background px-4 sm:px-6">
          {typography.map(([label, className, text]) => (
            <div className="grid gap-2 py-5 sm:grid-cols-[120px_1fr] sm:items-baseline" key={label}>
              <span className="text-xs text-muted-foreground">{label}</span>
              <span className={className}>{text}</span>
            </div>
          ))}
        </div>
      </Specimen>
      <Specimen path="app/styles.css" title="Spacing and radius">
        <div className="space-y-5">
          {spacing.map((value) => (
            <div className="grid grid-cols-[40px_1fr] items-center gap-3" key={value}>
              <span className="font-mono text-xs text-muted-foreground">{value}</span>
              <div className="h-2 rounded-full bg-foreground" style={{ width: value * 3 }} />
            </div>
          ))}
          <div className="grid grid-cols-3 gap-3 pt-2">
            <div className="h-16 rounded-sm border bg-muted" />
            <div className="h-16 rounded-md border bg-muted" />
            <div className="h-16 rounded-lg border bg-muted" />
          </div>
        </div>
      </Specimen>
      <Specimen path="app/components/ui/separator.tsx" title="Separator">
        <div className="space-y-6">
          <Separator />
          <div className="flex h-14 items-center gap-6">
            <span className="text-sm">Mail</span>
            <Separator orientation="vertical" />
            <span className="text-sm">Settings</span>
          </div>
        </div>
      </Specimen>
    </InventorySection>
  );
}

function ActionsPreview(): React.ReactElement {
  const [checked, setChecked] = React.useState(true);
  const [enabled, setEnabled] = React.useState(true);

  return (
    <InventorySection
      description="Every button treatment, size, state, and action badge."
      id="actions"
      title="Actions"
    >
      <Specimen path="app/components/ui/button.tsx" title="Button variants" wide>
        <div className="flex flex-wrap items-center gap-3">
          <Button>Default</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="destructive">Destructive</Button>
          <Button variant="link">Link</Button>
          <Button variant="liquidGlass">Liquid glass</Button>
        </div>
      </Specimen>
      <Specimen path="app/components/ui/button.tsx" title="Sizes and states" wide>
        <div className="flex flex-wrap items-center gap-3">
          <Button size="sm">Small</Button>
          <Button>Default</Button>
          <Button size="lg">Large</Button>
          <Button aria-label="Add mailbox" size="icon">
            <PiPlus />
          </Button>
          <Button disabled>Disabled</Button>
          <Button disabled>
            <Spinner /> Saving
          </Button>
        </div>
      </Specimen>
      <Specimen path="app/components/ui/badge.tsx" title="Badges">
        <div className="flex flex-wrap gap-2">
          <Badge>Default</Badge>
          <Badge variant="secondary">Ready</Badge>
          <Badge variant="outline">Portal</Badge>
          <Badge variant="destructive">Failed</Badge>
        </div>
      </Specimen>
      <Specimen path="app/components/ui/checkbox.tsx · switch.tsx" title="Checkbox and switch">
        <div className="space-y-5">
          <Label className="flex items-center gap-3 text-sm" htmlFor="lab-archive">
            <Checkbox
              checked={checked}
              id="lab-archive"
              onCheckedChange={(value) => setChecked(value === true)}
            />
            Include archived mailboxes
          </Label>
          <Label className="flex items-center justify-between gap-4 text-sm" htmlFor="lab-active">
            Active in HQBase
            <Switch checked={enabled} id="lab-active" onCheckedChange={setEnabled} />
          </Label>
          <Label
            className="flex items-center justify-between gap-4 text-sm text-muted-foreground"
            htmlFor="lab-unavailable"
          >
            Unavailable control
            <Switch
              checked={false}
              disabled
              id="lab-unavailable"
              onCheckedChange={() => undefined}
            />
          </Label>
        </div>
      </Specimen>
    </InventorySection>
  );
}

function FormsPreview(): React.ReactElement {
  const [compactChoice, setCompactChoice] = React.useState("read");
  const [delivery, setDelivery] = React.useState("privacy");

  return (
    <InventorySection
      description="Labels, inputs, grouped controls, selections, and validation states."
      id="forms"
      title="Forms"
    >
      <Specimen
        path="app/components/ui/field.tsx · dropdown-select.tsx · textarea.tsx"
        title="Field states"
        wide
      >
        <div className="grid gap-6 md:grid-cols-2">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="lab-name">Sender name</FieldLabel>
              <Input defaultValue="Northstar Support" id="lab-name" />
              <FieldDescription>This name appears on new messages.</FieldDescription>
            </Field>
            <Field>
              <FieldLabelRow>
                <FieldLabel htmlFor="lab-email">Email address</FieldLabel>
                <FieldError>Use a workspace domain</FieldError>
              </FieldLabelRow>
              <Input aria-invalid="true" defaultValue="support@example.org" id="lab-email" />
            </Field>
          </FieldGroup>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="lab-delivery">Unknown-address mail</FieldLabel>
              <DropdownSelect
                id="lab-delivery"
                options={fieldOptions}
                value={delivery}
                onValueChange={setDelivery}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="lab-note">Internal note</FieldLabel>
              <Textarea id="lab-note" placeholder="Add context for your team…" />
            </Field>
          </FieldGroup>
        </div>
      </Specimen>
      <Specimen path="app/components/ui/input-group.tsx · label.tsx" title="Input group">
        <Label className="mb-2 block" htmlFor="lab-search">
          Search
        </Label>
        <InputGroup>
          <PiMagnifyingGlass aria-hidden="true" className="ml-3 size-4 text-muted-foreground" />
          <InputGroupInput id="lab-search" placeholder="Search shared mail" />
          <span className="mr-3 font-mono text-xs text-muted-foreground">⌘K</span>
        </InputGroup>
      </Specimen>
      <Specimen path="app/components/ui/input.tsx" title="Input states">
        <div className="space-y-3">
          <Input placeholder="Default input" />
          <Input disabled placeholder="Disabled input" />
          <Input aria-invalid="true" defaultValue="Invalid value" />
        </div>
      </Specimen>
      <Specimen
        path="app/components/ui/input.tsx · dropdown-select.tsx · button.tsx"
        title="Compact inline controls"
      >
        <div className="flex max-w-lg items-center gap-2">
          <Input defaultValue="Northstar Support" size="sm" />
          <Button>Save</Button>
          <DropdownSelect
            ariaLabel="Compact access"
            className="w-32"
            options={[
              { label: "Read", value: "read" },
              { label: "Manager", value: "manager" }
            ]}
            size="sm"
            value={compactChoice}
            onValueChange={setCompactChoice}
          />
        </div>
      </Specimen>
    </InventorySection>
  );
}
