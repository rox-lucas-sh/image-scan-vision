import { useCallback, useRef, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { time } from "console";

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
}

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

const ImageUpload = ({ onProcessingComplete }: ImageUploadProps) => {
  const [isDragging, setDragging] = useState(false);
  const [pngBlob, setPngBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [token, setToken] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

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

  const doUploadAndScan = useCallback(async () => {
    if (!pngBlob) return;
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
      const text = await scanRes.text();
      
      if (!scanRes.ok) {
        newEntry.status = 'error';
        newEntry.error = text || `Falha no OCR (${scanRes.status}).`;
        onProcessingComplete(newEntry);
        throw new Error(text || `Falha no OCR (${scanRes.status}).`);
      }

      // Verifica se o retorno é JSON válido e não vazio
      let isValid = false;
      let parsedData = null;
      
      try {
        parsedData = JSON.parse(text);
        // Considera válido se é um objeto com pelo menos uma propriedade
        isValid = parsedData && typeof parsedData === 'object' && Object.keys(parsedData).length > 0;
      } catch {
        // Se não é JSON, considera válido se tem conteúdo
        isValid = text.trim().length > 0;
        parsedData = text;
      }

      newEntry.status = isValid ? 'valid' : 'invalid';
      newEntry.data = parsedData;

      await delay(1000);
      
      // Se o OCR foi bem-sucedido e temos um token, gerar pontos
      if (isValid && token.trim()) {
        try {
          await generateAndVerifyPoints(newEntry, parsedData);
        } catch (pointsError: any) {
          console.warn("Erro ao processar pontos:", pointsError);
          // Não falhamos o OCR por causa dos pontos
        }
      }
      
      onProcessingComplete(newEntry);
      toast.success("OCR concluído com sucesso.");
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

  const generateAndVerifyPoints = async (entry: ProcessingEntry, ocrData: any) => {
    if (!token.trim()) return;

    try {
      console.log(ocrData)
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

      // Depois, verificar pontos
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
      entry.points = parseInt(verifyData.points) || 0;
      
    } catch (error) {
      console.error("Erro no processamento de pontos:", error);
      entry.points = null;
    }
  };

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
            placeholder="Token de autenticação para pontos"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            className="w-full px-0 py-2 text-sm bg-transparent border-0 outline-none placeholder:text-muted-foreground/60 focus:ring-0"
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