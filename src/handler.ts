import sharp from 'sharp';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

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
  const inputType: InputType = event?.headers ? 'api' : 's3';

  if (!isCorrectType(event, inputType)) throw new Error('Input must be of JPG type!');
  if (!isBinary(event, inputType)) throw new Error('Input must be binary (Base64-encoded)!');

  const bucket = process.env.BUCKET_NAME || '';
  if (!bucket) throw new Error('Missing bucket name!');

  const resizedImagesPath = process.env.RESIZED_IMAGES_PATH;
  if (!resizedImagesPath) throw new Error('Missing path to resized images!');

  try {
    const imageBuffers = await getImageBuffers(event, inputType, bucket);
    await convertImages({ bucket, resizedImagesPath, imageBuffers, conversions });

    return result();
  } catch (error: any) {
    console.error(error);
    const statusCode = error?.['cause']?.['statusCode'] || 400;
    return result('Error', statusCode);
  }
}

/**
 * @description Validation for correct type of input.
 */
function isCorrectType(event: Record<string, any>, inputType: InputType) {
  // Handle API Gateway
  if (inputType === 'api') {
    if (event.headers['content-type'] === 'image/jpg') return true;
    return false;
  }

  // Handle S3 records
  const records = event?.Records || [];

  const results = records.map((record: Record<string, any>) => {
    const key = record.s3?.object?.key || '';
    const split = key.split('/');
    return split[split.length - 1].endsWith('.jpg');
  });

  return results.every((result: boolean) => result === true);
}

/**
 * @description Validation for binary input. We only know this up-front with API Gateway.
 */
function isBinary(event: Record<string, any>, inputType: InputType) {
  if (inputType === 'api') return !!event?.isBase64Encoded;
  return true;
}

/**
 * @description Get the file names (paths) of S3 records and their keys.
 */
function getFileNamesFromRecords(records: Record<string, any>[]) {
  return records
    .map((record: Record<string, any>) => record.s3?.object?.key || '')
    .filter((fileName) => fileName);
}

/**
 * @description Gets buffers for all images. For API Gateway input, we can
 * get it from the body, but for S3 we will have to get all of the images.
 */
async function getImageBuffers(
  event: Record<string, any>,
  inputType: InputType,
  bucket: string
): Promise<Buffer[]> {
  if (inputType === 'api') return [Buffer.from(event.body, 'base64')];

  const records = getFileNamesFromRecords(event?.Records || []);
  const buffers: Buffer[] = [];

  for (const record of records) {
    const buffer = await get(bucket, record);
    buffers.push(Buffer.from(buffer, 'base64'));
  }

  return buffers;
}

/**
 * @description This is the "use case" code to handle the actual process of
 * converting images and then writing them to a bucket.
 */
async function convertImages(options: ConvertImagesOptions) {
  const { bucket, resizedImagesPath, imageBuffers, conversions } = options;

  for (const imageBuffer of imageBuffers) {
    const images = await Promise.all(
      conversions.map((conversion) => convert(imageBuffer, conversion))
    );

    const date = Date.now();

    for (const [index, image] of images.entries()) {
      const w = conversions[index].maxWidth;
      const h = conversions[index].maxHeight;
      const name = `${resizedImagesPath}/image-${date}-${w}x${h}.jpg`;
      await write(bucket, name, image);
    }
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

async function get(bucket: string, key: string) {
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key
  });

  const response = await client.send(command);
  return (await response.Body?.transformToString('base64')) || '';
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

type ConvertImagesOptions = {
  bucket: string;
  resizedImagesPath: string;
  imageBuffers: Buffer[];
  conversions: ConversionSettings[];
};

type InputType = 'api' | 's3';
