import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import SEO from "@/components/SEO";
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

const Index = () => {
  const [isDragging, setDragging] = useState(false);
  const [pngBlob, setPngBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [resultBody, setResultBody] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

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
      setResultBody("");
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

  const parsedJSON = useMemo(() => {
    try {
      return JSON.stringify(JSON.parse(resultBody), null, 2);
    } catch {
      return resultBody;
    }
  }, [resultBody]);

  const doUploadAndScan = useCallback(async () => {
    if (!pngBlob) return;
    setIsLoading(true);
    setResultBody("");
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
      if (!scanRes.ok) throw new Error(text || `Falha no OCR (${scanRes.status}).`);
      setResultBody(text);
      toast.success("OCR concluído com sucesso.");
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "Erro ao processar o OCR.");
    } finally {
      setIsLoading(false);
    }
  }, [pngBlob]);

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
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <Card className="shadow-sm">
            <CardHeader>
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
                  onClick={() => { setPngBlob(null); if (previewUrl) URL.revokeObjectURL(previewUrl); setPreviewUrl(null); setResultBody(""); }}
                  disabled={isLoading && !pngBlob}
                >
                  Limpar
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle>Resposta do OCR</CardTitle>
              <CardDescription>
                Exibimos automaticamente o corpo da resposta. Se for JSON, formatamos para leitura.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {resultBody ? (
                <pre className="max-h-[520px] overflow-auto rounded-md border p-4 text-sm leading-relaxed bg-card text-card-foreground">
                  {parsedJSON}
                </pre>
              ) : (
                <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                  O resultado aparecerá aqui após o processamento.
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </section>
    </main>
  );
};

export default Index;
