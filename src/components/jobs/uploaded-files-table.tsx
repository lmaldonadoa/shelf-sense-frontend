import type { UploadItem } from "@/types/ocr-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type UploadedFilesTableProps = {
  uploaded: UploadItem[];
};

export function UploadedFilesTable({ uploaded }: UploadedFilesTableProps) {
  return (
    <Card className="border-white/10 bg-white/5 backdrop-blur">
      <CardHeader>
        <CardTitle>2. Archivos subidos</CardTitle>
      </CardHeader>
      <CardContent>
        {uploaded.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aún no hay archivos subidos.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>MIME</TableHead>
                <TableHead>Tamaño</TableHead>
                <TableHead>file_id</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {uploaded.map((item) => (
                <TableRow key={item.file_id}>
                  <TableCell>{item.original_name}</TableCell>
                  <TableCell>{item.mime_type}</TableCell>
                  <TableCell>{(item.size_bytes / 1024 / 1024).toFixed(2)} MB</TableCell>
                  <TableCell className="max-w-48 truncate">{item.file_id}</TableCell>
                  <TableCell>Subido</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
