import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import {
  CheckCircle,
  XCircle,
  AlertCircle,
  Clock,
  RotateCcw,
  Trash2,
  X,
} from "lucide-react";

interface ProcessingEntry {
  id: string;
  timestamp: Date;
  image: string | null;
  status: "processing" | "valid" | "invalid" | "error" | "cancelled";
  data: any;
  error: string | null;
  points?: number | null;
  transactionId?: string | null;
  matched?: {
    name: string;
    effect: { type: "add" | "multiply"; value: string };
  }[];
}

interface ProcessingHistoryProps {
  entries: ProcessingEntry[];
  selectedEntry: ProcessingEntry | null;
  onSelectEntry: (entry: ProcessingEntry) => void;
  onRetryOcr?: (entry: ProcessingEntry) => void;
  onRetryPoints?: (entry: ProcessingEntry) => void;
  onCancelProcessing?: (entry: ProcessingEntry) => void;
  onDeleteEntry?: (entry: ProcessingEntry) => void;
}

const ProcessingHistory = ({
  entries,
  selectedEntry,
  onSelectEntry,
  onRetryOcr,
  onRetryPoints,
  onCancelProcessing,
  onDeleteEntry,
}: ProcessingHistoryProps) => {
  const getStatusIcon = (status: ProcessingEntry["status"]) => {
    switch (status) {
      case "processing":
        return <Clock className="h-4 w-4" />;
      case "valid":
        return <CheckCircle className="h-4 w-4" />;
      case "invalid":
        return <XCircle className="h-4 w-4" />;
      case "error":
        return <AlertCircle className="h-4 w-4" />;
      case "cancelled":
        return <X className="h-4 w-4" />;
    }
  };

  const getStatusVariant = (status: ProcessingEntry["status"]) => {
    switch (status) {
      case "processing":
        return "secondary";
      case "valid":
        return "default";
      case "invalid":
        return "destructive";
      case "error":
        return "destructive";
      case "cancelled":
        return "destructive";
    }
  };

  const getStatusText = (status: ProcessingEntry["status"]) => {
    switch (status) {
      case "processing":
        return "Processando";
      case "valid":
        return "Válida";
      case "invalid":
        return "Inválida";
      case "error":
        return "Erro";
      case "cancelled":
        return "Cancelado";
    }
  };

  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle>Histórico de Processamento</CardTitle>
        <CardDescription>
          Histórico das notas fiscais processadas. Clique em uma para ver os
          detalhes abaixo.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[400px] pr-4">
          {entries.length === 0 ? (
            <div className="flex items-center justify-center h-[200px] text-muted-foreground">
              Nenhuma nota processada ainda.
            </div>
          ) : (
            <div className="space-y-3">
              {entries.map((entry) => (
                <div
                  key={entry.id}
                  onClick={() => onSelectEntry(entry)}
                  className={`p-4 rounded-lg border cursor-pointer transition-colors hover:bg-accent/50 ${
                    selectedEntry?.id === entry.id
                      ? "bg-accent border-primary"
                      : "bg-card"
                  }`}
                >
                  {/* miniatura da nota fiscal */}
                  <div className="flex items-start gap-3">
                    {entry.image && (
                      <img
                        src={entry.image}
                        alt="Miniatura da nota fiscal"
                        className="w-12 h-12 object-cover rounded border"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          {/* Badge com o status (processando, finalizado etc) */}
                          {getStatusIcon(entry.status)}
                          <Badge variant={getStatusVariant(entry.status)}>
                            {getStatusText(entry.status)}
                          </Badge>
                          {/* Cancelar processamento */}
                          {entry.status === "processing" &&
                            onCancelProcessing && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 px-2 text-destructive hover:text-destructive"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onCancelProcessing(entry);
                                }}
                              >
                                <X className="h-3 w-3" />
                              </Button>
                            )}
                        </div>
                        {/* Botão de excluir */}
                        <div className="flex items-center gap-2">
                          {onDeleteEntry && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 px-2 text-destructive hover:text-destructive"
                              onClick={(e) => {
                                e.stopPropagation();
                                onDeleteEntry(entry);
                              }}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      </div>
                      {entry.status === "error" && entry.error && (
                        <p className="text-sm text-destructive text-wrap overflow-hidden">
                          {entry.error}
                        </p>
                      )}
                      {entry.status === "valid" && entry.data && (
                        <div className="space-y-1">
                          <p className="text-sm text-muted-foreground">
                            Dados extraídos com sucesso
                          </p>
                          {entry.points !== undefined && (
                            <div className="flex items-center gap-2">
                              {entry.points === undefined ? (
                                <p className="text-sm text-muted-foreground">
                                  Processando pontos...
                                </p>
                              ) : entry.points !== null ? (
                                <p className="bg-gradient-to-r from-yellow-400 to-amber-500 text-stone-900 font-semibold shadow-sm shadow-amber-600/30 active:opacity-90 rounded-sm px-1.5 py-0.5 text-sm">
                                  {`${entry.points} pontos`}
                                </p>
                              ) : (
                                <p className="text-sm text-muted-foreground">
                                  Pontos não processados
                                </p>
                              )}
                              {entry.points === null && onRetryPoints && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-6 px-2"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onRetryPoints(entry);
                                  }}
                                >
                                  <RotateCcw className="h-3 w-3" />
                                </Button>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                      {entry.status === "invalid" && (
                        <div className="flex items-center gap-2">
                          <p className="text-sm text-muted-foreground">
                            Processamento cancelado: nota possivelmente
                            inválida.
                          </p>
                          {onRetryOcr && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 px-2"
                              onClick={(e) => {
                                e.stopPropagation();
                                onRetryOcr(entry);
                              }}
                            >
                              <RotateCcw className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      )}
                      {entry.status === "error" && onRetryOcr && (
                        <div className="mt-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 px-2"
                            onClick={(e) => {
                              e.stopPropagation();
                              onRetryOcr(entry);
                            }}
                          >
                            <RotateCcw className="h-3 w-3 mr-1" />
                            Tentar novamente
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
};

export default ProcessingHistory;
