import type { JobDetection } from "@/types/ocr-api";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type DetectionsTableProps = {
  detections: JobDetection[];
};

export function DetectionsTable({ detections }: DetectionsTableProps) {
  if (!detections.length) return <p className="text-sm text-muted-foreground">Sin detecciones.</p>;

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>label</TableHead>
          <TableHead>conf</TableHead>
          <TableHead>box</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {detections.map((d, i) => (
          <TableRow key={`${d.label}-${i}`}>
            <TableCell>{d.label}</TableCell>
            <TableCell>{d.conf.toFixed(4)}</TableCell>
            <TableCell>[{d.box.join(", ")}]</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

