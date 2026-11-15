(() => {
  const pageSizes = Object.freeze({
    A4: { width: 2480, height: 3508, dpi: 300 },
    A5: { width: 1748, height: 2480, dpi: 300 },
    FHD: { width: 1920, height: 1080 },
    '4K': { width: 3840, height: 2160 }
  });

  function pageDimensions(page, stage) {
    if (page === 'current') {
      const bounds = stage.getBoundingClientRect();
      return { width: Math.max(1, Math.round(bounds.width)), height: Math.max(1, Math.round(bounds.height)) };
    }
    if (!Object.prototype.hasOwnProperty.call(pageSizes, page)) throw new Error('Choose a valid page size.');
    return pageSizes[page];
  }

  function fitCanvas(canvas, stage, width, height, current) {
    if (current) {
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      return;
    }
    const bounds = stage.getBoundingClientRect();
    const scale = Math.min(bounds.width / width, bounds.height / height);
    canvas.style.width = `${width * scale}px`;
    canvas.style.height = `${height * scale}px`;
  }

  function pngWithDpi(bytes, dpi) {
    const signature = [137, 80, 78, 71, 13, 10, 26, 10];
    if (!signature.every((value, index) => bytes[index] === value)) throw new Error('Could not read the PNG image.');
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const chunk = new Uint8Array(21);
    const chunkView = new DataView(chunk.buffer);
    chunkView.setUint32(0, 9);
    chunk.set([112, 72, 89, 115], 4);
    // PNG stores print resolution as pixels per meter in a pHYs chunk.
    const pixelsPerMeter = Math.round(dpi / 0.0254);
    chunkView.setUint32(8, pixelsPerMeter);
    chunkView.setUint32(12, pixelsPerMeter);
    chunk[16] = 1;
    let crc = 0xffffffff;
    for (const byte of chunk.subarray(4, 17)) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
    chunkView.setUint32(17, (crc ^ 0xffffffff) >>> 0);

    const parts = [bytes.subarray(0, 8)];
    let offset = 8;
    let inserted = false;
    let ended = false;
    while (offset + 12 <= bytes.length) {
      const length = view.getUint32(offset);
      const end = offset + length + 12;
      if (end > bytes.length) throw new Error('Could not read the PNG image.');
      const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
      if (type !== 'pHYs') parts.push(bytes.subarray(offset, end));
      if (type === 'IHDR') {
        parts.push(chunk);
        inserted = true;
      }
      offset = end;
      if (type === 'IEND') {
        ended = true;
        break;
      }
    }
    if (!inserted || !ended || offset !== bytes.length) throw new Error('Could not read the PNG image.');
    return new Blob(parts, { type: 'image/png' });
  }

  async function savePng(canvas, name, dpi) {
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('Could not prepare the PNG image.');
    const output = dpi ? pngWithDpi(new Uint8Array(await blob.arrayBuffer()), dpi) : blob;
    const url = URL.createObjectURL(output);
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function copyText(text, input) {
    if (navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(text);
        return;
      } catch (error) {
        if (!document.queryCommandSupported('copy')) throw error;
      }
    }
    input.focus();
    input.select();
    if (!document.execCommand('copy')) {
      throw new Error('Clipboard access was denied by the browser.');
    }
  }

  globalThis.AhramanArtwork = { pageSizes, pageDimensions, fitCanvas, pngWithDpi, savePng, copyText };
})();
