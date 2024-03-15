import sharp from 'sharp';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

const client = new S3Client({});

// Set this to what you need
const conversions: ConversionSettings[] = [
  { maxWidth: 500, maxHeight: 500 },
  { maxWidth: 300, maxHeight: 300 },
  { maxWidth: 100, maxHeight: 100 }
];

/**
 * @description This Lambda handler takes the binary input of a JPG image,
 * converts it into a buffer, converts it according to your settings into
 * a number of resized images, and then puts them in an S3 bucket.
 * @see https://aws.amazon.com/blogs/compute/handling-binary-data-using-amazon-api-gateway-http-apis/
 */
export async function handler(event: Record<string, any>) {
  if (!event?.isBase64Encoded || event?.headers?.['content-type'] !== 'image/jpg')
    throw new Error('Input must be binary (Base64-encoded) and of JPG type!');

  const bucket = process.env.BUCKET_NAME || '';
  if (!bucket) throw new Error('Missing bucket name!');

  try {
    const imageBuffer = Buffer.from(event.body, 'base64');

    await convertImages(bucket, imageBuffer, conversions);

    return result();
  } catch (error: any) {
    console.error(error);
    const statusCode = error?.['cause']?.['statusCode'] || 400;
    return result('Error', statusCode);
  }
}

/**
 * @description This is the "use case" code to handle the actual process of
 * converting images and then writing them to a bucket.
 */
async function convertImages(
  bucket: string,
  imageBuffer: Buffer,
  conversions: ConversionSettings[]
) {
  const images = await Promise.all(
    conversions.map((conversion) => convert(imageBuffer, conversion))
  );

  const date = Date.now();

  for (const [index, image] of images.entries()) {
    const w = conversions[index].maxWidth;
    const h = conversions[index].maxHeight;
    const name = `image-${date}-${w}x${h}.jpg`;
    await write(bucket, name, image);
  }
}

/**
 * @description Use the Sharp library to convert an image buffer to a new size.
 * @see https://sharp.pixelplumbing.com/api-resize
 */
async function convert(input: Buffer, settings: ConversionSettings) {
  const { maxWidth, maxHeight } = settings;

  return sharp(input)
    .resize(maxWidth, maxHeight, {
      fit: sharp.fit.inside,
      withoutEnlargement: true
    })
    .toFormat('jpeg')
    .toBuffer();
}

/**
 * @description Write a buffer to an S3 bucket.
 */
async function write(bucket: string, key: string, body: Buffer) {
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: body
  });

  await client.send(command);
}

/**
 * @description Return a result in a nice way.
 */
function result(message: Record<string, any> | string = 'OK', statusCode = 200) {
  const body = JSON.stringify(message);

  return {
    statusCode,
    body
  };
}

type ConversionSettings = {
  maxWidth: number;
  maxHeight: number;
};
