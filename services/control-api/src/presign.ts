import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export async function presignPut(params: {
  bucket: string;
  key: string;
  contentType: string;
  expiresSec: number;
}): Promise<{ url: string; method: "PUT"; headers: Record<string, string> }> {
  const endpoint = process.env.MINIO_ENDPOINT ?? "http://127.0.0.1:9000";
  const accessKeyId = process.env.MINIO_ROOT_USER ?? "minio";
  const secretAccessKey = process.env.MINIO_ROOT_PASSWORD ?? "minio12345";
  const region = process.env.MINIO_REGION ?? "us-east-1";

  const client = new S3Client({
    region,
    endpoint,
    forcePathStyle: true,
    credentials: { accessKeyId, secretAccessKey },
  });

  const cmd = new PutObjectCommand({
    Bucket: params.bucket,
    Key: params.key,
    ContentType: params.contentType,
  });
  const url = await getSignedUrl(client, cmd, { expiresIn: params.expiresSec });
  return {
    url,
    method: "PUT",
    headers: { "Content-Type": params.contentType },
  };
}
