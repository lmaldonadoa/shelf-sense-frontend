import type { JobImage } from "@/types/ocr-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type JobImagesTableProps = {
  images: JobImage[];
  onSelect: (image: JobImage) => void;
};

export function JobImagesTable({ images, onSelect }: JobImagesTableProps) {
  return (
    <Card className="border-white/10 bg-white/5 backdrop-blur">
      <CardHeader>
        <CardTitle>Imágenes del job</CardTitle>
      </CardHeader>
      <CardContent>
        {!images.length ? (
          <p className="text-sm text-muted-foreground">No hay imágenes reportadas aún.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>original_name</TableHead>
                <TableHead>image_process_code</TableHead>
                <TableHead>file_id</TableHead>
                <TableHead>status</TableHead>
                <TableHead>detections</TableHead>
                <TableHead>annotated_image_path</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {images.map((image, idx) => (
                <TableRow key={`${image.id}-${image.file_id ?? idx}`} onClick={() => onSelect(image)} className="cursor-pointer">
                  <TableCell>{image.original_name ?? image.image_name}</TableCell>
                  <TableCell className="font-mono text-xs">{image.image_process_code ?? "-"}</TableCell>
                  <TableCell className="max-w-52 truncate">{image.file_id ?? "-"}</TableCell>
                  <TableCell>{image.status}</TableCell>
                  <TableCell>{image.detections_count ?? image.detections?.length ?? 0}</TableCell>
                  <TableCell className="max-w-56 truncate">{image.annotated_image_path ?? "-"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
