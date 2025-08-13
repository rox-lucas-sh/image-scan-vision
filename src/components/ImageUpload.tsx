import { useCallback, useRef, useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

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

async function convertToPng(file: File): Promise<Blob> {
  const dataUrl = await fileToDataURL(file);
  const img = await loadImage(dataUrl);
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth || img.width;
  canvas.height = img.naturalHeight || img.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas não suportado.");
  ctx.drawImage(img, 0, 0);
  const blob: Blob | null = await new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/png", 0.92));
  if (!blob) throw new Error("Falha ao converter para PNG.");
  return blob;
}

interface ProcessingEntry {
  id: string;
  timestamp: Date;
  image: string | null;
  status: 'processing' | 'valid' | 'invalid' | 'error';
  data: any;
  error: string | null;
  points?: number | null;
}

interface ImageUploadProps {
  onProcessingComplete: (entry: ProcessingEntry) => void;
  onProcessingUpdate: (entry: ProcessingEntry) => void;
  onRetryOcr?: (entry: ProcessingEntry) => void;
  onRetryPoints?: (entry: ProcessingEntry) => void;
}

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

const ImageUpload = ({ onProcessingComplete, onProcessingUpdate, onRetryOcr, onRetryPoints }: ImageUploadProps) => {
  const [isDragging, setDragging] = useState(false);
  const [pngBlob, setPngBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [token, setToken] = useState('');
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
    const savedToken = localStorage.getItem('authToken');
    if (savedToken) {
      setToken(savedToken);
    }
  }, []);

  // Salvar token no localStorage quando mudar
  useEffect(() => {
    if (token.trim()) {
      localStorage.setItem('authToken', token);
    }
  }, [token]);

  const handleFiles = useCallback(async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Selecione um arquivo de imagem.");
      return;
    }
    try {
      const blob = await convertToPng(file);
      if (blob.size > BYTES_5MB) {
        toast.error(`Imagem convertida excede 5 MB (${bytesToMB(blob.size)} MB).`);
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

  const onDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) await handleFiles(file);
  }, [handleFiles]);

  const onSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) await handleFiles(file);
  }, [handleFiles]);

  const validateOcrData = (text: string) => {
    let isValid = false;
    let parsedData = null;
    
    try {
      parsedData = JSON.parse(text);
      isValid = true;
      for (const value of Object.values(parsedData)) {
        if(value === null || value === undefined) {
          isValid = false;
        }
      }
      if (!parsedData.emitente_cnpj) {
        isValid = false
      }
    } catch {
      isValid = false;
      parsedData = text;
    }

    console.dir("Parsed Data: ", parsedData)
    console.dir("isValid: ", isValid)

    return { isValid, parsedData };
  };

  const doUploadAndScan = useCallback(async () => {
    if (!pngBlob) return;
    if (!token.trim()) {
      toast.error("Token de autenticação é obrigatório!");
      return;
    }
    
    setIsLoading(true);
    
    const newEntry: ProcessingEntry = {
      id: Date.now().toString(),
      timestamp: new Date(),
      image: previewUrl,
      status: 'processing',
      data: null,
      error: null,
      points: null
    };

    try {
      const file = new File([pngBlob], "upload.png", { type: "image/png" });
      const form = new FormData();
      form.append("file", file);

      const uploadRes = await fetch(`http://localhost:2020/upload`, { method: "POST", body: form });
      if (!uploadRes.ok) throw new Error(`Falha no upload (${uploadRes.status}).`);
      const uploadJson = await uploadRes.json();
      const imageId: string | undefined = uploadJson?.image_id;
      if (!imageId) throw new Error("image_id ausente na resposta de upload.");

      const scanRes = await fetch(`http://localhost:2020/scan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image_id: imageId }),
      });
      
      if (!scanRes.ok) {
        const errorText = await scanRes.text();
        newEntry.status = 'error';
        newEntry.error = errorText || `Falha no OCR (${scanRes.status}).`;
        onProcessingComplete(newEntry);
        throw new Error(errorText || `Falha no OCR (${scanRes.status}).`);
      }

      const scanData = await scanRes.json();
      const scanId = scanData?.scan_id;
      if (!scanId) throw new Error("scan_id ausente na resposta de scan.");

      // Adiciona à lista imediatamente com status processing
      onProcessingComplete(newEntry);
      
      // Inicia polling para verificar OCR
      startOcrPolling(newEntry, scanId);
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "Erro ao processar o OCR.");
      
      if (newEntry.status === 'processing') {
        newEntry.status = 'error';
        newEntry.error = e?.message || "Erro ao processar o OCR.";
        onProcessingComplete(newEntry);
      }
    } finally {
      setIsLoading(false);
    }
  }, [pngBlob, previewUrl, onProcessingComplete, token]);

  const startPointsProcessing = async (entry: ProcessingEntry, ocrData: any) => {
    try {
      console.log("Sending OCR Data to Motor:", ocrData);
      
      // Primeiro, gerar pontos
      const generateResponse = await fetch('http://localhost:2021/points/generate', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          value: ocrData.valor_total,
          params: { age: "21" },
          nfid: entry.id
        })
      });

      if (!generateResponse.ok) {
        throw new Error(`Erro ao gerar pontos: ${generateResponse.status}`);
      }

      const generateData = await generateResponse.json();
      const transactionId = generateData.transactionId;

      if (!transactionId) {
        throw new Error("TransactionId não retornado");
      }

      // Inicia o polling para verificar pontos a cada 5s
      startPointsPolling(entry, transactionId);
      
    } catch (error) {
      console.error("Erro no processamento de pontos:", error);
      entry.points = null;
      onProcessingUpdate(entry);
    }
  };

  const startOcrPolling = (entry: ProcessingEntry, scanId: string) => {
    const pollInterval = setInterval(async () => {
      try {
        const verifyResponse = await fetch(`http://localhost:2020/scan/verify`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ scan_id: scanId })
        });

        if (!verifyResponse.ok) {
          throw new Error(`Erro ao verificar OCR: ${verifyResponse.status}`);
        }

        const ocrData = await verifyResponse.text();
        
        // Se chegou aqui, OCR foi processado
        const { isValid, parsedData } = validateOcrData(ocrData);
        entry.status = isValid ? 'valid' : 'invalid';
        entry.data = parsedData;
        
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
      if (entry.status === 'processing') {
        entry.status = 'error';
        entry.error = "Timeout no processamento do OCR.";
        onProcessingUpdate(entry);
      }
    }, 120000);
  };

  const startPointsPolling = (entry: ProcessingEntry, transactionId: string) => {
    const pollInterval = setInterval(async () => {
      try {
        const verifyResponse = await fetch(`http://localhost:2021/points/verify/${transactionId}`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });

        if (!verifyResponse.ok) {
          throw new Error(`Erro ao verificar pontos: ${verifyResponse.status}`);
        }

        const verifyData = await verifyResponse.json();
        console.log("Verified data:", verifyData);
        
        if (verifyData.status === "generated" && verifyData.points) {
          entry.points = parseInt(verifyData.points) || 0;
          onProcessingUpdate(entry);
          clearInterval(pollInterval);
        }
        
      } catch (error) {
        console.error("Erro ao verificar pontos:", error);
        entry.points = null;
        onProcessingUpdate(entry);
        clearInterval(pollInterval);
      }
    }, 5000); // 5 segundos

    // Limita o polling a 2 minutos (24 tentativas)
    setTimeout(() => {
      clearInterval(pollInterval);
      if (entry.points === null) {
        console.warn("Timeout no processamento de pontos para entry:", entry.id);
      }
    }, 120000);
  };

  // Exposar funções de retry através das props
  if (onRetryOcr) {
    (window as any).retryOcr = (entry: ProcessingEntry, scanId: string) => {
      startOcrPolling(entry, scanId);
    };
  }

  if (onRetryPoints) {
    (window as any).retryPoints = (entry: ProcessingEntry, transactionId: string) => {
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
          Solte a imagem aqui ou clique para selecionar. Ela será convertida para PNG antes do envio (limite 5 MB).
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div
          onDrop={onDrop}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onClick={() => inputRef.current?.click()}
          className={`relative flex items-center justify-center h-[280px] md:h-[360px] lg:h-[420px] rounded-md border border-dashed cursor-pointer transition-colors ${isDragging ? 'border-primary bg-secondary/40' : 'border-border bg-muted/20'}`}
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
                Arraste e solte a imagem aqui, ou <span className="font-medium text-foreground">clique</span> para selecionar
              </p>
              <p className="mt-2 text-xs text-muted-foreground">Formatos suportados: JPG, PNG, WEBP, etc.</p>
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
            disabled={!pngBlob || isLoading}
          >
            {isLoading ? 'Enviando e processando…' : 'Enviar e executar OCR'}
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