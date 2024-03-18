# AWS Lambda Image Resizer Demo

This example code shows image resizing, either based on binary input to an API Gateway and Lambda, or as an event-driven flow from images placed in an S3 subpath.

For the API Gateway case, it:

- Takes the binary input of a JPG image;
- converts it into a buffer;
- converts it according to your settings into a number of resized images using [Sharp](https://github.com/lovell/sharp);
- and then puts them in an S3 bucket in designated area for resized files.

For the S3 event-driven case it does the same, but assumes that the input is a JPG file added to the `original` path of an S3 bucket.

All in all, the infrastructure used is API Gateway v2 (HTTP API), Lambda, and S3.

This example simplifies what has been a complicated and tricky process using Lambda Layers and other workarounds - doing it this way is _much_ easier and more straightforward.

## Prerequisites

It is assumed that:

- You have a recent Node.js version installed (ideally version 20 or later)
- You have an AWS account
- You have sufficient privileges to deploy infrastructure such as Lambda, API Gateway and S3 to AWS
- You are logged into AWS through your environment

## Preparation

Make sure to set a unique value in `serverless.yml` for `custom.imagesBucketName`.

If you want to set the paths for where to locate the original files and the output destination, they are available under `custom.imagesBucketPrefix` (**Default**: `original/`) and `custom.resizedImagesPath` (**Default**: `images-resized`).

Also, you can change the resizing settings in `src/handler.ts` in the `conversions` object.

## Local development

Run `npm start`.

## Deployment

Run `npm run deploy`.

## Remove the stack

Run `npm run teardown`.

## Example call

Using the provided example image, you could call your API similar to this:

```bash
curl -X POST https://RANDOM.execute-api.REGION.amazonaws.com/ \
  -H "Content-Type: image/jpg" \
  --data-binary '@image.jpg'
```
