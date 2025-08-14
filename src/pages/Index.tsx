import { useState, useEffect } from "react";
import SEO from "@/components/SEO";
import ImageUpload from "@/components/ImageUpload";
import ProcessingHistory from "@/components/ProcessingHistory";
import ResultDisplay from "@/components/ResultDisplay";

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

const Index = () => {
  const [processingEntries, setProcessingEntries] = useState<ProcessingEntry[]>(
    []
  );
  const [selectedEntry, setSelectedEntry] = useState<ProcessingEntry | null>(
    null
  );

  // Carregar entradas do localStorage na inicialização
  useEffect(() => {
    const loadEntries = async () => {
      const savedEntries = localStorage.getItem("processingEntries");
      if (savedEntries) {
        try {
          const parsed = JSON.parse(savedEntries);
          const entriesWithDates = await Promise.all(
            parsed.map(async (entry: any) => {
              // Se a imagem é um blob URL, converter para base64
              let imageData = entry.image;
              if (entry.image && entry.image.startsWith("blob:")) {
                try {
                  const response = await fetch(entry.image);
                  const blob = await response.blob();
                  imageData = await new Promise((resolve) => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result as string);
                    reader.readAsDataURL(blob);
                  });
                } catch {
                  imageData = null;
                }
              }

              return {
                ...entry,
                timestamp: new Date(entry.timestamp),
                image: imageData,
              };
            })
          );
          setProcessingEntries(entriesWithDates);
        } catch (error) {
          console.error("Erro ao carregar entradas do localStorage:", error);
        }
      }
    };
    loadEntries();
  }, []);

  // Salvar entradas no localStorage quando mudarem (com conversão de imagens)
  useEffect(() => {
    if (processingEntries.length > 0) {
      const saveEntries = async () => {
        const entriesToSave = await Promise.all(
          processingEntries.map(async (entry) => {
            let imageData = entry.image;
            // Se a imagem é um blob URL, converter para base64 antes de salvar
            if (entry.image && entry.image.startsWith("blob:")) {
              try {
                const response = await fetch(entry.image);
                const blob = await response.blob();
                imageData = await new Promise((resolve) => {
                  const reader = new FileReader();
                  reader.onloadend = () => resolve(reader.result as string);
                  reader.readAsDataURL(blob);
                });
              } catch {
                imageData = null;
              }
            }

            return {
              ...entry,
              image: imageData,
            };
          })
        );

        localStorage.setItem(
          "processingEntries",
          JSON.stringify(entriesToSave)
        );
      };

      saveEntries();
    }
  }, [processingEntries]);

  const handleProcessingComplete = (entry: ProcessingEntry) => {
    setProcessingEntries((prev) => [entry, ...prev]);
    setSelectedEntry(entry);
  };

  const handleProcessingUpdate = (updatedEntry: ProcessingEntry) => {
    setProcessingEntries((prev) =>
      prev.map((entry) => (entry.id === updatedEntry.id ? updatedEntry : entry))
    );
    if (selectedEntry?.id === updatedEntry.id) {
      setSelectedEntry(updatedEntry);
    }
  };

  const handleRetryOcr = async (entry: ProcessingEntry) => {
    // Reinicia o status para processing
    const updatedEntry = {
      ...entry,
      status: "processing" as const,
      error: null,
    };
    handleProcessingUpdate(updatedEntry);

    // Simular um scan_id baseado no ID da entrada
    const scanId = `retry-${entry.id}`;

    // Usar a função global exposta pelo ImageUpload
    if ((window as any).retryOcr) {
      (window as any).retryOcr(updatedEntry, scanId);
    }
  };

  const handleRetryPoints = async (entry: ProcessingEntry) => {
    // Reinicia os pontos para processamento
    const updatedEntry = { ...entry, points: undefined };
    handleProcessingUpdate(updatedEntry);

    // Simular um transaction_id baseado no ID da entrada
    const transactionId = `retry-points-${entry.id}`;

    // Usar a função global exposta pelo ImageUpload
    if ((window as any).retryPoints) {
      (window as any).retryPoints(updatedEntry, transactionId);
    }
  };

  const handleCancelProcessing = (entry: ProcessingEntry) => {
    // Cancela o processamento definindo status como error
    const updatedEntry = {
      ...entry,
      status: "error" as const,
      error: "Processamento cancelado pelo usuário",
    };
    handleProcessingUpdate(updatedEntry);
  };

  const handleDeleteEntry = (entry: ProcessingEntry) => {
    // Remove a entrada da lista
    setProcessingEntries((prev) => prev.filter((e) => e.id !== entry.id));

    // Se era a entrada selecionada, limpa a seleção
    if (selectedEntry?.id === entry.id) {
      setSelectedEntry(null);
    }
  };

  return (
    <main className="min-h-screen app-ambient-bg">
      <SEO
        title="Nectar"
        description="Envie uma imagem, converta para PNG, faça upload e execute OCR automaticamente. Resultado exibido com formatação bonita."
        canonical={
          typeof window !== "undefined" ? window.location.href : undefined
        }
      />

      <header className="container mx-auto py-10">
        <h1 className="text-3xl md:text-4xl font-semibold tracking-tight text-foreground text-center">
          OCR de Imagens
        </h1>
        <p className="mt-3 text-muted-foreground text-center">
          Arraste e solte uma imagem e veja a geração de pontos abaixo.
        </p>
      </header>

      <section className="container mx-auto pb-16">
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
          <div className="xl:col-span-1">
            <ImageUpload
              onProcessingComplete={handleProcessingComplete}
              onProcessingUpdate={handleProcessingUpdate}
              onRetryOcr={handleRetryOcr}
              onRetryPoints={handleRetryPoints}
            />
          </div>

          <div className="xl:col-span-1">
            <ProcessingHistory
              entries={processingEntries}
              selectedEntry={selectedEntry}
              onSelectEntry={setSelectedEntry}
              onRetryOcr={handleRetryOcr}
              onRetryPoints={handleRetryPoints}
              onCancelProcessing={handleCancelProcessing}
              onDeleteEntry={handleDeleteEntry}
            />
          </div>

          <div className="xl:col-span-1">
            <ResultDisplay
              selectedEntry={selectedEntry}
              onRetryOcr={handleRetryOcr}
              onRetryPoints={handleRetryPoints}
            />
          </div>
        </div>
      </section>
    </main>
  );
};

export default Index;
