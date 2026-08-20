import type * as React from "react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import type { WorkspaceRole } from "@/features/users/types";
import { formatDateTime } from "@/lib/format";
import type { PersonalAccessTokenMetadata } from "./types";

export function PersonalAccessTokenTable({
  personalAccessTokens,
  pendingId,
  userRole,
  onRevoke
}: {
  personalAccessTokens: PersonalAccessTokenMetadata[];
  pendingId: string | null;
  userRole: WorkspaceRole;
  onRevoke: (token: PersonalAccessTokenMetadata) => void;
}): React.ReactElement {
  const showOwner = userRole === "owner";
  return (
    <Table containerClassName="rounded-lg border">
      <TableHeader className="bg-muted/40">
        <TableRow className="[@media(hover:hover)]:hover:bg-transparent">
          <TableHead>Name</TableHead>
          {showOwner ? <TableHead>Owner</TableHead> : null}
          <TableHead>Token</TableHead>
          <TableHead className="hidden sm:table-cell">Created</TableHead>
          <TableHead className="hidden sm:table-cell">Expires</TableHead>
          <TableHead className="w-px text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {personalAccessTokens.length === 0 ? (
          <TableRow>
            <TableCell
              className="h-24 text-center text-muted-foreground"
              colSpan={showOwner ? 6 : 5}
            >
              No active personal access tokens.
            </TableCell>
          </TableRow>
        ) : null}
        {personalAccessTokens.map((token) => (
          <TableRow key={token.id}>
            <TableCell className="font-medium">{token.name}</TableCell>
            {showOwner ? <TableCell>{token.ownerName}</TableCell> : null}
            <TableCell className="font-mono">••••{token.tokenSuffix}</TableCell>
            <TableCell className="hidden whitespace-nowrap sm:table-cell">
              {formatDateTime(token.createdAt)}
            </TableCell>
            <TableCell className="hidden whitespace-nowrap sm:table-cell">
              {token.expiresAt ? formatDateTime(token.expiresAt) : "Never"}
            </TableCell>
            <TableCell className="text-right">
              <Button
                aria-label={`Revoke ${token.name}`}
                disabled={pendingId !== null}
                size="sm"
                type="button"
                variant="outline"
                onClick={() => onRevoke(token)}
              >
                {pendingId === token.id ? "Revoking…" : "Revoke"}
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
