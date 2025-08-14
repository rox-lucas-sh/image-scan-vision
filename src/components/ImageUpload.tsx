import { useCallback, useRef, useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  GerarPontos,
  Scan,
  Upload,
  VerifyOcrRoute,
  VerifyPoints,
} from "@/hooks/requests";
import { convertToJpg } from "./convert";

const BYTES_5MB = 5 * 1024 * 1024;

function bytesToMB(bytes: number) {
  return (bytes / (1024 * 1024)).toFixed(2);
}

async function fileToDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Falha ao ler arquivo."));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });
}

async function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Falha ao carregar imagem."));
    img.src = src;
  });
}

export interface ProcessingEntry {
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

interface ImageUploadProps {
  onProcessingComplete: (entry: ProcessingEntry) => void;
  onProcessingUpdate: (entry: ProcessingEntry) => void;
  onRetryOcr?: (entry: ProcessingEntry) => void;
  onRetryPoints?: (entry: ProcessingEntry) => void;
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const ImageUpload = ({
  onProcessingComplete,
  onProcessingUpdate,
  onRetryOcr,
  onRetryPoints,
}: ImageUploadProps) => {
  const [isDragging, setDragging] = useState(false);
  const [pngBlob, setPngBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [token, setToken] = useState(
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJjbGllbnQiOiJzaG9wcGluZzIiLCJkYiI6InNob3BwaW5nMi1tb3Rvci1kZXYifQ.Gube3TeuC4NGgBFP4GcQnYMt3eznVy1pw-toFQo5Rrc"
  );
  const inputRef = useRef<HTMLInputElement>(null);

  // Função para converter blob URL para base64
  const blobUrlToBase64 = async (blobUrl: string): Promise<string | null> => {
    try {
      const response = await fetch(blobUrl);
      const blob = await response.blob();
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(blob);
      });
    } catch {
      return null;
    }
  };

  // Carregar token do localStorage na inicialização
  useEffect(() => {
    const savedToken = localStorage.getItem("authToken");
    if (savedToken) {
      setToken(savedToken);
    }
  }, []);

  // Salvar token no localStorage quando mudar
  useEffect(() => {
    if (token.trim()) {
      localStorage.setItem("authToken", token);
    }
  }, [token]);

