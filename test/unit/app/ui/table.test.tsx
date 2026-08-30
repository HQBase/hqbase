import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";

describe("table", () => {
  it("uses compact shared header and cell spacing", () => {
    const html = renderToStaticMarkup(
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell>HQBase</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    );

    expect(html).toContain("text-[13px] leading-5");
    expect(html).toContain("h-8 px-2.5");
    expect(html).toContain("text-[11px]");
    expect(html).toContain("px-2.5 py-1");
  });
});
