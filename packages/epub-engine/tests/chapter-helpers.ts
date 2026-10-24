/** Wraps body content in a minimal XHTML chapter. */
export function chapter(body: string, head = ''): string {
  return (
    '<?xml version="1.0" encoding="utf-8"?>\n' +
    '<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">\n' +
    `<head>${head}</head>\n<body>${body}</body>\n</html>\n`
  )
}
