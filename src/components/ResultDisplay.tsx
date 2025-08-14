import { useMemo } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  CheckCircle,
  XCircle,
  AlertCircle,
  Clock,
  RotateCcw,
} from "lucide-react";

interface ProcessingEntry {
  id: string;
  timestamp: Date;
  image: string | null;
  status: "processing" | "valid" | "invalid" | "error";
  data: any;
  error: string | null;
  points?: number | null;
  matched?: {
    name: string;
    effect: { type: "add" | "multiply"; value: string };
  }[];
}

interface ResultDisplayProps {
  selectedEntry: ProcessingEntry | null;
  onRetryOcr?: (entry: ProcessingEntry) => void;
  onRetryPoints?: (entry: ProcessingEntry) => void;
}

const ResultDisplay = ({
  selectedEntry,
  onRetryOcr,
  onRetryPoints,
}: ResultDisplayProps) => {
  const parsedJSON = useMemo(() => {
    if (!selectedEntry?.data) return "";

    try {
      if (typeof selectedEntry.data === "string") {
        return JSON.stringify(JSON.parse(selectedEntry.data), null, 2);
      }
      return JSON.stringify(selectedEntry.data, null, 2);
    } catch {
      return selectedEntry.data;
    }
  }, [selectedEntry?.data]);

  const getStatusIcon = (status: ProcessingEntry["status"]) => {
    switch (status) {
      case "processing":
        return <Clock className="h-4 w-4" />;
      case "valid":
        return <CheckCircle className="h-4 w-4 text-slate-950" />;
      case "invalid":
        return <XCircle className="h-4 w-4 text-red-600" />;
      case "error":
        return <AlertCircle className="h-4 w-4 text-red-600" />;
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
    }
  };

  console.dir(selectedEntry);

  return (
    <Card className="shadow-sm">
      <CardHeader>
        <div className="justify-between">
          <div>
            <CardTitle>Resultado do OCR</CardTitle>
          </div>
          <CardDescription className="py-2">
            {selectedEntry ? (
              selectedEntry.timestamp.toLocaleString("pt-BR")
            ) : (
              "Selecione uma entrada do histórico para ver o resultado"
            )}
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        {/* Infos da nota */}
        {selectedEntry && (
          <>
            {/* status */}
            <div className="flex justify-between">
              <div className="flex items-center m-1.5 gap-2">
                {getStatusIcon(selectedEntry.status)}
                <Badge variant={getStatusVariant(selectedEntry.status)}>
                  {getStatusText(selectedEntry.status)}
                </Badge>
              </div>
              {/* pontos gerados */}
              <div className="m-1 mr-0 gap-3">
                {selectedEntry.points !== undefined && (
                  <div className="text-right m-1.5">
                    {/* Display dos Pontos */}
                    <div className="flex items-center gap-2">
                      {selectedEntry.points !== null ? (
                        <p className="bg-gradient-to-r from-yellow-400 to-amber-500 text-stone-900 font-semibold shadow-sm shadow-amber-600/30 active:opacity-90 rounded-sm px-1.5 py-0.5 text-sm">
                          {`${selectedEntry.points} pontos`}
                        </p>
                      ) : (
                        "Pontos não processados"
                      )}
                      {/* Botão de tentar dnv QUANDO não está calculado ainda */}
                      {selectedEntry.points === null && onRetryPoints && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 px-2"
                          onClick={() => onRetryPoints(selectedEntry)}
                        >
                          <RotateCcw className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div>
              {/* Imagem em miniatura */}
              {selectedEntry.image && (
                <div className="mb-4 overflow-hidden aspect-square rounded-sm bg-cover">
                  <img
                    src={selectedEntry.image}
                    alt="Imagem processada"
                    className="object-contain bg-center rounded border"
                  ></img>
                </div>
              )}
            </div>
            {/* Regras aplicadas */}
            <div className="mb-4">
              <h2 className="font-semibold text-foreground text-lg mb-2">
                Regras aplicadas
              </h2>
              {selectedEntry.matched && selectedEntry.matched.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {selectedEntry.matched.map((rule, index) => (
                    <div
                      key={index}
                      className="inline-flex items-center gap-1 px-2 py-1 bg-accent text-accent-foreground rounded-md text-sm border"
                    >
                      <span className="font-medium">{rule.name}</span>
                      <span className="text-muted-foreground">|</span>
                      <span className="font-semibold">
                        {rule.effect.type === "add" ? "+" : "x"}
                        {rule.effect.value}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground text-sm">
                  Nenhuma regra especial aplicada
                </p>
              )}
            </div>
          </>
        )}
        {selectedEntry ? (
          <>
            {selectedEntry.status === "error" && selectedEntry.error ? (
              <div className="p-4 rounded-md border border-destructive/20 bg-destructive/5">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-destructive">
                    {selectedEntry.error}
                  </p>
                  {onRetryOcr && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => onRetryOcr(selectedEntry)}
                    >
                      <RotateCcw className="h-3 w-3 mr-1" />
                      Tentar novamente
                    </Button>
                  )}
                </div>
              </div>
            ) : selectedEntry.data ? (
              <div>
                <pre className="max-h-[300px] overflow-auto rounded-md border p-2 text-xs leading-relaxed bg-card text-card-foreground">
                  {parsedJSON}
                </pre>
                {selectedEntry.status === "invalid" && onRetryOcr && (
                  <div className="mt-4 flex justify-center">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onRetryOcr(selectedEntry)}
                    >
                      <RotateCcw className="h-3 w-3 mr-1" />
                      Reprocessar OCR
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <div className="h-[200px] flex items-center justify-center text-muted-foreground">
                {selectedEntry.status === "processing"
                  ? "Processando..."
                  : "Nenhum dado disponível"}
              </div>
            )}
          </>
        ) : (
          <div className="h-[300px] flex items-center justify-center text-muted-foreground">
            Selecione uma entrada do histórico para ver o resultado.
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default ResultDisplay;
