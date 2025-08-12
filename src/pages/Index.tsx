import { useState, useEffect } from "react";
import SEO from "@/components/SEO";
import ImageUpload from "@/components/ImageUpload";
import ProcessingHistory from "@/components/ProcessingHistory";
import ResultDisplay from "@/components/ResultDisplay";

interface ProcessingEntry {
  id: string;
  timestamp: Date;
  image: string | null;
  status: 'processing' | 'valid' | 'invalid' | 'error';
  data: any;
  error: string | null;
  points?: number | null;
}

const Index = () => {
  const [processingEntries, setProcessingEntries] = useState<ProcessingEntry[]>([]);
  const [selectedEntry, setSelectedEntry] = useState<ProcessingEntry | null>(null);

  // Carregar dados do localStorage na inicialização
  useEffect(() => {
    const savedEntries = localStorage.getItem('processingEntries');
    if (savedEntries) {
      try {
        const parsed = JSON.parse(savedEntries);
        // Reconstitui as datas
        const entriesWithDates = parsed.map((entry: any) => ({
          ...entry,
          timestamp: new Date(entry.timestamp)
        }));
        setProcessingEntries(entriesWithDates);
      } catch (error) {
        console.error("Erro ao carregar dados do localStorage:", error);
      }
    }
  }, []);

  // Salvar dados no localStorage quando mudarem
  useEffect(() => {
    if (processingEntries.length > 0) {
      localStorage.setItem('processingEntries', JSON.stringify(processingEntries));
    }
  }, [processingEntries]);

  const handleProcessingComplete = (entry: ProcessingEntry) => {
    setProcessingEntries(prev => [entry, ...prev]);
    setSelectedEntry(entry);
  };

  const handleProcessingUpdate = (updatedEntry: ProcessingEntry) => {
    setProcessingEntries(prev => 
      prev.map(entry => 
        entry.id === updatedEntry.id ? updatedEntry : entry
      )
    );
    if (selectedEntry?.id === updatedEntry.id) {
      setSelectedEntry(updatedEntry);
    }
  };

  return (
    <main className="min-h-screen app-ambient-bg">
      <SEO
        title="OCR de Imagens – Upload e Extração de Texto"
        description="Envie uma imagem, converta para PNG, faça upload e execute OCR automaticamente. Resultado exibido com formatação bonita."
        canonical={typeof window !== 'undefined' ? window.location.href : undefined}
      />

      <header className="container mx-auto py-10">
        <h1 className="text-3xl md:text-4xl font-semibold tracking-tight text-foreground text-center">
          OCR de Imagens – Upload e Extração de Texto
        </h1>
        <p className="mt-3 text-muted-foreground text-center">
          Arraste e solte uma imagem à esquerda e visualize o resultado do OCR à direita.
        </p>
      </header>

      <section className="container mx-auto pb-16">
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
          <div className="xl:col-span-1">
            <ImageUpload 
              onProcessingComplete={handleProcessingComplete}
              onProcessingUpdate={handleProcessingUpdate}
            />
          </div>
          
          <div className="xl:col-span-1">
            <ProcessingHistory 
              entries={processingEntries}
              selectedEntry={selectedEntry}
              onSelectEntry={setSelectedEntry}
            />
          </div>
          
          <div className="xl:col-span-1">
            <ResultDisplay selectedEntry={selectedEntry} />
          </div>
        </div>
      </section>
    </main>
  );
};

export default Index;
