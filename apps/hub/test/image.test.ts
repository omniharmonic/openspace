import { describe, expect, it } from "vitest";
import { imageSize } from "../src/lib/image";

describe("imageSize", () => {
  it("reads PNG, GIF, JPEG and WebP headers", () => {
    const png = [
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52,
    ];
    expect(imageSize(new Uint8Array([...png, 0, 0, 1, 0, 0, 0, 0, 200]))).toEqual({
      mime: "image/png",
      width: 256,
      height: 200,
    });
    expect(imageSize(new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 10, 0, 20, 0]))).toEqual({
      mime: "image/gif",
      width: 10,
      height: 20,
    });
    // SOI, APP0 (len 16), SOF0 with height 300 / width 400.
    const jpeg = [0xff, 0xd8, 0xff, 0xe0, 0, 16, ...new Array(14).fill(0)];
    jpeg.push(0xff, 0xc0, 0, 17, 8, 0x01, 0x2c, 0x01, 0x90, 3, 0, 0, 0);
    expect(imageSize(new Uint8Array(jpeg))).toEqual({
      mime: "image/jpeg",
      width: 400,
      height: 300,
    });
    const riff = [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50];
    const vp8x = [
      ...riff,
      0x56,
      0x50,
      0x38,
      0x58,
      10,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0x1f,
      0x03,
      0,
      0xc7,
      0,
      0,
    ];
    expect(imageSize(new Uint8Array(vp8x))).toEqual({
      mime: "image/webp",
      width: 800,
      height: 200,
    });
    expect(imageSize(new Uint8Array([1, 2, 3]))).toBeNull();
  });
});
