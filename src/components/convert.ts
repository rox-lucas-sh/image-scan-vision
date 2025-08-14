export async function convertToJpg(file: File): Promise<Blob> {
  const TARGET_SIZE = 6 * 1024 * 1024; // 5MB (margem de 2MB sobre o limite de 7MB)
  const MAX_DIMENSION = 2048; // Dimensão máxima para redimensionamento inicial

  const dataUrl = await fileToDataURL(file);
  const img = await loadImage(dataUrl);

  // Calcula as dimensões iniciais
  let { width, height } = calculateDimensions(
    img.naturalWidth || img.width,
    img.naturalHeight || img.height,
    MAX_DIMENSION
  );

  let quality = 0.9; // Qualidade inicial
  let blob: Blob;
  let attempts = 0;
  const maxAttempts = 8; // Limita tentativas para evitar loop infinito

  do {
    attempts++;

    // Cria canvas com as dimensões calculadas
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas não suportado.");

    // Aplica configurações para melhor qualidade
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    // Desenha a imagem redimensionada
    ctx.drawImage(img, 0, 0, width, height);

    // Converte para JPG
    blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) =>
          b ? resolve(b) : reject(new Error("Falha ao converter para JPG.")),
        "image/jpeg",
        quality
      );
    });

    // Se ainda está muito grande, ajusta parâmetros
    if (blob.size > TARGET_SIZE && attempts < maxAttempts) {
      if (quality > 0.8) {
        // Primeiro reduz a qualidade
        quality = Math.max(0.5, quality - 0.15);
      } else {
        // Se a qualidade já está baixa, reduz dimensões
        const scaleFactor = 0.8;
        width = Math.floor(width * scaleFactor);
        height = Math.floor(height * scaleFactor);
        quality = Math.min(0.8, quality + 0.1); // Recupera um pouco a qualidade
      }
    }
  } while (blob.size > TARGET_SIZE && attempts < maxAttempts);

  console.log(
    `Imagem convertida: ${(blob.size / 1024 / 1024).toFixed(
      2
    )}MB, ${width}x${height}, qualidade: ${quality}`
  );

  return blob;
}

function calculateDimensions(
  originalWidth: number,
  originalHeight: number,
  maxDimension: number
): { width: number; height: number } {
  // Se a imagem já é pequena, mantém o tamanho original
  if (originalWidth <= maxDimension && originalHeight <= maxDimension) {
    return { width: originalWidth, height: originalHeight };
  }

  // Calcula o fator de escala mantendo proporção
  const scaleFactor = Math.min(
    maxDimension / originalWidth,
    maxDimension / originalHeight
  );

  return {
    width: Math.floor(originalWidth * scaleFactor),
    height: Math.floor(originalHeight * scaleFactor),
  };
}

// Funções auxiliares (caso você não as tenha)
function fileToDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target?.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}
