import * as React from "react";
import {
  PiDotsThree,
  PiEnvelope,
  PiInfo,
  PiPaperPlaneTilt,
  PiTrash,
  PiWarning
} from "react-icons/pi";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Field, FieldLabel } from "@/components/ui/field";
import { Progress } from "@/components/ui/progress";
import { PullToRefresh } from "@/components/ui/pull-to-refresh";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger
} from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { DomainSuffixInput } from "@/features/domains/domain-suffix-input";

import { InventorySection, Specimen } from "./design-preview-shared";

const refreshRows = [
  "Message row 1",
  "Message row 2",
  "Message row 3",
  "Message row 4",
  "Message row 5",
  "Message row 6",
  "Message row 7",
  "Message row 8"
] as const;

export function DataInteractionsPreview(): React.ReactElement {
  return (
    <>
      <DataPreview />
      <NavigationPreview />
      <FeedbackPreview />
      <OverlaysPreview />
    </>
  );
}

function DataPreview(): React.ReactElement {
  return (
    <InventorySection
      description="Cards, avatars, alerts, tables, and responsive data states."
      id="data"
      title="Data display"
    >
      <Specimen path="app/components/ui/table.tsx" title="Settings table" wide>
        <Table containerClassName="rounded-lg border">
          <TableHeader className="bg-muted/40">
            <TableRow className="hover:bg-transparent">
              <TableHead>Mailbox</TableHead>
              <TableHead className="hidden sm:table-cell">Access</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-20 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {[
              ["privacy@northstar.example", "Full access", "Active"],
              ["billing@northstar.example", "Read and send", "Invited"]
            ].map(([address, access, status]) => (
              <TableRow key={address}>
                <TableCell>
                  <div className="font-medium">{address}</div>
                  <div className="text-xs text-muted-foreground sm:hidden">{access}</div>
                </TableCell>
                <TableCell className="hidden sm:table-cell">{access}</TableCell>
                <TableCell>
                  <Badge variant={status === "Active" ? "secondary" : "outline"}>{status}</Badge>
                </TableCell>
                <TableCell className="text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button aria-label={`Actions for ${address}`} size="icon" variant="ghost">
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
            ))}
          </TableBody>
        </Table>
      </Specimen>
      <Specimen path="app/components/ui/card.tsx · avatar.tsx" title="Card and avatar">
        <Card>
          <CardHeader className="flex-row items-center gap-3">
            <Avatar>
              <AvatarFallback>AM</AvatarFallback>
            </Avatar>
            <div>
              <CardTitle>Alex Morgan</CardTitle>
              <CardDescription>Workspace owner</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Full workspace access and Cloudflare management approval.
          </CardContent>
        </Card>
      </Specimen>
      <Specimen path="app/components/ui/alert.tsx" title="Alerts">
        <div className="space-y-3">
          <Alert>
            <PiInfo />
            <AlertTitle>Ready to receive mail</AlertTitle>
            <AlertDescription>Cloudflare Email Routing is connected.</AlertDescription>
          </Alert>
          <Alert variant="destructive">
            <PiWarning />
            <AlertTitle>Sending needs attention</AlertTitle>
            <AlertDescription>Recheck this domain before sending.</AlertDescription>
          </Alert>
        </div>
      </Specimen>
      <Specimen path="app/components/ui/table.tsx · spinner.tsx" title="Table states">
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            ["Loading", <Spinner key="loading" />],
            ["Empty", <PiEnvelope className="size-5" key="empty" />],
            ["Error", <PiWarning className="size-5 text-destructive" key="error" />]
          ].map(([label, icon]) => (
            <div
              className="grid min-h-28 place-items-center rounded-lg border text-sm text-muted-foreground"
              key={String(label)}
            >
              <div className="flex flex-col items-center gap-2">
                {icon}
                <span>{label}</span>
              </div>
            </div>
          ))}
        </div>
      </Specimen>
    </InventorySection>
  );
}