  const handleFiles = useCallback(async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Selecione um arquivo de imagem.");
      return;
    }
    try {
      const blob = await convertToJpg(file);
      if (blob.size > BYTES_5MB) {
        // should never happen, since the convert function always
        // makes images smaller.
        toast.error(
          `Imagem convertida excede 7 MB (${bytesToMB(blob.size)} MB).`
        );
        return;
      }
      const url = URL.createObjectURL(blob);
      setPngBlob(blob);
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return url;
      });
      toast.success("Imagem pronta para envio (PNG).");
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "Erro ao preparar a imagem.");
    }
  }, []);

  const onDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files?.[0];
      if (file) await handleFiles(file);
    },
    [handleFiles]
  );

  const onSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) await handleFiles(file);
    },
    [handleFiles]
  );

  const doUploadAndScan = useCallback(async () => {
    if (!pngBlob) return;
    if (!token.trim()) {
      toast.error("Token de autenticação é obrigatório!");
      return;
    }

    setIsLoading(true);

    const defaultEntry: ProcessingEntry = {
      id: Date.now().toString(),
      timestamp: new Date(),
      image: previewUrl,
      status: "processing",
      data: null,
      error: null,
      points: null,
    };

    try {
      const imageId = await Upload(pngBlob);

      const { newEntry, scanId } = await Scan(
        imageId,
        previewUrl,
        onProcessingComplete,
        defaultEntry
      );

      // Adiciona à lista imediatamente com status processing
      onProcessingComplete(newEntry);

      // Inicia polling para verificar OCR
      startOcrPolling(newEntry, scanId);
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "Erro ao processar o OCR.");

      if (defaultEntry.status === "processing") {
        defaultEntry.status = "error";
        defaultEntry.error = e?.message || "Erro ao processar o OCR.";
        onProcessingComplete(defaultEntry);
      }
    } finally {
      setIsLoading(false);
    }
  }, [pngBlob, previewUrl, onProcessingComplete, token]);

  const startPointsProcessing = async (
    entry: ProcessingEntry,
    ocrData: any
  ) => {
    try {
      console.log("Sending OCR Data to Motor:", ocrData);

      // Primeiro, gerar pontos
      const transactionId = await GerarPontos(token, ocrData);

      // Salvar transactionId na entry
      entry.transactionId = transactionId;

      // Inicia o polling para verificar pontos a cada 5s
      startPointsPolling(entry, transactionId);
    } catch (error) {
      console.error("Erro no processamento de pontos:", error);
      entry.points = null;
      entry.error = "Erro ao gerar pontos";
      onProcessingUpdate(entry);
    }
  };

  const startOcrPolling = (entry: ProcessingEntry, scanId: string) => {
    const pollInterval = setInterval(async () => {
      try {
        const { parsedData, isValid } = await VerifyOcrRoute(scanId, entry);

        onProcessingUpdate(entry);
        clearInterval(pollInterval);

        // Se válido, inicia processamento de pontos
        if (isValid) {
          try {
            await startPointsProcessing(entry, parsedData);
          } catch (pointsError: any) {
            console.warn("Erro ao processar pontos:", pointsError);
          }
        }

        toast.success("OCR concluído com sucesso.");
      } catch (error) {
        console.error("Erro ao verificar OCR:", error);
        // Continua tentando, não para o polling no erro
      }
    }, 1000); // 1 segundo

    // Limita o polling a 2 minutos (120 tentativas)
    setTimeout(() => {
      clearInterval(pollInterval);
      if (entry.status === "processing") {
        entry.status = "cancelled";
        entry.error = "Processamento cancelado - Timeout no OCR.";
        onProcessingUpdate(entry);
      }
    }, 120000);
  };

  const startPointsPolling = (
    entry: ProcessingEntry,
    transactionId: string
  ) => {
    let attemptCount = 0;

    // Set points to undefined to show "processando" state
    entry.points = undefined;
    onProcessingUpdate(entry);

    const pollInterval = setInterval(async () => {
      attemptCount++;
      try {
        await VerifyPoints(
          token,
          transactionId,
          entry,
          pollInterval,
          onProcessingUpdate,
          attemptCount
        );
      } catch (error) {
        console.error("Erro ao verificar pontos:", error);
        entry.points = null;
        entry.error = "Erro ao processar pontos";
        onProcessingUpdate(entry);
        clearInterval(pollInterval);
      }
    }, 5000); // 5 segundos
  };

  // Exposar funções de retry através das props
  if (onRetryOcr) {
    (window as any).retryOcr = (entry: ProcessingEntry, scanId: string) => {
      startOcrPolling(entry, scanId);
    };
  }

  if (onRetryPoints) {
    (window as any).retryPoints = (
      entry: ProcessingEntry,
      transactionId: string
    ) => {
      startPointsPolling(entry, transactionId);
    };
  }

  const clearImage = useCallback(() => {
    setPngBlob(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
  }, [previewUrl]);

  return (
    <Card className="shadow-sm">
      <CardHeader>
        <div className="space-y-4">
          <input
            type="text"
            placeholder="Token de autenticação para pontos (obrigatório)"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            className="w-full px-0 py-2 text-sm bg-transparent border-0 outline-none placeholder:text-muted-foreground/60 focus:ring-0"
            required
          />
        </div>
        <CardTitle>Imagem</CardTitle>
        <CardDescription>
          Solte a imagem aqui ou clique para selecionar. Ela será convertida
          para PNG antes do envio.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div
          onDrop={onDrop}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onClick={() => inputRef.current?.click()}
          className={`relative flex items-center justify-center h-[280px] md:h-[360px] lg:h-[420px] rounded-md border border-dashed cursor-pointer transition-colors ${
            isDragging
              ? "border-primary bg-secondary/40"
              : "border-border bg-muted/20"
          }`}
          aria-label="Área para soltar a imagem"
        >
          {previewUrl ? (
            <img
              src={previewUrl}
              alt="Pré-visualização da imagem selecionada para OCR"
              className="h-full w-full object-contain rounded-md"
              loading="lazy"
            />
          ) : (
            <div className="text-center px-6">
              <p className="text-sm text-muted-foreground">
                Arraste e solte a imagem aqui, ou{" "}
                <span className="font-medium text-foreground">clique</span> para
                selecionar
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                Formatos suportados: JPG, PNG, WEBP, etc.
              </p>
            </div>
          )}
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={onSelect}
          />
        </div>

        <div className="mt-6 flex items-center gap-3">
          <Button
            variant="brand"
            onClick={doUploadAndScan}
            disabled={isLoading && !pngBlob}
          >
            {isLoading ? "Enviando e processando…" : "Enviar e executar OCR"}
          </Button>
          <Button
            variant="outline"
            onClick={clearImage}
            disabled={isLoading && !pngBlob}
          >
            Limpar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default ImageUpload;
