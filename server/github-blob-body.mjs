// A multiple-of-three source size avoids base64 padding between chunks.
const BLOCK = 48 * 1024;
export function githubBlobBody(bytes) {
  const encoder = new TextEncoder(); let offset = 0, started = false;
  return new ReadableStream({
    pull(controller) {
      if (!started) { started = true; controller.enqueue(encoder.encode('{"encoding":"base64","content":"')); return; }
      if (offset < bytes.length) {
        const end = Math.min(offset + BLOCK, bytes.length);
        controller.enqueue(encoder.encode(bytes.subarray(offset, end).toString('base64')));
        offset = end; return;
      }
      controller.enqueue(encoder.encode('"}')); controller.close();
    },
  });
}
