import { PiDotsThree, PiInfo, PiPaperPlaneTilt, PiPlus } from "react-icons/pi";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupInput } from "@/components/ui/input-group";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { appRoutePath, mailFolders, settingsTabs } from "@/lib/routes";

import { InventorySection, ScreenLink, Specimen } from "./design-preview-shared";

const settingsLabels: Record<(typeof settingsTabs)[number], string> = {
  domains: "Domains",
  labels: "Labels",
  mailboxes: "Mailboxes",
  preferences: "Preferences",
  signatures: "Signatures",
  updates: "Updates",
  users: "People"
};

export function PatternsPreview(): React.ReactElement {
  return (
    <>
      <ProductPatterns />
      <RealScreens />
    </>
  );
}

function ProductPatterns(): React.ReactElement {
  return (
    <InventorySection
      description="Common arrangements that expose spacing and hierarchy across several primitives."
      id="patterns"
      title="Product patterns"
    >
      <Specimen path="Settings page pattern" title="Settings header and table" wide>
        <div className="mx-auto max-w-4xl rounded-xl border bg-background p-4 sm:p-6">
          <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h3 className="text-xl font-semibold">Mailboxes</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Manage shared human and agent mailboxes.
              </p>
            </div>
            <Button size="sm">
              <PiPlus />
              Add mailbox
            </Button>
          </div>
          <Table containerClassName="rounded-lg border">
            <TableHeader className="bg-muted/40">
              <TableRow className="hover:bg-transparent">
                <TableHead>Address</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell className="font-medium">hello@northstar.example</TableCell>
                <TableCell>
                  <Badge variant="secondary">Active</Badge>
                </TableCell>
                <TableCell className="text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        aria-label="Actions for hello@northstar.example"
                        size="icon"
                        variant="ghost"
                      >
                        <PiDotsThree />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuGroup>
                        <DropdownMenuItem>Edit mailbox</DropdownMenuItem>
                      </DropdownMenuGroup>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </Specimen>
      <Specimen path="Mail workspace pattern" title="Inbox list and reader" wide>
        <div className="grid min-h-[360px] overflow-hidden rounded-xl border bg-background md:grid-cols-[280px_1fr]">
          <div className="border-b bg-list md:border-b-0 md:border-r">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <strong className="text-sm">Inbox</strong>
              <Badge variant="secondary">3</Badge>
            </div>
            {[
              ["Mira Chen", "Updated launch schedule", "10:42"],
              ["Cloudflare", "Domain is ready", "09:18"],
              ["Alex Morgan", "Quarterly planning", "Yesterday"]
            ].map(([sender, subject, time], index) => (
              <div
                className={`border-b px-4 py-3 ${index === 0 ? "bg-selected" : ""}`}
                key={sender}
              >
                <div className="flex justify-between gap-3 text-sm">
                  <strong className="truncate">{sender}</strong>
                  <span className="shrink-0 text-xs text-muted-foreground">{time}</span>
                </div>
                <p className="mt-1 truncate text-xs text-muted-foreground">{subject}</p>
              </div>
            ))}
          </div>
          <div className="bg-reader p-5 sm:p-7">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold">Updated launch schedule</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Mira Chen · to hello@northstar.example
                </p>
              </div>
              <Button aria-label="Message actions" size="icon" variant="ghost">
                <PiDotsThree />
              </Button>
            </div>
            <Separator className="my-5" />
            <div className="space-y-3 text-sm leading-6">
              <p>Hello team,</p>
              <p>
                The revised launch schedule is ready for review. Please share any final notes before
                Thursday.
              </p>
            </div>
          </div>
        </div>
      </Specimen>
      <Specimen path="Compose pattern" title="Compose form" wide>
        <Card className="mx-auto max-w-2xl">
          <CardHeader>
            <CardTitle>New message</CardTitle>
            <CardDescription>Send from an accessible workspace mailbox.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <InputGroup>
              <span className="ml-3 w-12 text-sm text-muted-foreground">From</span>
              <InputGroupInput defaultValue="hello@northstar.example" />
            </InputGroup>
            <InputGroup>
              <span className="ml-3 w-12 text-sm text-muted-foreground">To</span>
              <InputGroupInput defaultValue="mira@example.com" />
            </InputGroup>
            <Input defaultValue="Launch schedule" placeholder="Subject" />
            <Textarea className="min-h-40" defaultValue="Hi Mira,\n\nThanks for the update." />
            <div className="flex justify-end">
              <Button>
                <PiPaperPlaneTilt />
                Send
              </Button>
            </div>
          </CardContent>
        </Card>
      </Specimen>
    </InventorySection>
  );
}

function RealScreens(): React.ReactElement {
  return (
    <InventorySection
      description="Open the authenticated local app to inspect each real route with seeded data."
      id="screens"
      title="Real screens"
    >
      <Specimen path="app/lib/routes.ts" title="Screen route index" wide>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {mailFolders.map((folder) => (
            <ScreenLink
              href={appRoutePath({ folder: folder.id, kind: "mail", messageId: null })}
              key={folder.id}
              label={folder.label}
            />
          ))}
          <ScreenLink href={appRoutePath({ draftId: null, kind: "drafts" })} label="Drafts" />
          <ScreenLink href={appRoutePath({ contactId: null, kind: "contacts" })} label="Contacts" />
          <ScreenLink href={appRoutePath({ kind: "agents" })} label="Agents" />
          {settingsTabs.map((tab) => (
            <ScreenLink
              href={appRoutePath({ kind: "settings", tab })}
              key={tab}
              label={`Settings · ${settingsLabels[tab]}`}
            />
          ))}
        </div>
        <Alert className="mt-5">
          <PiInfo />
          <AlertTitle>Local workspace required</AlertTitle>
          <AlertDescription>
            These links open the real app in a new tab. Use the local seed workflow for
            deterministic demo data.
          </AlertDescription>
        </Alert>
      </Specimen>
    </InventorySection>
  );
}
