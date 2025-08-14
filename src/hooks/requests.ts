import { ProcessingEntry } from "@/components/ImageUpload";
import { ScanHost, MotorHost } from "./urls";

export async function Upload(pngBlob): Promise<String> {
  const file = new File([pngBlob], "upload.png", { type: "image/png" });
  const form = new FormData();
  form.append("file", file);

  const uploadRes = await fetch(`${ScanHost}/upload`, {
    method: "POST",
    body: form,
  });
  if (!uploadRes.ok) throw new Error(`Falha no upload (${uploadRes.status}).`);
  const uploadJson = await uploadRes.json();
  const imageId: string | undefined = uploadJson?.image_id;
  if (!imageId) throw new Error("image_id ausente na resposta de upload.");
  return imageId;
}

export async function Scan(
  imageId: String,
  previewUrl: string,
  onProcessingComplete: any,
  newEntry: any
): Promise<{ newEntry: ProcessingEntry; scanId: string }> {
  const scanRes = await fetch(`${ScanHost}/scan`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image_id: imageId }),
  });

  if (!scanRes.ok) {
    const errorText = await scanRes.text();
    newEntry.status = "error";
    newEntry.error = errorText || `Falha no OCR (${scanRes.status}).`;
    onProcessingComplete(newEntry);
    throw new Error(errorText || `Falha no OCR (${scanRes.status}).`);
  }

  const scanData = await scanRes.json();
  const scanId = scanData?.scan_id;
  if (!scanId) throw new Error("scan_id ausente na resposta de scan.");

  return { newEntry, scanId };
}

export async function GerarPontos(token: string, data: any) {
  const response = await fetch(`${MotorHost}/points/generate`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      value: Number.parseFloat(data.valor_total),
      params: data,
      nfid: randomString(),
    }),
  });
  const generateData = await response.json();

  if (!response.ok) {
    console.log(generateData);
    throw new Error(`Erro ao gerar pontos: ${response.status}`);
  }

  const transactionId = generateData.transactionId;

  if (!generateData.transactionId) {
    throw new Error("TransactionId não retornado");
  }
  return transactionId;
}

function randomString() {
  const letters = "0987654321qwertyuiopasdfghjklzxcvbnm";
  let rand = "";
  for (let i = 0; i < 12; i++) {
    rand += letters[Math.floor(Math.random() * (letters.length - 1))];
  }
  return rand;
}

export async function VerifyOcrRoute(scanId: string, entry: any) {
  const verifyResponse = await fetch(`${ScanHost}/scan/verify`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ scan_id: scanId }),
  });

  if (!verifyResponse.ok) {
    throw new Error(`Erro ao verificar OCR: ${verifyResponse.status}`);
  }

  const ocrData = await verifyResponse.text();

  // Se chegou aqui, OCR foi processado
  const { isValid, parsedData } = validateOcrData(ocrData);
  entry.status = isValid ? "valid" : "invalid";
  entry.data = parsedData;
  return { parsedData, isValid };
}

const validateOcrData = (text: string) => {
  let isValid = false;
  let parsedData = null;

  try {
    parsedData = JSON.parse(text);
    isValid = true;
    for (const value of Object.values(parsedData)) {
      if (value === null || value === undefined) {
        isValid = false;
      }
    }
    if (!parsedData.emitente_cnpj) {
      isValid = false;
    }
  } catch {
    isValid = false;
    parsedData = text;
  }

  console.dir("Parsed Data: ", parsedData);
  console.dir("isValid: ", isValid);

  return { isValid, parsedData };
};

export async function VerifyPoints(
  token: string,
  transactionId: string,
  entry: any,
  pollInterval: NodeJS.Timeout,
  onProcessingUpdate: any
) {
  const verifyResponse = await fetch(
    `${MotorHost}/points/verify/${transactionId}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

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
}
