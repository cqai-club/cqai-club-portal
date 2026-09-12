"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Pencil, type LucideIcon } from "lucide-react";

interface InfoCardProps {
  title: string;
  value: string;
  icon: LucideIcon;
  description?: string;
  editable?: boolean;
  onEdit?: () => void;
  href?: string;
}

export function InfoCard({
  title,
  value,
  icon: Icon,
  description,
  editable = true,
  onEdit,
}: InfoCardProps) {
  return (
    <Card className="group h-full transition-shadow hover:shadow-md">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {title}
          </CardTitle>
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-end justify-between">
          <div className="min-w-0 flex-1">
            <p className="truncate text-lg font-semibold">{value || "未设置"}</p>
            {description && (
              <p className="mt-1 text-xs text-muted-foreground">{description}</p>
            )}
          </div>
          {editable && (
            <Button
              variant="ghost"
              size="icon"
              className="opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={(e) => {
                e.stopPropagation();
                onEdit?.();
              }}
            >
              <Pencil className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
