"use client";

import type { AliasRow } from "@/types/ocr-api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type AliasesTableProps = {
  aliases: AliasRow[];
  onEdit: (alias: AliasRow) => void;
  onToggle: (alias: AliasRow) => void;
  onDeactivate?: (alias: AliasRow) => void;
};

export function AliasesTable({ aliases, onEdit, onToggle, onDeactivate }: AliasesTableProps) {
  if (!aliases.length) return <p className="text-sm text-muted-foreground">No hay aliases para mostrar.</p>;

  return (
    <div className="overflow-x-auto">
      <Table>
      <TableHeader>
        <TableRow>
          <TableHead>alias</TableHead>
          <TableHead>canonical</TableHead>
          <TableHead>scope</TableHead>
          <TableHead>target keywords</TableHead>
          <TableHead>chain whitelist</TableHead>
          <TableHead>estado</TableHead>
          <TableHead>updated_at</TableHead>
          <TableHead>acciones</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {aliases.map((row) => {
          const active = row.is_active === true || row.is_active === 1;
          return (
            <TableRow key={row.id}>
              <TableCell>{row.alias}</TableCell>
              <TableCell>{row.canonical}</TableCell>
              <TableCell>{row.scope}</TableCell>
              <TableCell>
                <div className="flex max-w-56 flex-wrap gap-1">
                  {(row.target_keywords ?? []).length ? (
                    row.target_keywords?.map((item) => (
                      <Badge key={`${row.id}-kw-${item}`} variant="outline" className="border-cyan-300/30 bg-cyan-500/10 text-cyan-100">
                        {item}
                      </Badge>
                    ))
                  ) : (
                    <span className="text-xs text-muted-foreground">Global</span>
                  )}
                </div>
              </TableCell>
              <TableCell>
                <div className="flex max-w-56 flex-wrap gap-1">
                  {(row.chain_whitelist ?? []).length ? (
                    row.chain_whitelist?.map((item) => (
                      <Badge key={`${row.id}-chain-${item}`} variant="outline" className="border-emerald-300/30 bg-emerald-500/10 text-emerald-100">
                        {item}
                      </Badge>
                    ))
                  ) : (
                    <span className="text-xs text-muted-foreground">Global</span>
                  )}
                </div>
              </TableCell>
              <TableCell><Badge variant={active ? "default" : "secondary"}>{active ? "Activo" : "Inactivo"}</Badge></TableCell>
              <TableCell>{row.updated_at ?? "-"}</TableCell>
              <TableCell className="space-x-2 whitespace-nowrap">
                <Button size="sm" variant="outline" onClick={() => onEdit(row)}>Editar</Button>
                <Button size="sm" variant="ghost" onClick={() => onToggle(row)}>{active ? "Desactivar" : "Activar"}</Button>
                {active && onDeactivate ? (
                  <Button size="sm" variant="ghost" className="text-rose-300" onClick={() => onDeactivate(row)}>Eliminar</Button>
                ) : null}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
      </Table>
    </div>
  );
}
