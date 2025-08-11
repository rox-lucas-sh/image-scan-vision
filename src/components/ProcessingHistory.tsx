import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CheckCircle, XCircle, AlertCircle, Clock } from "lucide-react";

interface ProcessingEntry {
  id: string;
  timestamp: Date;
  image: string | null;
  status: 'processing' | 'valid' | 'invalid' | 'error';
  data: any;
  error: string | null;
}

interface ProcessingHistoryProps {
  entries: ProcessingEntry[];
  selectedEntry: ProcessingEntry | null;
  onSelectEntry: (entry: ProcessingEntry) => void;
}

const ProcessingHistory = ({ entries, selectedEntry, onSelectEntry }: ProcessingHistoryProps) => {
  const getStatusIcon = (status: ProcessingEntry['status']) => {
    switch (status) {
      case 'processing':
        return <Clock className="h-4 w-4" />;
      case 'valid':
        return <CheckCircle className="h-4 w-4" />;
      case 'invalid':
        return <XCircle className="h-4 w-4" />;
      case 'error':
        return <AlertCircle className="h-4 w-4" />;
    }
  };

  const getStatusVariant = (status: ProcessingEntry['status']) => {
    switch (status) {
      case 'processing':
        return 'secondary';
      case 'valid':
        return 'default';
      case 'invalid':
        return 'destructive';
      case 'error':
        return 'destructive';
    }
  };

  const getStatusText = (status: ProcessingEntry['status']) => {
    switch (status) {
      case 'processing':
        return 'Processando';
      case 'valid':
        return 'Válida';
      case 'invalid':
        return 'Inválida';
      case 'error':
        return 'Erro';
    }
  };

  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle>Histórico de Processamento</CardTitle>
        <CardDescription>
          Histórico das notas fiscais processadas. Clique em uma para ver os detalhes.
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
                    selectedEntry?.id === entry.id ? 'bg-accent border-primary' : 'bg-card'
                  }`}
                >
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
                          {getStatusIcon(entry.status)}
                          <Badge variant={getStatusVariant(entry.status)}>
                            {getStatusText(entry.status)}
                          </Badge>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {entry.timestamp.toLocaleString('pt-BR')}
                        </span>
                      </div>
                      {entry.status === 'error' && entry.error && (
                        <p className="text-sm text-destructive truncate">
                          {entry.error}
                        </p>
                      )}
                      {entry.status === 'valid' && entry.data && (
                        <p className="text-sm text-muted-foreground">
                          Dados extraídos com sucesso
                        </p>
                      )}
                      {entry.status === 'invalid' && (
                        <p className="text-sm text-muted-foreground">
                          Nenhum dado válido encontrado
                        </p>
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