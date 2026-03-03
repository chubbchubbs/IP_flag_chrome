#!/usr/bin/env python3
"""Generate default placeholder globe icons for chrome-flag-extension.
No external dependencies — only stdlib (struct, zlib, math)."""

import struct, zlib, math, os

SIZES = [16, 32, 48, 128]


def make_png(size: int, pixels: list[tuple]) -> bytes:
    """Encode an RGBA pixel list into a valid PNG file."""
    raw = b''
    for y in range(size):
        raw += b'\x00'                       # filter: None
        for x in range(size):
            raw += bytes(pixels[y * size + x])

    def chunk(tag: bytes, data: bytes) -> bytes:
        payload = tag + data
        return (struct.pack('>I', len(data))
                + payload
                + struct.pack('>I', zlib.crc32(payload) & 0xFFFFFFFF))

    ihdr = chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0))
    idat = chunk(b'IDAT', zlib.compress(raw, 9))
    iend = chunk(b'IEND', b'')
    return b'\x89PNG\r\n\x1a\n' + ihdr + idat + iend


def draw_globe(size: int) -> list[tuple]:
    """Draw a simple blue globe with grid lines and green 'continents'."""
    pixels = []
    cx = cy = size / 2
    R  = size * 0.45

    for y in range(size):
        for x in range(size):
            dx   = x - cx
            dy   = y - cy
            dist = math.sqrt(dx * dx + dy * dy)

            # Outside circle → transparent
            if dist > R + 1:
                pixels.append((0, 0, 0, 0))
                continue

            # Anti-aliased edge
            if dist > R:
                a = int((R + 1 - dist) * 220)
                pixels.append((25, 75, 155, a))
                continue

            nx = dx / R          # [-1 .. 1]
            ny = dy / R

            # Grid lines
            is_grid = (
                abs(ny) < 0.045 or               # equator
                abs(abs(ny) - 0.5) < 0.028 or    # tropics
                abs(nx) < 0.038                   # prime meridian
            )

            if is_grid:
                r, g, b = 30, 85, 165
            elif (                               # rough continent shapes
                (-0.08 < nx < 0.48 and -0.48 < ny < 0.38) or  # Europe/Africa
                (-0.68 < nx < -0.08 and -0.38 < ny < 0.36) or  # Americas
                (0.15  < nx < 0.78  and -0.52 < ny < 0.06)     # Asia
            ):
                r, g, b = 68, 155, 68
            else:
                r, g, b = 52, 118, 198   # ocean

            # Sphere shading — light from top-left
            nz    = math.sqrt(max(0.0, 1 - nx * nx - ny * ny))
            light = 0.65 + 0.35 * (-nx * 0.4 - ny * 0.4 + nz * 0.75)
            light = max(0.3, min(1.25, light))

            # Edge darkening
            edge  = (dist / R) ** 2.2
            light *= (1 - edge * 0.28)

            r = min(255, int(r * light))
            g = min(255, int(g * light))
            b = min(255, int(b * light))
            pixels.append((r, g, b, 255))

    return pixels


def main():
    out_dir = os.path.join(os.path.dirname(__file__), 'icons')
    os.makedirs(out_dir, exist_ok=True)

    for size in SIZES:
        pixels   = draw_globe(size)
        png_data = make_png(size, pixels)
        path     = os.path.join(out_dir, f'icon{size}.png')
        with open(path, 'wb') as f:
            f.write(png_data)
        print(f'  Created {path}  ({len(png_data):,} bytes)')

    print('\nDone. Icons saved to ./icons/')


if __name__ == '__main__':
    main()