function NavigationPreview(): React.ReactElement {
  const [notifications, setNotifications] = React.useState(true);

  return (
    <InventorySection
      description="Tabs, menus, selections, and supporting navigation controls."
      id="navigation"
      title="Navigation"
    >
      <Specimen path="app/components/ui/tabs.tsx" title="Tabs" wide>
        <Tabs defaultValue="workspace">
          <TabsList>
            <TabsTrigger value="workspace">Workspace</TabsTrigger>
            <TabsTrigger value="mail">Mail</TabsTrigger>
            <TabsTrigger value="personal">Personal</TabsTrigger>
          </TabsList>
          <TabsContent value="workspace">
            <div className="rounded-lg border p-4 text-sm text-muted-foreground">
              Mailboxes, domains, and people
            </div>
          </TabsContent>
          <TabsContent value="mail">
            <div className="rounded-lg border p-4 text-sm text-muted-foreground">
              Labels and signatures
            </div>
          </TabsContent>
          <TabsContent value="personal">
            <div className="rounded-lg border p-4 text-sm text-muted-foreground">
              Preferences and notifications
            </div>
          </TabsContent>
        </Tabs>
      </Specimen>
      <Specimen path="app/components/ui/dropdown-menu.tsx" title="Dropdown menu">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline">
              Open actions <PiDotsThree />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuGroup>
              <DropdownMenuLabel>Mailbox actions</DropdownMenuLabel>
              <DropdownMenuItem>Edit mailbox</DropdownMenuItem>
              <DropdownMenuCheckboxItem
                checked={notifications}
                onCheckedChange={(value) => setNotifications(value === true)}
              >
                Notifications
              </DropdownMenuCheckboxItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem className="gap-2 text-destructive">
                <PiTrash />
                Delete mailbox
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </Specimen>
      <Specimen path="app/components/ui/tooltip.tsx" title="Tooltip">
        <TooltipProvider delayDuration={100}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button aria-label="Send message" size="icon" variant="outline">
                <PiPaperPlaneTilt />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Send message</TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <p className="mt-3 text-xs text-muted-foreground">Hover or focus the action.</p>
      </Specimen>
    </InventorySection>
  );
}

function FeedbackPreview(): React.ReactElement {
  return (
    <InventorySection
      description="Progress, loading, notifications, and touch refresh behavior."
      id="feedback"
      title="Feedback"
    >
      <Specimen path="app/components/ui/progress.tsx · spinner.tsx" title="Progress and spinner">
        <div className="space-y-5">
          <Progress aria-label="Setup progress" value={68} />
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <Spinner />
            Checking Cloudflare configuration…
          </div>
        </div>
      </Specimen>
      <Specimen path="app/components/ui/sonner.tsx" title="Toasts">
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => toast.success("Mailbox saved")}>
            Success
          </Button>
          <Button size="sm" variant="outline" onClick={() => toast.info("Recheck started")}>
            Information
          </Button>
          <Button size="sm" variant="outline" onClick={() => toast.error("Could not save mailbox")}>
            Error
          </Button>
        </div>
      </Specimen>
      <Specimen path="app/components/ui/pull-to-refresh.tsx" title="Pull to refresh" wide>
        <div className="h-52 overflow-hidden rounded-lg border bg-list">
          <PullToRefresh className="h-full" onRefresh={() => undefined}>
            <div className="divide-y">
              {refreshRows.map((label) => (
                <div className="bg-background px-4 py-3 text-sm" key={label}>
                  {label}
                </div>
              ))}
            </div>
          </PullToRefresh>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Drag down on a touch viewport to inspect the interaction.
        </p>
      </Specimen>
    </InventorySection>
  );
}

function OverlaysPreview(): React.ReactElement {
  const [mailboxAddress, setMailboxAddress] = React.useState("support@northstar.example");

  return (
    <InventorySection
      description="Interactive dialog and drawer surfaces rendered through the real portals."
      id="overlays"
      title="Overlays"
    >
      <Specimen path="app/components/ui/dialog.tsx" title="Dialog">
        <Dialog>
          <DialogTrigger asChild>
            <Button>Open dialog</Button>
          </DialogTrigger>
          <DialogContent className="w-[min(92vw,520px)]">
            <DialogHeader>
              <DialogTitle>Add mailbox</DialogTitle>
              <DialogDescription>
                Create an address on a connected workspace domain.
              </DialogDescription>
            </DialogHeader>
            <Field>
              <FieldLabel htmlFor="dialog-address">Email address</FieldLabel>
              <DomainSuffixInput
                domains={[
                  { id: "northstar", name: "northstar.example" },
                  { id: "fieldnotes", name: "fieldnotes.example" }
                ]}
                id="dialog-address"
                separator="@"
                value={mailboxAddress}
                onValueChange={setMailboxAddress}
              />
            </Field>
            <DialogFooter>
              <Button type="button" variant="outline">
                Cancel
              </Button>
              <Button type="button">Create mailbox</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </Specimen>
      <Specimen path="app/components/ui/sheet.tsx" title="Sheet">
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="outline">Open sheet</Button>
          </SheetTrigger>
          <SheetContent>
            <SheetTitle className="pr-12 text-lg font-semibold">Mailbox details</SheetTitle>
            <SheetDescription className="mt-1 text-sm text-muted-foreground">
              Access, status, and recent activity.
            </SheetDescription>
            <div className="mt-6 space-y-4">
              <div className="rounded-lg border p-4">
                <p className="text-xs text-muted-foreground">Address</p>
                <p className="mt-1 text-sm">privacy@northstar.example</p>
              </div>
              <div className="rounded-lg border p-4">
                <p className="text-xs text-muted-foreground">Your access</p>
                <p className="mt-1 text-sm">Full access</p>
              </div>
            </div>
          </SheetContent>
        </Sheet>
      </Specimen>
    </InventorySection>
  );
}
